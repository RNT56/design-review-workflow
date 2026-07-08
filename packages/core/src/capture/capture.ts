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
import { discoverPages } from "./discovery.js";
import { extractPage } from "./extraction.js";
import { capturePerformanceSummary } from "./performance.js";
import { classifyPage } from "../review/classification.js";
import { captureInteractionStates } from "./interaction-states.js";
import { buildPageReviewSignals } from "./review-signals.js";
import { resetScrollPosition, settlePageForCapture } from "./render-readiness.js";

export type CaptureResult = {
  pages: PageEvidence[];
  crawlMap: Array<{ url: string; sourceUrl?: string; depth: number; score: number }>;
};

export async function captureEvidence(
  config: AuditConfig,
  paths: AuditPaths,
  onProgress?: (event: ProgressEvent) => void
): Promise<CaptureResult> {
  const browser = await chromium.launch({ headless: true });
  try {
    const discoveryPage = await newPage(browser, config.viewports.find((viewport) => viewport.name === "desktop") ?? config.viewports[0], config);
    onProgress?.({ stage: "crawl", message: "Discovering candidate pages" });
    const candidates = await discoverPages(discoveryPage, config);
    await discoveryPage.context().close();
    await writeJson(path.join(paths.auditRoot, "crawl-map.json"), candidates);

    const pages: PageEvidence[] = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      onProgress?.({
        stage: "capture",
        message: `Capturing ${candidate.url}`,
        current: index + 1,
        total: candidates.length
      });
      const pageEvidence = await capturePageWithRetry(browser, config, paths, candidate.url, index + 1, onProgress);
      pages.push(pageEvidence);
      await writeJson(path.join(paths.extractedPages, `${pageEvidence.pageId}.json`), pageEvidence);
    }

    await writeJson(path.join(paths.auditRoot, "page-inventory.json"), pages.map((page) => ({
      pageId: page.pageId,
      url: page.url,
      pageType: page.pageType,
      businessImportance: page.businessImportance,
      title: page.title
    })));

    return {
      pages,
      crawlMap: candidates
    };
  } finally {
    await browser.close();
  }
}

async function capturePageWithRetry(
  browser: Browser,
  config: AuditConfig,
  paths: AuditPaths,
  url: string,
  index: number,
  onProgress?: (event: ProgressEvent) => void
): Promise<PageEvidence> {
  const maxAttempts = Math.max(1, config.retries.capture + 1);
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await capturePage(browser, config, paths, url, index);
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

async function capturePage(browser: Browser, config: AuditConfig, paths: AuditPaths, url: string, index: number): Promise<PageEvidence> {
  const normalizedUrl = normalizeUrl(url) ?? url;
  const pageId = stableId("page", normalizedUrl, index);
  const slug = slugFromUrl(normalizedUrl);
  const screenshots: Record<string, ScreenshotRef> = {};
  const interactionStates: PageEvidence["interactionStates"] = [];
  const extractions: Partial<Record<ViewportName, Awaited<ReturnType<typeof extractPage>>>> = {};
  let accessibility: PageEvidence["accessibility"];
  let performance: PageEvidence["performance"];

  for (const viewport of config.viewports) {
    const page = await newPage(browser, viewport, config);
    try {
      await gotoForAudit(page, normalizedUrl);
      await settlePageForCapture(page, config.capture);
      const folder = viewport.name === "desktop" ? paths.screenshotsDesktop : paths.screenshotsMobile;
      const aboveFold = await saveScreenshot(page, folder, pageId, slug, viewport, "above_fold");
      const fullPage = await saveScreenshot(page, folder, pageId, slug, viewport, "full_page");
      screenshots[aboveFold.id] = aboveFold;
      screenshots[fullPage.id] = fullPage;

      await resetScrollPosition(page);
      const extraction = await extractPage(page, viewport.name);
      extractions[viewport.name] = extraction;

      if (viewport.name === "desktop") {
        accessibility = await captureAccessibilitySummary(page);
        performance = await capturePerformanceSummary(page, normalizedUrl, paths.auditRoot, pageId);
      }

      if (config.interactions.level >= 1 && config.interactions.captureStates) {
        const states = await captureInteractionStates(page, paths.screenshotsStates, pageId, slug, viewport, config);
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
    performance,
    accessibility
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

async function newPage(browser: Browser, viewport: ViewportConfig, config: AuditConfig): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    reducedMotion: config.capture.reducedMotion ? "reduce" : "no-preference",
    userAgent:
      viewport.name === "mobile"
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : undefined
  });
  return context.newPage();
}

async function gotoForAudit(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await dismissCommonCookieBanners(page);
}

async function dismissCommonCookieBanners(page: Page): Promise<void> {
  const patterns = [/accept/i, /agree/i, /allow all/i, /alle akzeptieren/i, /zustimmen/i, /ok/i];
  for (const pattern of patterns) {
    const button = page.getByRole("button", { name: pattern }).first();
    if (await button.isVisible({ timeout: 800 }).catch(() => false)) {
      await button.click({ timeout: 1_000 }).catch(() => undefined);
      return;
    }
  }
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
