import { createRequire } from "node:module";
import type { Page } from "playwright";
import { AccessibilitySummary } from "../schemas/audit.js";

const require = createRequire(import.meta.url);

export async function captureAccessibilitySummary(page: Page): Promise<AccessibilitySummary> {
  try {
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const result = await page.evaluate(async () => {
      const axe = (window as unknown as { axe?: { run: () => Promise<{ violations: Array<{ id: string; impact?: string; description: string; nodes: unknown[] }> }> } }).axe;
      if (!axe) {
        throw new Error("axe-core did not attach to the page");
      }
      return axe.run();
    });

    const summary = result.violations.reduce(
      (acc, violation) => {
        acc.violationCount += 1;
        if (violation.impact === "critical") acc.critical += 1;
        if (violation.impact === "serious") acc.serious += 1;
        if (violation.impact === "moderate") acc.moderate += 1;
        if (violation.impact === "minor") acc.minor += 1;
        return acc;
      },
      { violationCount: 0, critical: 0, serious: 0, moderate: 0, minor: 0 }
    );

    return {
      status: "completed",
      ...summary,
      topViolations: result.violations.slice(0, 8).map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        description: violation.description,
        nodes: violation.nodes.length
      }))
    };
  } catch (error) {
    return {
      status: "failed",
      violationCount: 0,
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
      topViolations: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
