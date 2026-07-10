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

export const SCORE_RUBRIC_VERSION = "design-review-workflow.scoring.v2";
const NEUTRAL_EVIDENCE_SCORE = 85;

type CoverageLevel = "high" | "medium" | "low" | "insufficient";
type ScoreDimension = keyof typeof scoreWeights;

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
  const scoreFor = (categories: FindingCategory[]) => {
    const relevant = findings.filter((finding) => categories.includes(finding.category));
    const groups = groupPenaltyInputs(relevant);
    const penalty = groups.reduce((sum, group) => {
      const finding = group.finding;
      const severityPenalty = { critical: 22, high: 16, medium: 10, low: 5 }[finding.severity];
      const confidenceFactor = { high: 1, medium: 0.75, low: 0.45 }[finding.confidence];
      const prevalenceFactor = 1 + Math.min(0.5, Math.log2(Math.max(1, group.pages)) * 0.15);
      return sum + severityPenalty * confidenceFactor * prevalenceFactor;
    }, 0);
    return {
      score: Math.max(35, Math.round(NEUTRAL_EVIDENCE_SCORE - penalty)),
      groups: groups.length
    };
  };

  const coverage = coverageByDimension(pages, businessGradeStatus);
  const dimension = (key: ScoreDimension, categories: FindingCategory[], label: string) => {
    const result = scoreFor(categories);
    return item(result.score, result.groups, findings, label, coverage[key]);
  };

  const subscores = {
    visualDesignQuality: dimension("visualDesignQuality", ["visual_design"], "visual design"),
    uxClarityNavigation: dimension("uxClarityNavigation", ["ux"], "UX clarity and navigation"),
    conversionReadiness: dimension("conversionReadiness", ["conversion", "trust"], "conversion readiness"),
    mobileExperience: dimension("mobileExperience", ["mobile"], "mobile experience"),
    brandFitTrust: dimension("brandFitTrust", ["brand", "trust"], "brand fit and trust"),
    contentDesignUxWriting: dimension("contentDesignUxWriting", ["content_design"], "content design"),
    accessibilityBasics: dimension("accessibilityBasics", ["accessibility_basic"], "accessibility basics"),
    performancePerception: dimension("performancePerception", ["performance_perception"], "performance perception"),
    designSystemConsistency: dimension("designSystemConsistency", ["design_system"], "design-system consistency")
  };

  const overallScore = Math.round(
    Object.entries(scoreWeights).reduce((sum, [key, weight]) => {
      const score = subscores[key as keyof typeof subscores].score;
      return sum + score * weight;
    }, 0)
  );

  const topRisks = findings
    .slice()
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 3)
    .map((finding) => finding.title);

  const topStrengths = inferStrengths(findings, pages);
  const coverageLevels = Object.values(coverage);
  const assessedDimensions = coverageLevels.filter((level) => level === "high" || level === "medium").length;
  const pagesWithDesktop = pages.filter((page) => Object.values(page.screenshots).some((shot) => shot.viewport === "desktop")).length;
  const pagesWithMobile = pages.filter((page) => Object.values(page.screenshots).some((shot) => shot.viewport === "mobile")).length;
  const accessibilityPages = pages.filter((page) => page.accessibility?.status === "completed").length;
  const performancePages = pages.filter((page) => page.performance?.status === "completed").length;

  return {
    overallScore,
    confidence: assessedDimensions >= 8 && pages.length > 1 ? "high" : assessedDimensions >= 5 ? "medium" : "low",
    subscores,
    weights: scoreWeights,
    websiteTypeAdjustment:
      `${websiteType === "unknown" ? "Website type is unknown." : `Website type ${websiteType} is contextual metadata.`} ` +
      "The v2 numeric score is status-independent; review status changes coverage and confidence, not the quality baseline.",
    topStrengths,
    topRisks,
    rubricVersion: SCORE_RUBRIC_VERSION,
    provisional: businessGradeStatus !== "business_grade" || assessedDimensions < coverageLevels.length,
    coverage: {
      assessedDimensions,
      totalDimensions: coverageLevels.length,
      ratio: Number((assessedDimensions / Math.max(1, coverageLevels.length)).toFixed(3)),
      pages: pages.length,
      pagesWithDesktop,
      pagesWithMobile,
      accessibilityPages,
      performancePages,
      note:
        businessGradeStatus === "business_grade"
          ? "A validated visual review contributes coverage, while numeric penalties remain finding-driven and status-independent."
          : "Visual and brand judgment remain low coverage until a validated multimodal review is imported."
    }
  };
}

