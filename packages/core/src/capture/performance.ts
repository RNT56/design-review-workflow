import type { Page } from "playwright";
import * as path from "node:path";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { PerformanceSummary } from "../schemas/audit.js";
import { ensureDir, writeJson } from "../utils/fs.js";

export async function capturePerformanceSummary(page: Page, url: string, auditRoot: string, pageId: string): Promise<PerformanceSummary> {
  try {
    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const paint = performance.getEntriesByType("paint") as PerformancePaintTiming[];
      const byName = new Map(paint.map((entry) => [entry.name, entry.startTime]));

      return {
        domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : undefined,
        loadEventMs: navigation ? Math.round(navigation.loadEventEnd) : undefined,
        firstPaintMs: byName.has("first-paint") ? Math.round(byName.get("first-paint") ?? 0) : undefined,
        firstContentfulPaintMs: byName.has("first-contentful-paint") ? Math.round(byName.get("first-contentful-paint") ?? 0) : undefined,
        transferSizeKb: navigation?.transferSize ? Math.round(navigation.transferSize / 1024) : undefined
      };
    });

    return {
      status: "completed",
      source: "browser_navigation_timing",
      ...metrics,
      lighthouse: await captureLighthouseSummary(url, auditRoot, pageId)
    };
  } catch (error) {
    return {
      status: "failed",
      source: "browser_navigation_timing",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function captureLighthouseSummary(url: string, auditRoot: string, pageId: string): Promise<NonNullable<PerformanceSummary["lighthouse"]>> {
  let chrome: Awaited<ReturnType<typeof chromeLauncher.launch>> | undefined;
  const lighthouseDir = path.join(auditRoot, "extracted", "lighthouse");
  const reportPath = path.join(lighthouseDir, `${pageId}.json`);

  try {
    await ensureDir(lighthouseDir);
    chrome = await chromeLauncher.launch({
      chromeFlags: ["--headless=new", "--disable-gpu", "--no-sandbox"]
    });

    const result = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      logLevel: "silent",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"]
    });

    if (!result?.lhr) {
      throw new Error("Lighthouse did not return a report");
    }

    await writeJson(reportPath, result.lhr);
    const audits = result.lhr.audits;
    const score = (category: string) => {
      const raw = result.lhr.categories[category]?.score;
      return typeof raw === "number" ? Math.round(raw * 100) : undefined;
    };
    const numericAudit = (id: string) => {
      const raw = audits[id]?.numericValue;
      return typeof raw === "number" ? Number(raw.toFixed(2)) : undefined;
    };

    return {
      status: "completed",
      performanceScore: score("performance"),
      accessibilityScore: score("accessibility"),
      bestPracticesScore: score("best-practices"),
      seoScore: score("seo"),
      firstContentfulPaintMs: numericAudit("first-contentful-paint"),
      largestContentfulPaintMs: numericAudit("largest-contentful-paint"),
      totalBlockingTimeMs: numericAudit("total-blocking-time"),
      cumulativeLayoutShift: numericAudit("cumulative-layout-shift"),
      speedIndexMs: numericAudit("speed-index"),
      reportPath: path.relative(auditRoot, reportPath)
    };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    try {
      chrome?.kill();
    } catch {
      // Ignore Chrome cleanup failures; the audit result already captured the Lighthouse state.
    }
  }
}
