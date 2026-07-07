import {
  Finding,
  FindingCategory,
  PageEvidence,
  Scorecard,
  Confidence,
  Effort,
  Impact,
  Severity,
  WebsiteType,
  BusinessGradeStatus
} from "../schemas/audit.js";

export const scoreWeights = {
  visualDesignQuality: 0.15,
  uxClarityNavigation: 0.15,
  conversionReadiness: 0.15,
  mobileExperience: 0.12,
  brandFitTrust: 0.12,
  contentDesignUxWriting: 0.1,
  accessibilityBasics: 0.08,
  performancePerception: 0.08,
  designSystemConsistency: 0.05
};

export function priorityScore(input: {
  severity: Severity;
  impact: Impact;
  confidence: Confidence;
  effort: Effort;
  pageImportance: "high" | "medium" | "low";
}): number {
  const severityWeight = { critical: 100, high: 82, medium: 58, low: 32 }[input.severity];
  const impactWeight = { high: 100, medium: 65, low: 35 }[input.impact];
  const confidenceWeight = { high: 100, medium: 70, low: 38 }[input.confidence];
  const pageImportanceWeight = { high: 100, medium: 70, low: 40 }[input.pageImportance];
  const lowEffortBonus = { low: 100, medium: 55, high: 20 }[input.effort];

  return Math.round(
    impactWeight * 0.35 +
      severityWeight * 0.25 +
      confidenceWeight * 0.15 +
      pageImportanceWeight * 0.15 +
      lowEffortBonus * 0.1
  );
}

export function createScorecard(
  findings: Finding[],
  pages: PageEvidence[],
  websiteType: WebsiteType,
  businessGradeStatus: BusinessGradeStatus = "automated_scan"
): Scorecard {
  const statusCap = businessGradeStatus === "business_grade" ? 98 : businessGradeStatus === "agent_review_pending" ? 82 : 74;
  const scoreFor = (categories: FindingCategory[]) => {
    const relevant = findings.filter((finding) => categories.includes(finding.category));
    const penalty = relevant.reduce((sum, finding) => {
      const severityPenalty = { critical: 22, high: 16, medium: 10, low: 5 }[finding.severity];
      const confidenceFactor = { high: 1, medium: 0.75, low: 0.45 }[finding.confidence];
      return sum + severityPenalty * confidenceFactor;
    }, 0);
    const base = businessGradeStatus === "business_grade" ? 96 : businessGradeStatus === "agent_review_pending" ? 82 : 74;
    return Math.max(35, Math.min(statusCap, Math.round(base - penalty)));
  };

  const subscores = {
    visualDesignQuality: item(scoreFor(["visual_design"]), findings, "visual design", businessGradeStatus),
    uxClarityNavigation: item(scoreFor(["ux"]), findings, "UX clarity and navigation", businessGradeStatus),
    conversionReadiness: item(scoreFor(["conversion", "trust"]), findings, "conversion readiness", businessGradeStatus),
    mobileExperience: item(scoreFor(["mobile"]), findings, "mobile experience", businessGradeStatus),
    brandFitTrust: item(scoreFor(["brand", "trust"]), findings, "brand fit and trust", businessGradeStatus),
    contentDesignUxWriting: item(scoreFor(["content_design"]), findings, "content design", businessGradeStatus),
    accessibilityBasics: item(scoreFor(["accessibility_basic"]), findings, "accessibility basics", businessGradeStatus),
    performancePerception: item(scoreFor(["performance_perception"]), findings, "performance perception", businessGradeStatus),
    designSystemConsistency: item(scoreFor(["design_system"]), findings, "design-system consistency", businessGradeStatus)
  };

  const overallScore = Math.min(statusCap, Math.round(
    Object.entries(scoreWeights).reduce((sum, [key, weight]) => {
      const score = subscores[key as keyof typeof subscores].score;
      return sum + score * weight;
    }, 0)
  ));

  const topRisks = findings
    .slice()
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 3)
    .map((finding) => finding.title);

  const topStrengths = inferStrengths(findings, pages);

  return {
    overallScore,
    confidence: businessGradeStatus === "business_grade" ? (pages.length > 1 ? "high" : "medium") : pages.length > 1 ? "medium" : "low",
    subscores,
    weights: scoreWeights,
    websiteTypeAdjustment:
      `${websiteType === "unknown" ? "No website-type-specific scoring adjustment was applied." : `Scoring used ${websiteType} as inferred context.`} ` +
      (businessGradeStatus === "business_grade"
        ? "Multimodal agent review was imported, so score confidence may include visual judgment."
        : businessGradeStatus === "agent_review_pending"
          ? "Scores are capped because visual review is pending."
          : "This is an automated signal score capped below business-grade because no validated multimodal agent review has been imported."),
    topStrengths,
    topRisks
  };
}

function item(score: number, findings: Finding[], label: string, businessGradeStatus: BusinessGradeStatus) {
  const confidence: Confidence =
    businessGradeStatus === "business_grade" && !findings.some((finding) => finding.confidence === "low")
      ? "high"
      : businessGradeStatus === "agent_review_pending"
        ? "low"
        : "medium";
  return {
    score,
    confidence,
    rationale:
      `${label} score derived from validated findings and captured evidence. ` +
      (businessGradeStatus === "business_grade"
        ? "Imported multimodal agent review is included."
        : businessGradeStatus === "agent_review_pending"
          ? "The score is capped because visual review is pending."
          : "This automated signal score is capped below business-grade because no validated multimodal agent review has been imported.")
  };
}

function inferStrengths(findings: Finding[], pages: PageEvidence[]): string[] {
  const strengths: string[] = [];
  if (pages.some((page) => page.structure.navigation.length >= 4)) {
    strengths.push("Primary navigation was detectable in captured evidence.");
  }
  if (pages.some((page) => page.text.buttons.length > 0)) {
    strengths.push("At least one action-oriented control was visible in captured evidence.");
  }
  if (!findings.some((finding) => finding.category === "accessibility_basic" && finding.severity === "critical")) {
    strengths.push("No critical automated accessibility-basic issue was detected by the MVP rules.");
  }
  return strengths.slice(0, 3);
}
