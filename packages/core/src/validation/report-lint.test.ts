import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { AuditReport, Scorecard } from "../schemas/audit.js";
import { writeReports } from "../report/index.js";
import { createNestedAuditPaths } from "../storage/project.js";
import { writeText } from "../utils/fs.js";
import { lintAuditReport } from "./report-lint.js";

describe("lintAuditReport", () => {
  it("validates and refreshes an agent handoff bundle", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-lint-"));
    const auditRoot = path.join(root, "projects", "example-com", "audits", "audit_1");
    const paths = await createNestedAuditPaths(auditRoot);
    const report = sampleReport();

    await writeText(path.join(auditRoot, "screenshots", "desktop", "page_1_desktop_above_fold.png"), "png");
    await writeReports(report.config, report, paths);

    const result = await lintAuditReport(auditRoot, true);

    expect(result.status).toBe("pass");
    expect(result.summary.findings).toBe(1);
    expect(JSON.parse(await readFile(path.join(paths.report, "quality-gate.json"), "utf8")).status).toBe("pass");
    expect(JSON.parse(await readFile(path.join(paths.report, "workflow-manifest.json"), "utf8")).qualityGate.status).toBe("pass");
    expect(JSON.parse(await readFile(path.join(paths.report, "handoff.json"), "utf8")).qualityGate.status).toBe("pass");
    const auditIndex = await readFile(path.join(auditRoot, "index.html"), "utf8");
    expect(auditIndex).toContain("Website Design Review");
    expect(auditIndex).toContain("report/report.json");
    expect(auditIndex).toContain("screenshots/desktop/page_1_desktop_above_fold.png");
    expect(auditIndex).not.toContain(auditRoot);
  });
});

function sampleReport(): AuditReport {
  const screenshot = {
    id: "page_1_desktop_above_fold",
    viewport: "desktop" as const,
    kind: "above_fold" as const,
    path: "screenshots/desktop/page_1_desktop_above_fold.png",
    width: 1440,
    height: 1000
  };
  const finding = {
    findingId: "finding_1",
    source: "deterministic" as const,
    title: "Primary action needs clearer hierarchy",
    category: "conversion" as const,
    severity: "high" as const,
    priorityScore: 82,
    impact: "high" as const,
    effort: "medium" as const,
    confidence: "high" as const,
    evidence: {
      pageId: "page_1",
      url: "https://example.com/",
      viewport: "desktop" as const,
      section: "hero",
      screenshotRefs: [screenshot.id],
      textQuotes: ["Example Domain"]
    },
    observation: "The hero area does not make one next action visually dominant in captured evidence.",
    whyItMatters: "A clear primary action reduces decision friction for users who understand the offer.",
    recommendation: "Make one primary CTA visually dominant and keep secondary actions subordinate.",
    designPrinciples: ["hierarchy"],
    implementation: {
      owner: ["designer" as const, "developer" as const],
      acceptanceCriteria: ["One primary CTA is visually dominant."],
      dependencies: [],
      definitionOfDone: ["A rerun shows the issue is no longer present."]
    },
    relatedFindings: []
  };

  return {
    auditId: "audit_1",
    generatedAt: "2026-07-06T00:00:00.000Z",
    config: {
      auditId: "audit_1",
      mode: "quick_scan",
      url: "https://example.com/",
      maxPages: 1,
      language: "auto",
      competitors: [],
      relatedWorkflows: [],
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
    websiteType: "unknown",
    websiteTypeConfidence: "low",
    businessGradeStatus: "automated_scan",
    pages: [
      {
        pageId: "page_1",
        url: "https://example.com/",
        normalizedUrl: "https://example.com/",
        title: "Example Domain",
        language: "en",
        pageType: "homepage",
        pageTypeConfidence: "high",
        businessImportance: "high",
        primaryUserGoal: "Understand the offer",
        screenshots: { [screenshot.id]: screenshot },
        interactionStates: [],
        text: {
          headings: [{ text: "Example Domain", tag: "h1", visible: true }],
          buttons: [],
          links: [],
          forms: [],
          imagesMissingAlt: 0,
          imageCount: 0,
          visibleTextSample: "Example Domain"
        },
        structure: { sections: [], components: [], navigation: [] }
      }
    ],
    findings: [finding],
    groupedIssues: [],
    quickWins: [],
    scorecard: scorecard(),
    screenshotAnnotations: [],
    competitorBenchmarks: [],
    redesignBriefing: [{ title: "Starting point", body: "A minimal report for tests." }],
    tickets: [
      {
        title: finding.title,
        role: finding.implementation.owner,
        priority: finding.severity,
        effort: finding.effort,
        sourceFindingIds: [finding.findingId],
        problem: finding.observation,
        goal: finding.recommendation,
        scope: ["hero"],
        acceptanceCriteria: finding.implementation.acceptanceCriteria,
        definitionOfDone: finding.implementation.definitionOfDone,
        evidenceRefs: [screenshot.id, "https://example.com/"]
      }
    ],
    assumptions: [],
    limitations: []
  };
}

function scorecard(): Scorecard {
  return {
    overallScore: 83,
    confidence: "high",
    subscores: {
      visualDesignQuality: item(85),
      uxClarityNavigation: item(82),
      conversionReadiness: item(76),
      mobileExperience: item(84),
      brandFitTrust: item(80),
      contentDesignUxWriting: item(86),
      accessibilityBasics: item(88),
      performancePerception: item(90),
      designSystemConsistency: item(78)
    },
    weights: {},
    websiteTypeAdjustment: "none",
    topStrengths: [],
    topRisks: []
  };
}

function item(score: number) {
  return { score, confidence: "high" as const, rationale: "test" };
}
