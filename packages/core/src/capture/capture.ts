import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { PNG } from "pngjs";
import { AuditConfig, PageEvidence, ProgressEvent, ScreenshotRef, ViewportConfig, ViewportName } from "../schemas/audit.js";
import { AuditPaths } from "../storage/project.js";
import { writeJson } from "../utils/fs.js";
import { stableId } from "../utils/id.js";
import { normalizeUrl, slugFromUrl } from "../utils/url.js";
import { captureAccessibilitySummary } from "./accessibility.js";
import { discoverPages, type CrawlCandidate } from "./discovery.js";
import { extractPage } from "./extraction.js";
import { capturePerformanceSummary } from "./performance.js";
import { classifyPage } from "../review/classification.js";
import { captureInteractionStates } from "./interaction-states.js";
import { buildPageReviewSignals } from "./review-signals.js";
import { resetScrollPosition, settlePageForCapture } from "./render-readiness.js";

export type CaptureResult = {
  pages: PageEvidence[];
  crawlMap: CrawlCandidate[];
  failures: Array<{ url: string; category: string; message: string; attempts: number }>;
};

export async function captureEvidence(
  config: AuditConfig,
  paths: AuditPaths,
  onProgress?: (event: ProgressEvent) => void,
  signal?: AbortSignal,
  validateNavigation?: (url: string) => Promise<void>
): Promise<CaptureResult> {
  signal?.throwIfAborted();
  const browser = await chromium.launch({ headless: true });
  const abort = () => { void browser.close().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const discoveryPage = await newPage(browser, config.viewports.find((viewport) => viewport.name === "desktop") ?? config.viewports[0], config, validateNavigation);
    onProgress?.({ stage: "crawl", message: "Discovering candidate pages" });
    const candidates = await discoverPages(discoveryPage, config);
    await discoveryPage.context().close();
    await writeJson(path.join(paths.auditRoot, "crawl-map.json"), candidates);

    const selectedUrls = new Set<string>();
    const selectedCandidates = candidates.filter((candidate) => {
      if (candidate.status === "failed") return false;
      const effectiveUrl = candidate.canonicalUrl ?? candidate.finalUrl ?? candidate.url;
      if (selectedUrls.has(effectiveUrl)) return false;
      selectedUrls.add(effectiveUrl);
      return true;
    }).slice(0, config.maxPages);
    const pages: PageEvidence[] = [];
    const failures: CaptureResult["failures"] = candidates.filter((candidate) => candidate.status === "failed").map((candidate) => ({
      url: candidate.url,
      category: "crawl_failure",
      message: candidate.failure ?? `Discovery failed${candidate.httpStatus ? ` with HTTP ${candidate.httpStatus}` : ""}.`,
      attempts: 1
    }));
    for (let index = 0; index < selectedCandidates.length; index += 1) {
      signal?.throwIfAborted();
      const candidate = selectedCandidates[index];
      onProgress?.({
        stage: "capture",
        message: `Capturing ${candidate.url}`,
        current: index + 1,
        total: selectedCandidates.length
      });
      const captureUrl = candidate.canonicalUrl ?? candidate.finalUrl ?? candidate.url;
      try {
        const pageEvidence = await capturePageWithRetry(browser, config, paths, captureUrl, index + 1, onProgress, validateNavigation);
        pages.push(pageEvidence);
        await writeJson(path.join(paths.extractedPages, `${pageEvidence.pageId}.json`), pageEvidence);
      } catch (error) {
        failures.push({
          url: captureUrl,
          category: classifyCaptureFailure(error),
          message: error instanceof Error ? error.message : String(error),
          attempts: Math.max(1, config.retries.capture + 1)
        });
      }
    }

    await writeJson(path.join(paths.auditRoot, "capture-failures.json"), {
      schemaVersion: "design-review-workflow.capture-failures.v1",
      auditId: config.auditId,
      generatedAt: new Date().toISOString(),
      failures
    });
    if (pages.length === 0) throw new Error(`No pages could be captured. ${failures[0]?.message ?? "The crawl returned no auditable pages."}`);

    await writeJson(path.join(paths.auditRoot, "page-inventory.json"), pages.map((page) => ({
      pageId: page.pageId,
      url: page.url,
      pageType: page.pageType,
      businessImportance: page.businessImportance,
      title: page.title
    })));

    return {
      pages,
      crawlMap: candidates,
      failures
    };
  } finally {
    signal?.removeEventListener("abort", abort);
    await browser.close().catch(() => undefined);
  }
}

