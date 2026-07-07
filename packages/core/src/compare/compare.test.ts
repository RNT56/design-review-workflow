import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { compareAuditDirs } from "./compare.js";
import { writeJson } from "../utils/fs.js";
import type { AuditReport } from "../schemas/audit.js";

describe("compareAuditDirs", () => {
  it("computes score and finding deltas", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-compare-"));
    const beforeDir = path.join(root, "before");
    const afterDir = path.join(root, "after");
    await writeJson(path.join(beforeDir, "report", "report.json"), report("before", 70, ["Old issue"]));
    await writeJson(path.join(afterDir, "report", "report.json"), report("after", 80, ["New issue"]));

    const { result } = await compareAuditDirs(beforeDir, afterDir);
    expect(result.scoreDelta).toBe(10);
    expect(result.resolvedFindings).toHaveLength(1);
    expect(result.newFindings).toHaveLength(1);
  });
});

function report(id: string, score: number, findingTitles: string[]): AuditReport {
  const findings = findingTitles.map((title, index) => ({
    findingId: `${id}_${index}`,
    source: "deterministic" as const,
    title,
    category: "ux" as const,
    severity: "medium" as const,
    priorityScore: 60,
    impact: "medium" as const,
    effort: "medium" as const,
    confidence: "high" as const,
    evidence: { pageId: "page_1", url: "https://example.com", screenshotRefs: [], textQuotes: [] },
    observation: "Observation with enough detail.",
    whyItMatters: "Reason with enough detail.",
    recommendation: "Recommendation with enough detail.",
    designPrinciples: [],
    implementation: { owner: ["designer"], acceptanceCriteria: ["Done"], dependencies: [], definitionOfDone: ["Checked"] },
    relatedFindings: []
  }));

  return {
    auditId: id,
    generatedAt: "2026-07-06T00:00:00.000Z",
    config: {
      auditId: id,
      mode: "quick_scan",
      url: "https://example.com",
      maxPages: 1,
      language: "auto",
      competitors: [],
      viewports: [{ name: "desktop", width: 1440, height: 1000, deviceScaleFactor: 1, isMobile: false }],
      capture: { settleScroll: true, reducedMotion: true, waitForImages: true, maxScrollPasses: 2, scrollStepRatio: 0.75, stepDelayMs: 180, settleTimeoutMs: 4000 },
      crawl: { sameDomainOnly: true, includeSubdomains: false, maxDepth: 1, excludePatterns: [] },
      interactions: {
        level: 1,
        captureStates: true,
        maxStateCapturesPerPage: 8,
        maxStateCapturesPerViewport: 5,
        allowCheckoutStart: false,
        allowFormErrorChecks: false,
        allowPurchase: false,
        allowLogin: false
      },
      outputs: { markdown: true, html: true, pdf: false, json: true, screenshotAnnotations: "basic" },
      modelRouter: { qualityProfile: "balanced", allowOpenRouter: false, allowOpenAI: false, allowAnthropic: false, allowGemini: false },
      scoring: { strictness: "enterprise", tone: "client_ready" }
    },
    websiteType: "unknown",
    websiteTypeConfidence: "low",
    businessGradeStatus: "automated_scan",
    pages: [],
    findings,
    groupedIssues: [],
    quickWins: [],
    scorecard: {
      overallScore: score,
      confidence: "high",
      subscores: {
        visualDesignQuality: item(score),
        uxClarityNavigation: item(score),
        conversionReadiness: item(score),
        mobileExperience: item(score),
        brandFitTrust: item(score),
        contentDesignUxWriting: item(score),
        accessibilityBasics: item(score),
        performancePerception: item(score),
        designSystemConsistency: item(score)
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
  } as AuditReport;
}

function item(score: number) {
  return { score, confidence: "high" as const, rationale: "test" };
}
