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
import { buildPageReviewSignals } from "./review-signals.js";

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
    const discoveryPage = await newPage(browser, config.viewports.find((viewport) => viewport.name === "desktop") ?? config.viewports[0]);
    onProgress?.({ stage: "crawl", message: "Discovering candidate pages" });
    const candidates = await discoverPages(discoveryPage, config);
    await discoveryPage.close();
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
      const pageEvidence = await capturePage(browser, config, paths, candidate.url, index + 1);
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

async function capturePage(browser: Browser, config: AuditConfig, paths: AuditPaths, url: string, index: number): Promise<PageEvidence> {
  const normalizedUrl = normalizeUrl(url) ?? url;
  const pageId = stableId("page", normalizedUrl, index);
  const slug = slugFromUrl(normalizedUrl);
  const screenshots: Record<string, ScreenshotRef> = {};
  const extractions: Partial<Record<ViewportName, Awaited<ReturnType<typeof extractPage>>>> = {};
  let accessibility: PageEvidence["accessibility"];
  let performance: PageEvidence["performance"];

  for (const viewport of config.viewports) {
    const page = await newPage(browser, viewport);
    try {
      await gotoForAudit(page, normalizedUrl);
      const folder = viewport.name === "desktop" ? paths.screenshotsDesktop : paths.screenshotsMobile;
      const aboveFold = await saveScreenshot(page, folder, pageId, slug, viewport, "above_fold");
      const fullPage = await saveScreenshot(page, folder, pageId, slug, viewport, "full_page");
      screenshots[aboveFold.id] = aboveFold;
      screenshots[fullPage.id] = fullPage;

      const extraction = await extractPage(page, viewport.name);
      extractions[viewport.name] = extraction;

      if (viewport.name === "desktop") {
        accessibility = await captureAccessibilitySummary(page);
        performance = await capturePerformanceSummary(page, normalizedUrl, paths.auditRoot, pageId);
      }

      if (viewport.name === "mobile" && config.interactions.level >= 1) {
        const state = await captureMobileNavigationState(page, paths.screenshotsStates, pageId, slug, viewport);
        if (state) {
          screenshots[state.id] = state;
        }
      }
    } finally {
      await page.close();
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

async function newPage(browser: Browser, viewport: ViewportConfig): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
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

async function captureMobileNavigationState(
  page: Page,
  folder: string,
  pageId: string,
  slug: string,
  viewport: ViewportConfig
): Promise<ScreenshotRef | null> {
  const candidates = [
    page.getByRole("button", { name: /menu|navigation|nav|open|hamburger|menü/i }).first(),
    page.locator("button[aria-expanded='false']").first(),
    page.locator("button").filter({ hasText: /^(\s*|menu|menü)$/i }).first()
  ];

  for (const candidate of candidates) {
    if (!(await candidate.isVisible({ timeout: 700 }).catch(() => false))) {
      continue;
    }
    await candidate.click({ timeout: 1_000 }).catch(() => undefined);
    await page.waitForTimeout(350);
    const id = `${pageId}_mobile_nav_state`;
    const filePath = path.join(folder, `${slug}_mobile_nav_open.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    const dimensions = await readPngDimensions(filePath, { width: viewport.width, height: viewport.height });
    return {
      id,
      viewport: "mobile",
      kind: "state",
      state: "mobile_nav_open",
      path: path.relative(path.dirname(path.dirname(folder)), filePath),
      width: dimensions.width,
      height: dimensions.height
    };
  }

  return null;
}

async function readPngDimensions(filePath: string, fallback: { width: number; height: number }): Promise<{ width: number; height: number }> {
  try {
    const png = PNG.sync.read(await readFile(filePath));
    return { width: png.width, height: png.height };
  } catch {
    return fallback;
  }
}