async function capturePageWithRetry(
  browser: Browser,
  config: AuditConfig,
  paths: AuditPaths,
  url: string,
  index: number,
  onProgress?: (event: ProgressEvent) => void,
  validateNavigation?: (url: string) => Promise<void>
): Promise<PageEvidence> {
  const maxAttempts = Math.max(1, config.retries.capture + 1);
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await capturePage(browser, config, paths, url, index, validateNavigation);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      onProgress?.({
        stage: "capture_retry",
        message: `Retrying capture for ${url} after ${classifyCaptureFailure(error)}`,
        current: attempt,
        total: maxAttempts - 1
      });
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? `Failed to capture ${url}`));
}

async function capturePage(browser: Browser, config: AuditConfig, paths: AuditPaths, url: string, index: number, validateNavigation?: (url: string) => Promise<void>): Promise<PageEvidence> {
  const normalizedUrl = normalizeUrl(url) ?? url;
  const pageId = stableId("page", normalizedUrl);
  const slug = slugFromUrl(normalizedUrl);
  const screenshots: Record<string, ScreenshotRef> = {};
  const interactionStates: PageEvidence["interactionStates"] = [];
  const captureActions: NonNullable<PageEvidence["captureActions"]> = [];
  const extractions: Partial<Record<ViewportName, Awaited<ReturnType<typeof extractPage>>>> = {};
  const accessibilityByViewport: NonNullable<PageEvidence["accessibilityByViewport"]> = {};
  const performanceByViewport: NonNullable<PageEvidence["performanceByViewport"]> = {};

  for (const viewport of config.viewports) {
    const page = await newPage(browser, viewport, config, validateNavigation);
    try {
      const consentAction = await gotoForAudit(page, normalizedUrl);
      if (consentAction) captureActions.push({ viewport: viewport.name, action: "consent_banner_dismissed", detail: consentAction });
      await settlePageForCapture(page, config.capture);
      const folder = viewport.name === "desktop" ? paths.screenshotsDesktop : paths.screenshotsMobile;
      const aboveFold = await saveScreenshot(page, folder, pageId, slug, viewport, "above_fold");
      const fullPage = await saveScreenshot(page, folder, pageId, slug, viewport, "full_page");
      screenshots[aboveFold.id] = aboveFold;
      screenshots[fullPage.id] = fullPage;

      await resetScrollPosition(page);
      const extraction = await extractPage(page, viewport.name);
      extractions[viewport.name] = extraction;

      accessibilityByViewport[viewport.name] = await captureAccessibilitySummary(page);
      performanceByViewport[viewport.name] = await capturePerformanceSummary(page, normalizedUrl, paths.auditRoot, pageId);

      if (config.interactions.level >= 1 && config.interactions.captureStates) {
        const remainingPageStates = Math.max(0, config.interactions.maxStateCapturesPerPage - interactionStates.length);
        const states = await captureInteractionStates(page, paths.screenshotsStates, pageId, slug, viewport, config, remainingPageStates);
        for (const screenshot of states.screenshots) {
          screenshots[screenshot.id] = screenshot;
        }
        interactionStates.push(...states.states);
      }
    } finally {
      await page.context().close();
    }
  }

  const desktopExtraction = extractions.desktop;
  if (!desktopExtraction) {
    throw new Error(`Failed to extract desktop evidence for ${normalizedUrl}`);
  }
  const mobileExtraction = extractions.mobile;

  const classification = classifyPage(normalizedUrl, desktopExtraction);

  return {
    pageId,
    url: normalizedUrl,
    normalizedUrl,
    title: desktopExtraction.title,
    language: desktopExtraction.language,
    pageType: classification.pageType,
    pageTypeConfidence: classification.confidence,
    businessImportance: classification.businessImportance,
    primaryUserGoal: classification.primaryUserGoal,
    screenshots,
    interactionStates,
    captureActions,
    text: {
      headings: desktopExtraction.headings,
      buttons: desktopExtraction.buttons,
      links: desktopExtraction.links,
      forms: desktopExtraction.forms,
      imagesMissingAlt: desktopExtraction.imagesMissingAlt,
      imageCount: desktopExtraction.imageCount,
      visibleTextSample: desktopExtraction.visibleTextSample
    },
    structure: {
      sections: [...desktopExtraction.sections, ...(mobileExtraction?.sections ?? [])],
      components: [...desktopExtraction.components, ...(mobileExtraction?.components ?? [])],
      navigation: desktopExtraction.navigation,
      footerText: desktopExtraction.footerText
    },
    cssSignals: desktopExtraction.cssSignals,
    reviewSignals: buildPageReviewSignals(desktopExtraction, mobileExtraction),
    performance: performanceByViewport.desktop ?? performanceByViewport.mobile,
    performanceByViewport,
    accessibility: accessibilityByViewport.desktop ?? accessibilityByViewport.mobile,
    accessibilityByViewport
  };
}

function classifyCaptureFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/timeout|timed out/i.test(message)) return "capture_timeout";
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN|DNS/i.test(message)) return "capture_dns";
  if (/ERR_SSL|certificate|TLS/i.test(message)) return "capture_tls";
  if (/net::ERR|ECONN|socket|network|fetch/i.test(message)) return "capture_network";
  return "capture_error";
}

async function newPage(browser: Browser, viewport: ViewportConfig, config: AuditConfig, validateNavigation?: (url: string) => Promise<void>): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
    reducedMotion: config.capture.reducedMotion ? "reduce" : "no-preference",
    userAgent:
      viewport.name === "mobile"
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : undefined
  });
  await context.addInitScript(() => {
    const metrics = { largestContentfulPaintMs: undefined as number | undefined, cumulativeLayoutShift: 0, longTaskCount: 0, totalLongTaskMs: 0 };
    (window as unknown as { __wdrObservedMetrics: typeof metrics }).__wdrObservedMetrics = metrics;
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const latest = entries.at(-1);
        if (latest) metrics.largestContentfulPaintMs = Math.round(latest.startTime);
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
          if (!entry.hadRecentInput) metrics.cumulativeLayoutShift += entry.value ?? 0;
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          metrics.longTaskCount += 1;
          metrics.totalLongTaskMs += entry.duration;
        }
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // Individual browsers may not expose every observer type.
    }
  });
  if (validateNavigation) {
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (request.isNavigationRequest()) {
        try {
          await validateNavigation(request.url());
        } catch {
          await route.abort("blockedbyclient");
          return;
        }
      }
      await route.continue();
    });
  }
  return context.newPage();
}

async function gotoForAudit(page: Page, url: string): Promise<string | undefined> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  return dismissCommonCookieBanners(page);
}

async function dismissCommonCookieBanners(page: Page): Promise<string | undefined> {
  const patterns = [/^(accept( all)?( cookies)?)$/i, /^(agree|allow all)$/i, /^(alle akzeptieren|alle cookies akzeptieren|zustimmen)$/i];
  const containers = page.locator('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [aria-label*="cookie" i], [aria-label*="consent" i], [role="dialog"]');
  for (const pattern of patterns) {
    const button = containers.getByRole("button", { name: pattern }).first();
    if (await button.isVisible({ timeout: 800 }).catch(() => false)) {
      const label = (await button.textContent().catch(() => undefined))?.trim() || pattern.source;
      const clicked = await button.click({ timeout: 1_000 }).then(() => true, () => false);
      if (clicked) return label;
    }
  }
  return undefined;
}

async function saveScreenshot(
  page: Page,
  folder: string,
  pageId: string,
  slug: string,
  viewport: ViewportConfig,
  kind: "above_fold" | "full_page"
): Promise<ScreenshotRef> {
  const id = `${pageId}_${viewport.name}_${kind}`;
  const fileName = `${slug}_${viewport.name}_${kind}.png`;
  const filePath = path.join(folder, fileName);
  await page.screenshot({ path: filePath, fullPage: kind === "full_page" });
  const dimensions = await readPngDimensions(filePath, { width: viewport.width, height: viewport.height });
  return {
    id,
    viewport: viewport.name,
    kind,
    path: path.relative(path.dirname(path.dirname(folder)), filePath),
    width: dimensions.width,
    height: dimensions.height
  };
}

async function readPngDimensions(filePath: string, fallback: { width: number; height: number }): Promise<{ width: number; height: number }> {
  try {
    const png = PNG.sync.read(await readFile(filePath));
    return { width: png.width, height: png.height };
  } catch {
    return fallback;
  }
}
