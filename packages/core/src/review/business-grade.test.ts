import { describe, expect, it } from "vitest";
import type { AgentVisualReview, AuditReport, Finding, PageEvidence, Scorecard } from "../schemas/audit.js";
import { createScorecard } from "./scoring.js";
import { applyAgentVisualReview, evaluateBusinessGradeGate } from "./business-grade.js";

describe("business-grade review gate", () => {
  it("fails without imported visual review", () => {
    const gate = evaluateBusinessGradeGate(sampleReport());

    expect(gate.status).toBe("fail");
    expect(gate.errors.join(" ")).toContain("imported multimodal agent visual review");
  });

  it("rejects visual reviews that reference unknown screenshots", () => {
    const report = sampleReport();
    const review = visualReview({ evidenceRefs: ["missing_screenshot"] });

    expect(() => applyAgentVisualReview(report, review)).toThrow(/unknown screenshot/);
  });

  it("imports validated agent visual findings and passes the business-grade gate", () => {
    const report = sampleReport();
    const updated = applyAgentVisualReview(report, visualReview());
    const gate = evaluateBusinessGradeGate(updated);

    expect(updated.businessGradeStatus).toBe("business_grade");
    expect(updated.findings.some((finding) => finding.source === "agent_visual")).toBe(true);
    expect(updated.groupedIssues.length).toBeGreaterThan(0);
    expect(gate.status).toBe("pass");
    expect(updated.scorecard.overallScore).toBeLessThanOrEqual(98);
  });

  it("caps scores when business-grade status has not passed", () => {
    const page = samplePage();

    expect(createScorecard([], [page], "portfolio", "automated_scan").overallScore).toBeLessThanOrEqual(86);
    expect(createScorecard([], [page], "portfolio", "agent_review_pending").overallScore).toBeLessThanOrEqual(82);
  });
});

function visualReview(overrides: Partial<AgentVisualReview["visualFindings"][number]> = {}): AgentVisualReview {
  return {
    schemaVersion: "design-review-workflow.agent-visual-review.v1",
    reviewer: "codex",
    reviewedAt: "2026-07-07T00:00:00.000Z",
    auditId: "audit_1",
    screenshotsReviewed: ["page_1_desktop_above_fold"],
    pageReviews: [
      {
        pageId: "page_1",
        url: "https://example.com/",
        screenshotsReviewed: ["page_1_desktop_above_fold"],
        firstViewport: "The first viewport explains the offer, but the action area competes with supporting copy.",
        hierarchy: "The layout has a readable structure, though the highest-value action needs stronger visual contrast.",
        navigation: "Navigation is understandable and does not dominate the primary page message.",
        mobile: "The mobile composition keeps the core message visible but should give the action more breathing room.",
        trustAndProof: "Trust proof is present but not close enough to the primary decision point.",
        notes: []
      }
    ],
    visualFindings: [
      {
        reviewId: "visual_1",
        title: "Primary CTA needs stronger first-viewport hierarchy",
        category: "conversion",
        severity: "high",
        impact: "high",
        effort: "medium",
        confidence: "high",
        pageId: "page_1",
        url: "https://example.com/",
        section: "hero",
        evidenceRefs: ["page_1_desktop_above_fold"],
        observation: "The primary action is visible, but it does not create a clear focal point against nearby content.",
        whyItMatters: "A portfolio or service page needs one obvious next step before visitors evaluate details.",
        recommendation: "Increase CTA contrast, spacing, and placement so the primary action reads as the next step.",
        acceptanceCriteria: ["Primary CTA is the dominant action in desktop and mobile first viewports."],
        sourceFindingIds: [],
        ...overrides
      }
    ],
    strengths: ["The first viewport has a clear message and enough structure to review visually."],
    risks: ["Decision proof and action hierarchy can still be tightened."],
    confidence: "high",
    limitations: []
  };
}

