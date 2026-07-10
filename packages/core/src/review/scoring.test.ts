import { describe, expect, it } from "vitest";
import type { Finding, PageEvidence } from "../schemas/audit.js";
import { createScorecard, priorityScore } from "./scoring.js";

describe("priorityScore", () => {
  it("prioritizes high-impact confident low-effort homepage issues", () => {
    const score = priorityScore({
      severity: "high",
      impact: "high",
      confidence: "high",
      effort: "low",
      pageImportance: "high"
    });
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it("downranks low-confidence high-effort low-impact issues", () => {
    const score = priorityScore({
      severity: "low",
      impact: "low",
      confidence: "low",
      effort: "high",
      pageImportance: "low"
    });
    expect(score).toBeLessThan(45);
  });

  it("does not change numeric quality solely because review status changes", () => {
    const page = samplePage();
    const finding = sampleFinding(page.pageId);
    const scores = ["automated_scan", "agent_review_pending", "business_grade"].map((status) =>
      createScorecard([finding], [page], "saas", status as "automated_scan" | "agent_review_pending" | "business_grade").overallScore
    );

    expect(new Set(scores).size).toBe(1);
  });

  it("saturates repeated root-cause penalties across pages", () => {
    const pages = Array.from({ length: 6 }, (_, index) => ({ ...samplePage(), pageId: `page_${index + 1}`, url: `https://example.com/${index + 1}`, normalizedUrl: `https://example.com/${index + 1}` }));
    const repeated = pages.map((page, index) => ({ ...sampleFinding(page.pageId), findingId: `finding_${index + 1}`, evidence: { ...sampleFinding(page.pageId).evidence, pageId: page.pageId, url: page.url } }));
    const one = createScorecard(repeated.slice(0, 1), pages, "saas", "business_grade").subscores.uxClarityNavigation.score;
    const six = createScorecard(repeated, pages, "saas", "business_grade").subscores.uxClarityNavigation.score;

    expect(one - six).toBeLessThanOrEqual(5);
  });
});

function samplePage(): PageEvidence {
  return {
    pageId: "page_1",
    url: "https://example.com/",
    normalizedUrl: "https://example.com/",
    pageType: "homepage",
    pageTypeConfidence: "high",
    businessImportance: "high",
    screenshots: {
      desktop: { id: "desktop", viewport: "desktop", kind: "above_fold", path: "screenshots/desktop.png", width: 100, height: 100 },
      mobile: { id: "mobile", viewport: "mobile", kind: "above_fold", path: "screenshots/mobile.png", width: 50, height: 100 }
    },
    interactionStates: [],
    text: { headings: [{ text: "Example", tag: "h1", visible: true }], buttons: [], links: [], forms: [], imagesMissingAlt: 0, imageCount: 0, visibleTextSample: "Example" },
    structure: { sections: [{ id: "hero", label: "hero", selector: "main", textSample: "Example", viewport: "desktop" }], components: [], navigation: [] },
    cssSignals: { colors: [], backgroundColors: [], fonts: [], fontSizes: [], lineHeights: [], borderRadii: [], contrastPairs: [] },
    accessibility: { status: "completed", violationCount: 0, critical: 0, serious: 0, moderate: 0, minor: 0, topViolations: [] },
    performance: { status: "completed", source: "test" }
  };
}

function sampleFinding(pageId: string): Finding {
  return {
    findingId: "finding_1",
    source: "deterministic",
    title: "Navigation structure is unclear",
    category: "ux",
    severity: "medium",
    priorityScore: 68,
    impact: "medium",
    effort: "medium",
    confidence: "medium",
    evidence: { pageId, url: "https://example.com/", screenshotRefs: ["desktop"], textQuotes: [] },
    observation: "Navigation structure is unclear in the captured evidence.",
    whyItMatters: "Users need reliable orientation across the captured public pages.",
    recommendation: "Use a consistent navigation structure with concrete destination labels.",
    designPrinciples: ["wayfinding"],
    implementation: { owner: ["designer", "developer"], acceptanceCriteria: ["Navigation labels are clear."], dependencies: [], definitionOfDone: [] },
    relatedFindings: []
  };
}
