import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createAuditConfig } from "../config/defaults.js";
import type { AuditReport } from "../schemas/audit.js";
import { writeJson } from "../utils/fs.js";
import { planAuditRetention } from "./retention.js";

describe("planAuditRetention", () => {
  it("builds a non-destructive retention plan from audit policy", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-retention-"));
    const reportDir = path.join(root, "report");
    await mkdir(path.join(root, "screenshots", "desktop"), { recursive: true });
    await mkdir(path.join(root, "agent-runs", "provider"), { recursive: true });
    await mkdir(path.join(root, "exports"), { recursive: true });
    await writeFile(path.join(root, "screenshots", "desktop", "one.png"), "png", "utf8");
    await writeFile(path.join(root, "agent-runs", "provider", "visual-review.raw.json"), "{}", "utf8");
    await writeFile(path.join(root, "exports", "bundle.zip"), "zip", "utf8");
    await writeJson(path.join(reportDir, "report.json"), sampleReport());

    const plan = await planAuditRetention(root);

    expect(plan.totals.files).toBe(3);
    expect(plan.totals.cleanupCandidates).toBe(2);
    expect(plan.groups.find((group) => group.name === "screenshots")?.cleanupCandidate).toBe(true);
    expect(plan.groups.find((group) => group.name === "exports")?.cleanupCandidate).toBe(false);
  });
});

function sampleReport(): AuditReport {
  const config = createAuditConfig({
    url: "https://example.com",
    retention: {
      screenshots: "plan_cleanup",
      providerPayloads: "plan_cleanup",
      exports: "keep",
      dryRunOnly: true
    }
  });
  return {
    auditId: config.auditId,
    generatedAt: "2026-07-08T00:00:00.000Z",
    config,
    businessGradeStatus: "automated_scan",
    websiteType: "unknown",
    websiteTypeConfidence: "low",
    pages: [],
    findings: [],
    groupedIssues: [],
    quickWins: [],
    scorecard: {
      overallScore: 70,
      confidence: "high",
      subscores: {
        visualDesignQuality: scoreItem(),
        uxClarityNavigation: scoreItem(),
        conversionReadiness: scoreItem(),
        mobileExperience: scoreItem(),
        brandFitTrust: scoreItem(),
        contentDesignUxWriting: scoreItem(),
        accessibilityBasics: scoreItem(),
        performancePerception: scoreItem(),
        designSystemConsistency: scoreItem()
      },
      weights: {},
      websiteTypeAdjustment: "none",
      topStrengths: [],
      topRisks: []
    },
    screenshotAnnotations: [],
    competitorBenchmarks: [],
    redesignBriefing: [],
    tickets: [],
    assumptions: [],
    limitations: []
  };
}

function scoreItem() {
  return {
    score: 70,
    confidence: "high" as const,
    rationale: "test"
  };
}