function sampleReport(): AuditReport {
  const page = samplePage();
  const finding = sampleFinding();
  return {
    auditId: "audit_1",
    generatedAt: "2026-07-07T00:00:00.000Z",
    config: {
      auditId: "audit_1",
      mode: "quick_scan",
      url: "https://example.com/",
      maxPages: 1,
      language: "auto",
      competitors: [],
      viewports: [{ name: "desktop", width: 1440, height: 1000, deviceScaleFactor: 1, isMobile: false }],
      crawl: { sameDomainOnly: true, includeSubdomains: false, maxDepth: 1, excludePatterns: [] },
      interactions: { level: 1, allowCheckoutStart: false, allowFormErrorChecks: false, allowPurchase: false, allowLogin: false },
      outputs: { markdown: true, html: true, pdf: false, json: true, screenshotAnnotations: "basic" },
      modelRouter: { qualityProfile: "balanced", allowOpenRouter: false, allowOpenAI: false, allowAnthropic: false, allowGemini: false },
      scoring: { strictness: "enterprise", tone: "client_ready" }
    },
    businessGradeStatus: "automated_scan",
    websiteType: "portfolio",
    websiteTypeConfidence: "medium",
    pages: [page],
    findings: [finding],
    groupedIssues: [],
    quickWins: [],
    scorecard: scorecard(),
    screenshotAnnotations: [],
    competitorBenchmarks: [],
    redesignBriefing: [],
    tickets: [],
    assumptions: [],
    limitations: []
  };
}

function samplePage(): PageEvidence {
  return {
    pageId: "page_1",
    url: "https://example.com/",
    normalizedUrl: "https://example.com/",
    title: "Example",
    language: "en",
    pageType: "homepage",
    pageTypeConfidence: "high",
    businessImportance: "high",
    primaryUserGoal: "Understand the offer",
    screenshots: {
      page_1_desktop_above_fold: {
        id: "page_1_desktop_above_fold",
        viewport: "desktop",
        kind: "above_fold",
        path: "screenshots/desktop/page_1_desktop_above_fold.png",
        width: 1440,
        height: 1000
      }
    },
    text: {
      headings: [{ text: "Example", tag: "h1", visible: true }],
      buttons: [],
      links: [],
      forms: [],
      imagesMissingAlt: 0,
      imageCount: 0,
      visibleTextSample: "Example"
    },
    structure: { sections: [], components: [], navigation: [] }
  };
}

function sampleFinding(): Finding {
  return {
    findingId: "finding_1",
    source: "deterministic",
    title: "Primary CTA needs stronger first-viewport hierarchy",
    category: "conversion",
    severity: "medium",
    priorityScore: 70,
    impact: "medium",
    effort: "medium",
    confidence: "high",
    evidence: {
      pageId: "page_1",
      url: "https://example.com/",
      viewport: "desktop",
      section: "hero",
      screenshotRefs: ["page_1_desktop_above_fold"],
      textQuotes: []
    },
    observation: "The deterministic scan identified a primary action hierarchy risk in captured evidence.",
    whyItMatters: "Primary actions need to be obvious for users ready to continue.",
    recommendation: "Make the primary action visually dominant while keeping secondary actions subordinate.",
    designPrinciples: ["hierarchy"],
    implementation: {
      owner: ["designer", "developer"],
      acceptanceCriteria: ["Primary CTA has stronger visual emphasis."],
      dependencies: [],
      definitionOfDone: ["A rerun confirms the CTA is dominant."]
    },
    relatedFindings: []
  };
}

function scorecard(): Scorecard {
  return {
    overallScore: 82,
    confidence: "medium",
    subscores: {
      visualDesignQuality: item(82),
      uxClarityNavigation: item(82),
      conversionReadiness: item(76),
      mobileExperience: item(82),
      brandFitTrust: item(82),
      contentDesignUxWriting: item(82),
      accessibilityBasics: item(82),
      performancePerception: item(82),
      designSystemConsistency: item(82)
    },
    weights: {},
    websiteTypeAdjustment: "test",
    topStrengths: [],
    topRisks: []
  };
}

function item(score: number) {
  return { score, confidence: "medium" as const, rationale: "test" };
}
