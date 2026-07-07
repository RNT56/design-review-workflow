import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuditConfig } from "../config/defaults.js";
import type { AgentVisualReview, AuditConfig, AuditReport, Finding, PageEvidence, Scorecard } from "../schemas/audit.js";
import { createAuditPaths } from "../storage/project.js";
import { writeReports } from "./index.js";
import { generateAgentVisualReview } from "./agent-review-generate.js";

describe("generateAgentVisualReview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates, validates, imports, and stores provider-backed visual review JSON", async () => {
    const { auditRoot, report } = await writeAuditFixture("wdr-agent-generate-valid-");
    stubOpenAiOutput(JSON.stringify(visualReview(report.auditId)));

    const result = await generateAgentVisualReview(auditRoot, {
      env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-vision" },
      maxImages: 1
    });

    expect(result.provider).toBe("openai");
    expect(result.model).toBe("test-vision");
    expect(result.gate.status).toBe("pass");
    expect(result.report.businessGradeStatus).toBe("business_grade");
    expect(result.generatedReviewPath).toContain("agent-runs/openai-test-vision/visual-review.json");
    expect(result.rawProviderOutputPath).toContain("visual-review.raw.json");
  });

  it("fails when no provider credentials are configured", async () => {
    const { auditRoot } = await writeAuditFixture("wdr-agent-generate-no-provider-");

    await expect(generateAgentVisualReview(auditRoot, { env: {}, maxImages: 1 })).rejects.toThrow(/No model provider configured/);
  });

  it("rejects unsupported provider selectors before doing provider work", async () => {
    await expect(generateAgentVisualReview("/tmp/nonexistent-audit", { provider: "openai" })).rejects.toThrow(/Unsupported agent-review provider/);
  });

  it("fails invalid provider JSON before import", async () => {
    const { auditRoot } = await writeAuditFixture("wdr-agent-generate-invalid-json-");
    stubOpenAiOutput("not json");

    await expect(
      generateAgentVisualReview(auditRoot, { env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-vision" }, maxImages: 1 })
    ).rejects.toThrow(/could not be parsed|did not contain/);
  });

  it("rejects unknown screenshot references from generated reviews", async () => {
    const { auditRoot, report } = await writeAuditFixture("wdr-agent-generate-unknown-shot-");
    const review = visualReview(report.auditId);
    review.screenshotsReviewed = ["missing_screenshot"];
    review.pageReviews[0].screenshotsReviewed = ["missing_screenshot"];
    review.visualFindings[0].evidenceRefs = ["missing_screenshot"];
    review.redesignActions.forEach((action) => {
      action.evidenceRefs = ["missing_screenshot"];
    });
    stubOpenAiOutput(JSON.stringify(review));

    await expect(
      generateAgentVisualReview(auditRoot, { env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-vision" }, maxImages: 1 })
    ).rejects.toThrow(/unknown screenshot/);
  });

  it("rejects unsupported analytics and user-behavior claims from generated reviews", async () => {
    const { auditRoot, report } = await writeAuditFixture("wdr-agent-generate-unsupported-claim-");
    const review = visualReview(report.auditId);
    review.designVerdict.messagingAndCopy = "Analytics and session recording prove users prefer this CTA copy, so the page should optimize around that behavior.";
    stubOpenAiOutput(JSON.stringify(review));

    await expect(
      generateAgentVisualReview(auditRoot, { env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-vision" }, maxImages: 1 })
    ).rejects.toThrow(/unsupported analytics/);
  });
});

function stubOpenAiOutput(output: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          output_text: output
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )
  );
}

async function writeAuditFixture(prefix: string): Promise<{ auditRoot: string; report: AuditReport }> {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), prefix));
  const config = {
    ...createAuditConfig({
      url: "https://example.com/",
      auditName: prefix.replace(/-$/, ""),
      outputPdf: false
    }),
    auditId: "audit_provider"
  };
  const paths = await createAuditPaths(config, workspaceRoot);
  await mkdir(paths.screenshotsDesktop, { recursive: true });
  await writePng(path.join(paths.screenshotsDesktop, "page_1_desktop_above_fold.png"), 900, 600);
  const report = sampleReport(config);
  await writeReports(config, report, paths);
  return { auditRoot: paths.auditRoot, report };
}

