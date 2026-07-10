import type { ExtractedPage } from "./extraction.js";
import type { PageReviewSignals, TextNode } from "../schemas/audit.js";

const actionWords = /\b(start|get|try|buy|book|contact|request|schedule|download|subscribe|sign up|learn|compare|demo|call|order|shop|anfragen|kontakt|buchen|kaufen|testen|starten|demo)\b/i;
const vagueCtaPattern = /^(learn more|read more|more|click here|submit|go|continue|weiter|mehr|mehr erfahren|hier klicken)$/i;
const proofTerms = [
  "testimonial",
  "customer",
  "client",
  "case study",
  "review",
  "rated",
  "trusted",
  "certified",
  "award",
  "partner",
  "kunden",
  "referenz",
  "bewertung",
  "zertifiziert"
];
const riskReversalTerms = [
  "guarantee",
  "warranty",
  "refund",
  "return",
  "cancel anytime",
  "free trial",
  "secure",
  "privacy",
  "garantie",
  "rueckgabe",
  "retoure",
  "sicher",
  "datenschutz"
];

export function buildPageReviewSignals(desktop: ExtractedPage, mobile?: ExtractedPage): PageReviewSignals {
  const h1 = desktop.headings.find((heading) => heading.tag === "h1");
  const headlineText = h1?.text.trim();
  const headlineWordCount = wordCount(headlineText ?? "");
  const desktopActions = actionLabels(desktop);
  const mobileActions = mobile ? actionLabels(mobile) : [];
  const allCtaLabels = unique([...desktop.buttons.map((button) => button.text), ...desktop.forms.map((form) => form.submitText ?? "")].filter(Boolean));
  const visibleText = desktop.visibleTextSample.toLowerCase();
  const firstViewportText = desktop.firstViewportText ?? "";
  const mobileFirstViewportText = mobile?.firstViewportText ?? "";
  const proofMatches = matchedTerms(visibleText, proofTerms);
  const riskMatches = matchedTerms(visibleText, riskReversalTerms);
  const firstViewportLower = firstViewportText.toLowerCase();
  const css = desktop.cssSignals;
  const fragmentationSignals = [
    css.fonts.length > 4 ? `${css.fonts.length} font families sampled` : "",
    css.fontSizes.length > 14 ? `${css.fontSizes.length} font sizes sampled` : "",
    css.colors.length > 24 ? `${css.colors.length} foreground colors sampled` : "",
    css.borderRadii.length > 8 ? `${css.borderRadii.length} border radii sampled` : ""
  ].filter(Boolean);

  return {
    headline: {
      text: headlineText || undefined,
      specificity: headlineSpecificity(headlineText),
      wordCount: headlineWordCount,
      reason: headlineText ? headlineSpecificityReason(headlineText) : "No visible H1 headline was captured."
    },
    ctas: {
      labels: allCtaLabels.slice(0, 20),
      primaryLabel: desktopActions[0],
      actionOrientedCount: desktopActions.length,
      vagueLabels: allCtaLabels.filter((label) => vagueCtaPattern.test(label.trim())).slice(0, 10)
    },
    proof: {
      hasProofSignal: proofMatches.length > 0,
      proofTerms: proofMatches,
      hasRiskReversal: riskMatches.length > 0,
      riskReversalTerms: riskMatches
    },
    firstViewport: {
      hasH1: desktop.headings.some((heading) => heading.tag === "h1" && heading.inFirstViewport),
      hasAction: [...desktop.buttons, ...desktop.links].some((node) => node.inFirstViewport && actionWords.test(node.text)),
      hasProofSignal: proofTerms.some((term) => firstViewportLower.includes(term)),
      desktopWordCount: wordCount(firstViewportText),
      desktopComponentCount: desktop.components.filter((component) => (component.box?.y ?? 0) < 900).length,
      mobileWordCount: mobile ? wordCount(mobileFirstViewportText) : undefined,
      mobileComponentCount: mobile?.components.filter((component) => (component.box?.y ?? 0) < 900).length
    },
    mobileDesktop: {
      desktopActionLabels: desktopActions.slice(0, 12),
      mobileActionLabels: mobileActions.slice(0, 12),
      missingPrimaryActionOnMobile: Boolean(desktopActions[0] && !mobileActions.some((label) => sameLabel(label, desktopActions[0]))),
      desktopNavigationCount: desktop.navigation.length,
      mobileNavigationCount: mobile?.navigation.length ?? 0,
      mobileSmallTapTargets:
        mobile?.components.filter((component) => ["a", "button"].includes(component.type) && component.box && (component.box.width < 36 || component.box.height < 32)).length ?? 0
    },
    contentDensity: {
      visibleWordCount: wordCount(desktop.visibleTextSample),
      sectionCount: desktop.sections.length,
      averageSectionWords: desktop.sections.length > 0 ? Math.round(desktop.sections.reduce((sum, section) => sum + wordCount(section.textSample), 0) / desktop.sections.length) : 0
    },
    visualSystem: {
      fontFamilyCount: css.fonts.length,
      fontSizeCount: css.fontSizes.length,
      colorCount: css.colors.length,
      backgroundColorCount: css.backgroundColors.length,
      borderRadiusCount: css.borderRadii.length,
      lowContrastPairs: css.contrastPairs.filter((pair) => pair.ratio < (pair.threshold ?? 4.5)).length,
      fragmentationSignals
    }
  };
}

function actionLabels(page: ExtractedPage): string[] {
  return unique([...page.buttons, ...page.links, ...page.forms.map((form) => ({ text: form.submitText ?? "" } as TextNode))].map((node) => node.text.trim()).filter((label) => actionWords.test(label)));
}

function headlineSpecificity(text?: string): PageReviewSignals["headline"]["specificity"] {
  if (!text?.trim()) return "missing";
  const normalized = text.trim().toLowerCase();
  if (wordCount(normalized) < 3) return "generic";
  if (/^(welcome|home|solutions|services|products|we build|we create|hello|startseite|willkommen)$/i.test(normalized)) return "generic";
  if (!/(for|with|without|that|to|by|teams|business|kunden|unternehmen|fuer|mehr|less|better|faster|secure|local|design|website|software|agent|workflow|audit)/i.test(normalized) && wordCount(normalized) < 7) return "generic";
  return "specific";
}

function headlineSpecificityReason(text: string): string {
  return headlineSpecificity(text) === "specific"
    ? "Headline includes enough length or concrete terms to support audience, outcome, or offer review."
    : "Headline is short or generic and may need more audience, outcome, or differentiator detail.";
}

function matchedTerms(text: string, terms: string[]): string[] {
  return unique(terms.filter((term) => text.includes(term.toLowerCase()))).slice(0, 12);
}

function sameLabel(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function unique(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function wordCount(text: string): number {
  return (text.trim().match(/\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b/gu) ?? []).length;
}
