import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createAuditConfig } from "../config/defaults.js";
import type { AuditConfig, PageEvidence, PageReviewSignals } from "../schemas/audit.js";
import { createNestedAuditPaths } from "../storage/project.js";
import { reviewEvidence } from "./findings.js";

describe("reviewEvidence deterministic copy and layout findings", () => {
  it("emits objective copy, proof, density, mobile-action, and visual-system findings from review signals", async () => {
    const report = await reviewEvidence(config(), [pageFixture()], await tempPaths("wdr-findings-"));
    const titles = report.findings.map((finding) => finding.title);

    expect(titles).toEqual(expect.arrayContaining([
      "Hero message lacks supporting copy",
      "CTA copy is too vague to explain the next step",
      "First decision point lacks nearby proof",
      "First viewport appears overloaded with content",
      "Primary action may be missing on mobile",
      "Typography system appears fragmented"
    ]));
    expect(report.businessGradeStatus).toBe("automated_scan");
    expect(report.scorecard.overallScore).toBeLessThanOrEqual(78);
  });

  it("counts small tap-target findings from mobile component evidence only", async () => {
    const desktopOnly = pageFixture({
      reviewSignals: reviewSignals({ missingPrimaryActionOnMobile: false }),
      structure: {
        sections: [],
        navigation: nav(),
        components: smallComponents("desktop", 12)
      }
    });
    const desktopReport = await reviewEvidence(config(), [desktopOnly], await tempPaths("wdr-desktop-targets-"));
    expect(desktopReport.findings.map((finding) => finding.title)).not.toContain("Several clickable targets appear small");

    const mobile = pageFixture({
      reviewSignals: reviewSignals({ missingPrimaryActionOnMobile: false }),
      structure: {
        sections: [],
        navigation: nav(),
        components: smallComponents("mobile", 12)
      }
    });
    const mobileReport = await reviewEvidence(config(), [mobile], await tempPaths("wdr-mobile-targets-"));
    expect(mobileReport.findings.map((finding) => finding.title)).toContain("Several clickable targets appear small");
  });
});

function config(): AuditConfig {
  return {
    ...createAuditConfig({ url: "https://example.com/", outputPdf: false }),
    auditId: "test_audit"
  };
}

async function tempPaths(prefix: string) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  return createNestedAuditPaths(path.join(root, "audit"));
}

function pageFixture(overrides: Partial<PageEvidence> = {}): PageEvidence {
  const screenshot = {
    id: "page_1_desktop_above_fold",
    viewport: "desktop" as const,
    kind: "above_fold" as const,
    path: "screenshots/desktop/page_1_desktop_above_fold.png",
    width: 1440,
    height: 1000
  };
  const mobileScreenshot = {
    id: "page_1_mobile_above_fold",
    viewport: "mobile" as const,
    kind: "above_fold" as const,
    path: "screenshots/mobile/page_1_mobile_above_fold.png",
    width: 390,
    height: 844
  };
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
      [screenshot.id]: screenshot,
      [mobileScreenshot.id]: mobileScreenshot
    },
    interactionStates: [],
    text: {
      headings: [{ text: "Products", tag: "h1", visible: true }],
      buttons: [{ text: "Learn more", tag: "button", visible: true }],
      links: [{ text: "Learn more", tag: "a", visible: true }],
      forms: [],
      imagesMissingAlt: 0,
      imageCount: 0,
      visibleTextSample: "Products. Learn more."
    },
    structure: {
      sections: [],
      navigation: nav(),
      components: smallComponents("mobile", 9)
    },
    cssSignals: {
      colors: [],
      backgroundColors: [],
      fonts: ["Inter"],
      fontSizes: [16],
      lineHeights: [],
      borderRadii: [],
      contrastPairs: []
    },
    reviewSignals: reviewSignals(),
    ...overrides
  };
}

function reviewSignals(overrides: Partial<PageReviewSignals["mobileDesktop"]> = {}): PageReviewSignals {
  return {
    headline: {
      text: "Products",
      specificity: "generic",
      wordCount: 1,
      reason: "Headline is short or generic."
    },
    ctas: {
      labels: ["Learn more"],
      primaryLabel: "Book demo",
      actionOrientedCount: 1,
      vagueLabels: ["Learn more"]
    },
    proof: {
      hasProofSignal: false,
      proofTerms: [],
      hasRiskReversal: false,
      riskReversalTerms: []
    },
    firstViewport: {
      hasH1: true,
      hasAction: true,
      hasProofSignal: false,
      desktopWordCount: 8,
      desktopComponentCount: 36,
      mobileWordCount: 5,
      mobileComponentCount: 4
    },
    mobileDesktop: {
      desktopActionLabels: ["Book demo"],
      mobileActionLabels: [],
      missingPrimaryActionOnMobile: true,
      desktopNavigationCount: 4,
      mobileNavigationCount: 1,
      mobileSmallTapTargets: 9,
      ...overrides
    },
    contentDensity: {
      visibleWordCount: 4,
      sectionCount: 1,
      averageSectionWords: 4
    },
    visualSystem: {
      fontFamilyCount: 5,
      fontSizeCount: 16,
      colorCount: 4,
      backgroundColorCount: 2,
      borderRadiusCount: 2,
      lowContrastPairs: 0,
      fragmentationSignals: ["5 font families sampled", "16 font sizes sampled"]
    }
  };
}

function nav() {
  return [
    { text: "Home", tag: "a", visible: true },
    { text: "Work", tag: "a", visible: true },
    { text: "Pricing", tag: "a", visible: true },
    { text: "Contact", tag: "a", visible: true }
  ];
}

function smallComponents(viewport: "desktop" | "mobile", count: number): PageEvidence["structure"]["components"] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${viewport}_${index}`,
    type: "a",
    label: `Link ${index}`,
    selector: `a:nth-of-type(${index + 1})`,
    viewport,
    box: { x: 0, y: index * 20, width: 24, height: 24 }
  }));
}
