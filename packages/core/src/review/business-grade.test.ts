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

  it("rejects shallow template visual reviews", () => {
    const report = sampleReport();
    const review = visualReview();
    review.designVerdict.styleAndTaste = "TODO: make it better";

    expect(() => applyAgentVisualReview(report, review)).toThrow(/template\/TODO/);
  });

  it("passes a strong-site verdict with no visual defects when rationale is complete", () => {
    const report = { ...sampleReport(), findings: [], groupedIssues: [] };
    const review = visualReview({}, "no_major_redesign_needed");
    review.visualFindings = [];
    review.redesignActions = [];
    review.designVerdict.rationale =
      "The captured first viewport has a clear offer, coherent hierarchy, visible action, and enough proof density for a business-grade no-major-redesign verdict.";

    const updated = applyAgentVisualReview(report, review);
    const gate = evaluateBusinessGradeGate(updated);

    expect(updated.findings).toHaveLength(0);
    expect(gate.status).toBe("pass");
  });

  it("caps scores when business-grade status has not passed", () => {
    const page = samplePage();

    expect(createScorecard([], [page], "portfolio", "automated_scan").overallScore).toBeLessThanOrEqual(74);
    expect(createScorecard([], [page], "portfolio", "agent_review_pending").overallScore).toBeLessThanOrEqual(82);
  });
});

function visualReview(
  overrides: Partial<AgentVisualReview["visualFindings"][number]> = {},
  readiness: AgentVisualReview["designVerdict"]["readiness"] = "targeted_redesign_recommended"
): AgentVisualReview {
  return {
    schemaVersion: "design-review-workflow.agent-visual-review.v1",
    reviewer: "codex",
    reviewedAt: "2026-07-07T00:00:00.000Z",
    auditId: "audit_1",
    designVerdict: {
      readiness,
      styleAndTaste: "The visual style is restrained and credible, but the action area needs a sharper editorial hierarchy to feel fully intentional.",
      messagingAndCopy: "The messaging is understandable and calm, but the hero copy should make the audience, proof, and next action more specific.",
      audienceFit: "The design language fits a professional service audience that needs clarity, confidence, and a fast read of the offer.",
      brandFit: "The brand impression is competent and calm, though stronger proof placement would make the positioning feel more distinctive.",
      strongestDesignQualities: ["The first viewport has a clear message and enough structure to review visually."],
      weakestDesignRisks: ["Decision proof and action hierarchy can still be tightened before the page feels fully persuasive."],
      redesignDirection: "Preserve the calm structure, but increase the contrast, spacing, and proof proximity around the main action.",
      rationale: "The screenshot evidence shows a readable page with a visible offer, but the design still needs targeted refinement around action hierarchy.",
      confidence: "high",
      limitations: ["Only the captured public page screenshots were reviewed."]
    },
    screenshotsReviewed: ["page_1_desktop_above_fold"],
    pageReviews: [
      {
        pageId: "page_1",
        url: "https://example.com/",
        screenshotsReviewed: ["page_1_desktop_above_fold"],
        firstViewport: "The first viewport explains the offer, but the action area competes with supporting copy.",
        hierarchy: "The layout has a readable structure, though the highest-value action needs stronger visual contrast.",
        composition: "The composition is balanced enough to scan, but spacing around the main action should create a stronger focal point.",
        navigation: "Navigation is understandable and does not dominate the primary page message.",
        ctaClarity: "The CTA is visible, but it needs stronger contrast and placement to read as the primary next step.",
        messagingAndCopy: "The page copy communicates the general offer, but the headline support and CTA wording need more specificity and decision support.",
        mobile: "The mobile composition keeps the core message visible but should give the action more breathing room.",
        trustAndProof: "Trust proof is present but not close enough to the primary decision point.",
        visualSystemCoherence: "Typography, spacing, and component treatment feel mostly coherent, with room to tighten action and proof modules.",
        accessibilityBasics: "The visible structure is readable in the captured screenshot, though final contrast should be checked after redesign.",
        styleAndTaste: "The page feels professional and restrained, not flashy, but it could feel more confident with stronger visual emphasis.",
        redesignAdvice: "Keep the current calm direction and redesign the hero action area so message, proof, and next step form one clear decision unit.",
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
    redesignActions: [redesignAction("action_1"), redesignAction("action_2"), redesignAction("action_3")],
    strengths: ["The first viewport has a clear message and enough structure to review visually."],
    risks: ["Decision proof and action hierarchy can still be tightened."],
    confidence: "high",
    limitations: []
  };
}

function redesignAction(actionId: string): AgentVisualReview["redesignActions"][number] {
  return {
    actionId,
    title: `Strengthen first viewport decision path ${actionId}`,
    priority: "medium",
    effort: "medium",
    confidence: "high",
    affectedPages: [{ pageId: "page_1", url: "https://example.com/", section: "hero" }],
    evidenceRefs: ["page_1_desktop_above_fold"],
    recommendation: "Rework the hero decision area so the primary CTA, supporting proof, and lead message read as one intentional path.",
    expectedImpact: "Visitors should understand the next step faster and have clearer confidence before exploring details.",
    acceptanceCriteria: ["The primary action is visually dominant and supported by adjacent proof."],
    sourceFindingIds: []
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
    interactionStates: [],
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
