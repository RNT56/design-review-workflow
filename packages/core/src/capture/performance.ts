import type { Page } from "playwright";
import { PerformanceSummary } from "../schemas/audit.js";

export async function capturePerformanceSummary(page: Page, url: string, _auditRoot: string, _pageId: string): Promise<PerformanceSummary> {
  try {
    const metrics = await page.evaluate((pageUrl) => {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const paint = performance.getEntriesByType("paint") as PerformancePaintTiming[];
      const byName = new Map(paint.map((entry) => [entry.name, entry.startTime]));
      const pageOrigin = new URL(pageUrl).origin;
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const resourcesWithMeta = resources.map((entry) => {
        let origin: string | undefined;
        let thirdParty = false;
        try {
          origin = new URL(entry.name).origin;
          thirdParty = origin !== pageOrigin;
        } catch {
          origin = undefined;
        }
        return {
          url: entry.name,
          origin,
          initiatorType: entry.initiatorType || undefined,
          transferSizeKb: entry.transferSize ? Math.round(entry.transferSize / 1024) : undefined,
          durationMs: Math.round(entry.duration),
          thirdParty
        };
      });
      const thirdPartyOrigins = [
        ...new Set(resourcesWithMeta.filter((entry) => entry.thirdParty && entry.origin).map((entry) => entry.origin as string))
      ].sort();

      return {
        domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : undefined,
        loadEventMs: navigation ? Math.round(navigation.loadEventEnd) : undefined,
        firstPaintMs: byName.has("first-paint") ? Math.round(byName.get("first-paint") ?? 0) : undefined,
        firstContentfulPaintMs: byName.has("first-contentful-paint") ? Math.round(byName.get("first-contentful-paint") ?? 0) : undefined,
        transferSizeKb: navigation?.transferSize ? Math.round(navigation.transferSize / 1024) : undefined,
        resourceSummary: {
          totalResources: resourcesWithMeta.length,
          scripts: resourcesWithMeta.filter((entry) => entry.initiatorType === "script").length,
          stylesheets: resourcesWithMeta.filter((entry) => entry.initiatorType === "link" || entry.initiatorType === "css").length,
          images: resourcesWithMeta.filter((entry) => entry.initiatorType === "img" || entry.initiatorType === "image").length,
          fonts: resourcesWithMeta.filter((entry) => entry.initiatorType === "font").length,
          media: resourcesWithMeta.filter((entry) => entry.initiatorType === "video" || entry.initiatorType === "audio").length,
          thirdPartyResources: resourcesWithMeta.filter((entry) => entry.thirdParty).length,
          thirdPartyOrigins: thirdPartyOrigins.slice(0, 50),
          largestResources: resourcesWithMeta
            .sort((a, b) => (b.transferSizeKb ?? 0) - (a.transferSizeKb ?? 0))
            .slice(0, 25)
        }
      };
    }, url);

    return {
      status: "completed",
      source: "browser_navigation_timing",
      ...metrics,
      lighthouse: skippedLighthouseSummary()
    };
  } catch (error) {
    return {
      status: "failed",
      source: "browser_navigation_timing",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function skippedLighthouseSummary(): NonNullable<PerformanceSummary["lighthouse"]> {
  return {
    status: "skipped",
    error: "Lighthouse is not bundled in this workflow; use a dedicated performance audit when Lighthouse-grade metrics are required."
  };
}
