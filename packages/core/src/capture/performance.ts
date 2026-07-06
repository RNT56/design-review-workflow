import type { Page } from "playwright";
import { PerformanceSummary } from "../schemas/audit.js";

export async function capturePerformanceSummary(page: Page): Promise<PerformanceSummary> {
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
      ...metrics
    };
  } catch (error) {
    return {
      status: "failed",
      source: "browser_navigation_timing",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
