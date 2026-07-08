import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { AuditReport, RelatedWorkflowSpec } from "../schemas/audit.js";
import { buildRelatedWorkflowsArtifact } from "./related-workflows.js";

describe("buildRelatedWorkflowsArtifact", () => {
  it("links SEO workflow metadata without merging findings", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-related-seo-"));
    await writeFile(path.join(root, "workflow-manifest.json"), JSON.stringify({ status: "pass" }), "utf8");
    await writeFile(path.join(root, "score.json"), JSON.stringify({ score: 88 }), "utf8");
    await writeFile(path.join(root, "index.html"), "<!doctype html><title>SEO report</title>", "utf8");

    const artifact = await buildRelatedWorkflowsArtifact(report([{ kind: "seo", path: root }]));

    expect(artifact.policy.mergeFindings).toBe(false);
    expect(artifact.policy.affectsDesignScore).toBe(false);
    expect(artifact.workflows[0]).toMatchObject({
      kind: "seo",
      status: "available",
      score: 88,
      qualityGateStatus: "pass"
    });
    expect(artifact.workflows[0].reportPath).toBe(path.join(root, "index.html"));
  });

  it("records missing SEO paths as metadata, not design audit failures", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-related-missing-"));
    const missing = path.join(root, "missing-seo-audit");

    const artifact = await buildRelatedWorkflowsArtifact(report([{ kind: "seo", path: missing }]));

    expect(artifact.workflows[0].status).toBe("missing");
    expect(artifact.workflows[0].limitations.join(" ")).toContain("not found");
  });

  it("discovers report-nested metadata files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-related-nested-"));
    await mkdir(path.join(root, "report"), { recursive: true });
    await writeFile(path.join(root, "report", "quality-gate.json"), JSON.stringify({ status: "warn" }), "utf8");
    await writeFile(path.join(root, "report", "score.json"), JSON.stringify({ scorecard: { overallScore: 71 } }), "utf8");

    const artifact = await buildRelatedWorkflowsArtifact(report([{ kind: "seo", path: root, label: "Launch SEO audit" }]));

    expect(artifact.workflows[0]).toMatchObject({
      label: "Launch SEO audit",
      status: "available",
      score: 71,
      qualityGateStatus: "warn"
    });
  });
});

function report(relatedWorkflows: RelatedWorkflowSpec[]): AuditReport {
  return {
    auditId: "audit_1",
    generatedAt: "2026-07-08T00:00:00.000Z",
    config: {
      auditId: "audit_1",
      mode: "quick_scan",
      url: "https://example.com/",
      maxPages: 1,
      language: "auto",
      competitors: [],
      relatedWorkflows,
      reviewMode: "auto",
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
      retries: { capture: 1, provider: 1, export: 0 },
      privacy: { redactLocalPathsInExports: true, redactSecretsInExports: true, redactCookiesInReports: true },
      retention: { screenshots: "keep", providerPayloads: "keep", exports: "keep", dryRunOnly: true },
      outputs: { markdown: true, html: true, pdf: false, json: true, screenshotAnnotations: "basic" },
      modelRouter: { qualityProfile: "balanced", allowOpenRouter: false, allowOpenAI: false, allowAnthropic: false, allowGemini: false },
      scoring: { strictness: "enterprise", tone: "client_ready" }
    },
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
