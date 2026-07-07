import { describe, expect, it } from "vitest";
import type { ExtractedPage } from "./extraction.js";
import { buildPageReviewSignals } from "./review-signals.js";

describe("buildPageReviewSignals", () => {
  it("extracts objective copy, proof, mobile, density, and visual-system signals", () => {
    const desktop = extractedPage({
      headings: [{ text: "Operational audits for SaaS launch teams", tag: "h1", visible: true }],
      buttons: [{ text: "Learn more", tag: "button", visible: true }, { text: "Book demo", tag: "a", visible: true }],
      links: [{ text: "Customer case studies", tag: "a", visible: true }],
      visibleTextSample:
        "Operational audits for SaaS launch teams. Book demo. Trusted by customer teams with certified delivery and cancel anytime terms.",
      sections: [
        {
          id: "hero",
          label: "hero",
          selector: "section.hero",
          viewport: "desktop",
          textSample: "Operational audits for SaaS launch teams. Book demo. Trusted customer proof.",
          box: { x: 0, y: 0, width: 1200, height: 720 }
        }
      ],
      components: [
        { id: "cta", type: "a", label: "Book demo", selector: "a.cta", viewport: "desktop", box: { x: 20, y: 300, width: 140, height: 48 } }
      ],
      navigation: [{ text: "Work", tag: "a", visible: true }],
      cssSignals: {
        colors: Array.from({ length: 28 }, (_, index) => `rgb(${index}, ${index}, ${index})`),
        backgroundColors: ["rgb(255, 255, 255)"],
        fonts: ["Inter", "Arial", "Helvetica", "Georgia", "System"],
        fontSizes: Array.from({ length: 16 }, (_, index) => index + 12),
        lineHeights: [18, 24],
        borderRadii: [0, 4, 8],
        contrastPairs: [{ foreground: "rgb(120,120,120)", background: "rgb(140,140,140)", ratio: 1.2 }]
      }
    });
    const mobile = extractedPage({
      buttons: [{ text: "Menu", tag: "button", visible: true }],
      links: [{ text: "Customer case studies", tag: "a", visible: true }],
      sections: [
        {
          id: "hero_m",
          label: "hero",
          selector: "section.hero",
          viewport: "mobile",
          textSample: "Operational audits for SaaS launch teams.",
          box: { x: 0, y: 0, width: 390, height: 600 }
        }
      ],
      components: [
        { id: "tiny", type: "a", label: "Tiny", selector: "a.tiny", viewport: "mobile", box: { x: 10, y: 100, width: 20, height: 20 } }
      ],
      navigation: []
    });

    const signals = buildPageReviewSignals(desktop, mobile);

    expect(signals.headline).toMatchObject({ specificity: "specific", wordCount: 6 });
    expect(signals.ctas.labels).toContain("Learn more");
    expect(signals.ctas.vagueLabels).toContain("Learn more");
    expect(signals.ctas.primaryLabel).toBe("Learn more");
    expect(signals.proof).toMatchObject({ hasProofSignal: true, hasRiskReversal: true });
    expect(signals.firstViewport).toMatchObject({ hasH1: true, hasAction: true, hasProofSignal: true });
    expect(signals.mobileDesktop.missingPrimaryActionOnMobile).toBe(true);
    expect(signals.mobileDesktop.mobileSmallTapTargets).toBe(1);
    expect(signals.visualSystem.fragmentationSignals).toEqual(expect.arrayContaining(["5 font families sampled", "16 font sizes sampled", "28 foreground colors sampled"]));
  });
});

function extractedPage(overrides: Partial<ExtractedPage>): ExtractedPage {
  return {
    title: "Test",
    language: "en",
    headings: [],
    buttons: [],
    links: [],
    forms: [],
    imagesMissingAlt: 0,
    imageCount: 0,
    visibleTextSample: "",
    sections: [],
    components: [],
    navigation: [],
    cssSignals: {
      colors: [],
      backgroundColors: [],
      fonts: [],
      fontSizes: [],
      lineHeights: [],
      borderRadii: [],
      contrastPairs: []
    },
    ...overrides
  };
}
