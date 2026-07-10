import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { writeJson } from "../utils/fs.js";
import { findingFingerprint } from "../utils/id.js";
import { createAuditConfig } from "../config/defaults.js";
import type { AuditReport, Finding } from "../schemas/audit.js";
import { applySuppressionLedger } from "./suppressions.js";

describe("suppression ledger", () => {
  it("matches stable fingerprints and separates active, expired, and unmatched entries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-suppressions-"));
    const finding: Finding = {
      findingId: "finding_run_specific",
      source: "deterministic",
      title: "Primary action is unclear",
      category: "conversion",
      severity: "high",
      priorityScore: 80,
      impact: "high",
      effort: "medium",
      confidence: "high",
      evidence: { pageId: "page_1", url: "https://example.com/", screenshotRefs: [], textQuotes: [] },
      observation: "The primary action is not visually distinct enough to guide the next decision.",
      whyItMatters: "A weak action hierarchy makes the intended next step harder to identify.",
      recommendation: "Create one clearly dominant primary action with specific language and restrained secondary actions.",
      designPrinciples: ["hierarchy"],
      implementation: { owner: ["designer"], acceptanceCriteria: ["One primary action is dominant."], dependencies: [], definitionOfDone: [] },
      relatedFindings: []
    };
    const fingerprint = findingFingerprint(finding);
    const config = { ...createAuditConfig({ url: "https://example.com/" }), auditId: "scan_suppressions" };
    const scoreItem = { score: 70, confidence: "high" as const, rationale: "Fixture score." };
    const report: AuditReport = {
      auditId: config.auditId,
      generatedAt: "2026-07-10T00:00:00.000Z",
      config,
      businessGradeStatus: "automated_scan",
      websiteType: "unknown",
      websiteTypeConfidence: "low",
      pages: [],
      findings: [{ ...finding, fingerprint }],
      groupedIssues: [],
      quickWins: [],
      scorecard: {
        overallScore: 70,
        confidence: "high",
        subscores: {
          visualDesignQuality: scoreItem,
          uxClarityNavigation: scoreItem,
          conversionReadiness: scoreItem,
          mobileExperience: scoreItem,
          brandFitTrust: scoreItem,
          contentDesignUxWriting: scoreItem,
          accessibilityBasics: scoreItem,
          performancePerception: scoreItem,
          designSystemConsistency: scoreItem
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
    await writeJson(path.join(root, "report", "report.json"), report);
    const ledgerPath = path.join(root, "suppressions.json");
    await writeJson(ledgerPath, {
      schemaVersion: "design-review-workflow.suppressions.v2",
      suppressions: [
        { fingerprint, reason: "Accepted until the redesign work begins.", owner: "design", expiresAt: "2026-12-31" },
        { findingId: "finding_run_specific", reason: "Old temporary exception for validation.", owner: "design", expiresAt: "2025-01-01" },
        { findingId: "missing", reason: "Unmatched entry should remain visible.", owner: "design" }
      ]
    });
    const result = await applySuppressionLedger(root, ledgerPath, new Date("2026-07-10T00:00:00.000Z"));
    expect(result.report.suppressionsApplied).toBe(1);
    expect(result.report.suppressionsExpired).toBe(1);
    expect(result.report.suppressionsUnmatched).toBe(1);
    expect(result.report.suppressedFindingFingerprints).toEqual([fingerprint]);
  });
});