async function writePng(filePath: string, width: number, height: number): Promise<void> {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (width * y + x) << 2;
      png.data[index] = 230;
      png.data[index + 1] = 240;
      png.data[index + 2] = 236;
      png.data[index + 3] = 255;
    }
  }
  await writeFile(filePath, PNG.sync.write(png));
}

function sampleReport(config: AuditConfig): AuditReport {
  const page = samplePage(config.url);
  const finding = sampleFinding(page);
  return {
    auditId: config.auditId,
    generatedAt: "2026-07-07T00:00:00.000Z",
    config,
    businessGradeStatus: "agent_review_pending",
    websiteType: "saas",
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

function samplePage(url: string): PageEvidence {
  return {
    pageId: "page_1",
    url,
    normalizedUrl: url,
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
        width: 900,
        height: 600
      }
    },
    interactionStates: [],
    text: {
      headings: [{ text: "Operational reviews for launch teams", tag: "h1", visible: true }],
      buttons: [{ text: "Book demo", tag: "button", visible: true }],
      links: [],
      forms: [],
      imagesMissingAlt: 0,
      imageCount: 0,
      visibleTextSample: "Operational reviews for launch teams. Book demo. Trusted by launch teams."
    },
    structure: {
      sections: [],
      components: [],
      navigation: [
        { text: "Home", tag: "a", visible: true },
        { text: "Proof", tag: "a", visible: true },
        { text: "Contact", tag: "a", visible: true }
      ]
    },
    cssSignals: {
      colors: [],
      backgroundColors: [],
      fonts: ["Inter"],
      fontSizes: [16, 48],
      lineHeights: [],
      borderRadii: [8],
      contrastPairs: []
    }
  };
}

function sampleFinding(page: PageEvidence): Finding {
  return {
    findingId: "finding_1",
    source: "deterministic",
    title: "Primary CTA needs clearer support",
    category: "conversion",
    severity: "medium",
    priorityScore: 70,
    impact: "medium",
    effort: "medium",
    confidence: "high",
    evidence: {
      pageId: page.pageId,
      url: page.url,
      viewport: "desktop",
      section: "hero",
      screenshotRefs: ["page_1_desktop_above_fold"],
      textQuotes: ["Book demo"]
    },
    observation: "The automated scan found that the first viewport action would benefit from stronger proof context.",
    whyItMatters: "Decision points work better when the next action is supported by relevant proof and copy.",
    recommendation: "Place proof and action copy together so the primary CTA reads as one clear next step.",
    designPrinciples: ["decision support"],
    implementation: {
      owner: ["designer", "copywriter"],
      acceptanceCriteria: ["Primary CTA is paired with nearby proof."],
      dependencies: [],
      definitionOfDone: ["A rerun confirms the proof and CTA are visible together."]
    },
    relatedFindings: []
  };
}