function item(score: number, findingGroups: number, findings: Finding[], label: string, coverage: CoverageLevel) {
  const confidence: Confidence = coverage === "high" && !findings.some((finding) => finding.confidence === "low")
    ? "high"
    : coverage === "high" || coverage === "medium"
      ? "medium"
      : "low";
  return {
    score,
    confidence,
    coverage,
    findingGroups,
    rationale: `${label} score uses ${findingGroups} deduplicated finding group(s) under ${SCORE_RUBRIC_VERSION}. Evidence coverage is ${coverage}; review status does not change the numeric baseline.`
  };
}

function groupPenaltyInputs(findings: Finding[]): Array<{ finding: Finding; pages: number }> {
  const groups = new Map<string, { finding: Finding; pageIds: Set<string> }>();
  for (const finding of findings) {
    const key = [finding.category, normalizeFingerprintText(finding.title), normalizeFingerprintText(finding.recommendation)].join(":");
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { finding, pageIds: new Set([finding.evidence.pageId]) });
      continue;
    }
    current.pageIds.add(finding.evidence.pageId);
    if (finding.priorityScore > current.finding.priorityScore) current.finding = finding;
  }
  return [...groups.values()].map((group) => ({ finding: group.finding, pages: group.pageIds.size }));
}

function coverageByDimension(pages: PageEvidence[], status: BusinessGradeStatus): Record<ScoreDimension, CoverageLevel> {
  const pageCount = pages.length;
  const all = (predicate: (page: PageEvidence) => boolean) => pageCount > 0 && pages.every(predicate);
  const some = (predicate: (page: PageEvidence) => boolean) => pages.some(predicate);
  const level = (complete: boolean, partial: boolean): CoverageLevel => complete ? "high" : partial ? "medium" : "insufficient";
  const hasDesktop = (page: PageEvidence) => Object.values(page.screenshots).some((shot) => shot.viewport === "desktop" && shot.kind === "above_fold");
  const hasMobile = (page: PageEvidence) => Object.values(page.screenshots).some((shot) => shot.viewport === "mobile" && shot.kind === "above_fold");
  return {
    visualDesignQuality: status === "business_grade" ? "high" : all(hasDesktop) ? "low" : "insufficient",
    uxClarityNavigation: level(all((page) => page.structure.sections.length > 0 || page.structure.navigation.length > 0), some((page) => page.structure.components.length > 0)),
    conversionReadiness: level(all((page) => Boolean(page.reviewSignals)), some((page) => page.text.buttons.length > 0 || page.text.links.length > 0)),
    mobileExperience: level(all(hasMobile), some(hasMobile)),
    brandFitTrust: status === "business_grade" ? "high" : some(hasDesktop) ? "low" : "insufficient",
    contentDesignUxWriting: level(all((page) => page.text.visibleTextSample.length > 0), some((page) => page.text.headings.length > 0)),
    accessibilityBasics: level(all((page) => page.accessibility?.status === "completed"), some((page) => page.accessibility?.status === "completed")),
    performancePerception: level(all((page) => page.performance?.status === "completed"), some((page) => page.performance?.status === "completed")),
    designSystemConsistency: level(all((page) => Boolean(page.cssSignals)), some((page) => Boolean(page.cssSignals)))
  };
}

function normalizeFingerprintText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
    strengths.push("No critical accessibility-basic finding was emitted within the captured automated coverage.");
  }
  return strengths.slice(0, 3);
}