function visualReview(auditId: string): AgentVisualReview {
  return {
    schemaVersion: "design-review-workflow.agent-visual-review.v1",
    reviewer: "provider-test",
    reviewedAt: "2026-07-07T00:00:00.000Z",
    auditId,
    designVerdict: {
      readiness: "targeted_redesign_recommended",
      styleAndTaste: "The page has a restrained professional look, but the first viewport needs a more confident action and proof treatment.",
      messagingAndCopy: "The page copy is understandable and relevant, but it should make proof, audience, and CTA wording more specific.",
      audienceFit: "The page direction fits a professional SaaS buyer who wants a quick read and a practical next step.",
      brandFit: "The brand expression is coherent and calm, with enough structure to support a sharper proof-led decision area.",
      strongestDesignQualities: ["The first viewport has a clear message and enough visual order to support a focused review."],
      weakestDesignRisks: ["The action and proof area can feel underpowered for visitors deciding whether to continue."],
      redesignDirection: "Keep the restrained system and redesign the hero decision area around one action, concise proof, and sharper CTA copy.",
      rationale: "The screenshot evidence shows a readable page with a visible action, but the first viewport needs stronger decision support.",
      confidence: "high",
      limitations: ["Only the supplied public screenshot evidence was reviewed."]
    },
    screenshotsReviewed: ["page_1_desktop_above_fold"],
    pageReviews: [
      {
        pageId: "page_1",
        url: "https://example.com/",
        screenshotsReviewed: ["page_1_desktop_above_fold"],
        firstViewport: "The first viewport explains the offer and includes a next action, but proof should sit closer to the decision point.",
        hierarchy: "The page has a readable hierarchy, though the CTA and proof need stronger grouping.",
        composition: "The composition is stable and restrained, with room to make the hero action area more decisive.",
        navigation: "Navigation is understandable and does not overpower the primary hero message.",
        ctaClarity: "The CTA is visible, but the surrounding copy should make the action feel more specific and lower risk.",
        messagingAndCopy: "The headline communicates the category, but support copy should name the audience, proof, and expected next step.",
        mobile: "Mobile was not separately supplied in this fixture, so mobile judgment is limited to available screenshot evidence.",
        trustAndProof: "Proof language exists but should be closer and more concrete at the point where the visitor is asked to act.",
        visualSystemCoherence: "The visual system feels coherent enough, with restrained type and component treatment in the captured screenshot.",
        accessibilityBasics: "The visible hierarchy is readable in the captured screenshot, though final contrast should be checked after redesign.",
        styleAndTaste: "The page feels professional and calm, but stronger action emphasis would make it feel more polished and intentional.",
        redesignAdvice: "Treat the hero as one decision unit with message, proof, and CTA aligned around a single next step.",
        notes: []
      }
    ],
    visualFindings: [
      {
        reviewId: "visual_1",
        title: "Hero action needs proof-led decision support",
        category: "conversion",
        severity: "medium",
        impact: "medium",
        effort: "medium",
        confidence: "high",
        pageId: "page_1",
        url: "https://example.com/",
        section: "hero",
        evidenceRefs: ["page_1_desktop_above_fold"],
        observation: "The CTA is visible, but the captured hero does not make proof and action feel like one strong decision area.",
        whyItMatters: "Visitors evaluating a service or SaaS offer need confidence near the next step before they continue.",
        recommendation: "Move a concise proof point close to the CTA and rewrite the CTA support copy around the concrete next step.",
        acceptanceCriteria: ["The first viewport pairs one primary CTA with a nearby proof or reassurance point."],
        sourceFindingIds: ["finding_1"]
      }
    ],
    redesignActions: ["action_1", "action_2", "action_3"].map((actionId) => ({
      actionId,
      title: `Strengthen hero decision support ${actionId}`,
      priority: "medium",
      effort: "medium",
      confidence: "high",
      affectedPages: [{ pageId: "page_1", url: "https://example.com/", section: "hero" }],
      evidenceRefs: ["page_1_desktop_above_fold"],
      recommendation: "Rework the hero so the primary CTA, proof statement, and supporting copy read as one intentional decision path.",
      expectedImpact: "The first viewport should become easier to evaluate and act on from the captured design state.",
      acceptanceCriteria: ["The primary CTA is supported by adjacent proof and specific copy."],
      sourceFindingIds: ["finding_1"]
    })),
    strengths: ["The page has a calm structure and an understandable first message."],
    risks: ["The first decision point may not feel persuasive enough without stronger proof."],
    confidence: "high",
    limitations: []
  };
}

function scorecard(): Scorecard {
  return {
    overallScore: 82,
    confidence: "medium",
    subscores: {
      visualDesignQuality: item(80),
      uxClarityNavigation: item(82),
      conversionReadiness: item(74),
      mobileExperience: item(80),
      brandFitTrust: item(78),
      contentDesignUxWriting: item(76),
      accessibilityBasics: item(84),
      performancePerception: item(85),
      designSystemConsistency: item(78)
    },
    weights: {},
    websiteTypeAdjustment: "none",
    topStrengths: [],
    topRisks: []
  };
}

function item(score: number) {
  return { score, confidence: "medium" as const, rationale: "fixture" };
}
