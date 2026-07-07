import {
  AgentVisualReview,
  AgentVisualReviewSchema,
  AuditReport,
  BusinessGradeStatus,
  Finding,
  GroupedIssue,
  TicketRecommendation
} from "../schemas/audit.js";
import { stableId } from "../utils/id.js";
import { priorityScore, createScorecard } from "./scoring.js";
import { createRedesignBriefing, createTickets } from "./findings.js";
import { groupFindings } from "./grouping.js";

export type BusinessGradeGateResult = {
  schemaVersion: "design-review-workflow.business-grade-gate.v1";
  status: "pass" | "fail";
  businessGradeStatus: BusinessGradeStatus;
  checkedAt: string;
  errors: string[];
  warnings: string[];
  summary: {
    screenshotsReviewed: number;
    pageReviews: number;
    visualFindings: number;
    redesignActions: number;
    groupedIssues: number;
    designVerdict: "present" | "missing";
  };
};

const unsupportedClaimPattern = /\b(analytics|conversion rate|revenue|users (?:prefer|say|think)|heatmap|session recording|competitor|market average)\b/i;
const templateTextPattern = /\b(TODO|template generated|replace every TODO|agent-name|lorem ipsum|placeholder)\b/i;
const weakTextPattern = /^(looks good|good|nice|fine|okay|needs improvement|improve design|make it better)\.?$/i;

export function parseAgentVisualReview(data: unknown): AgentVisualReview {
  return AgentVisualReviewSchema.parse(data);
}

export function applyAgentVisualReview(report: AuditReport, review: AgentVisualReview): AuditReport {
  const errors = validateAgentVisualReview(report, review);
  if (errors.length > 0) {
    throw new Error(`Invalid agent visual review: ${errors.join("; ")}`);
  }

  const deterministic = report.findings.filter((finding) => finding.source !== "agent_visual");
  const visualFindings = review.visualFindings.map((finding, index) => agentFindingToFinding(report, review, finding, index + 1));
  const findings = [...deterministic, ...visualFindings].sort((a, b) => b.priorityScore - a.priorityScore);
  const groupedIssues = groupFindings(findings, review);

  const issueTickets = ticketsFromGroupedIssues(groupedIssues, findings);
  const redesignTickets = ticketsFromRedesignActions(review.redesignActions);

  return {
    ...report,
    businessGradeStatus: "business_grade",
    agentVisualReview: review,
    findings,
    groupedIssues,
    quickWins: findings.filter((finding) => finding.effort === "low" && finding.impact !== "low" && finding.confidence !== "low").slice(0, 10),
    scorecard: createScorecard(findings, report.pages, report.websiteType, "business_grade"),
    tickets: [...issueTickets, ...redesignTickets].slice(0, 16),
    redesignBriefing: [
      ...createRedesignBriefing(report.config, report.pages, findings, report.websiteType).slice(0, 3),
      {
        title: "Design verdict",
        body: `${readinessLabel(review.designVerdict.readiness)}: ${review.designVerdict.rationale}`
      },
      {
        title: "Style and taste",
        body: review.designVerdict.styleAndTaste
      },
      {
        title: "Brand and audience fit",
        body: `${review.designVerdict.audienceFit} ${review.designVerdict.brandFit}`
      },
      {
        title: "Redesign direction",
        body: review.designVerdict.redesignDirection
      },
      {
        title: "Prioritized redesign actions",
        body:
          review.redesignActions.length > 0
            ? review.redesignActions.map((action) => `${action.title}: ${action.recommendation}`).join(" ")
            : "No major redesign actions were required by the imported visual review."
      },
      {
        title: "Agent visual review",
        body: `Imported ${review.pageReviews.length} page review(s), ${review.screenshotsReviewed.length} reviewed screenshot(s), and ${review.visualFindings.length} visual finding(s) from ${review.reviewer}.`
      },
      {
        title: "Agent-observed strengths",
        body: review.strengths.length > 0 ? review.strengths.join(" ") : "No explicit visual strengths were supplied by the reviewing agent."
      },
      {
        title: "Agent-observed risks",
        body: review.risks.length > 0 ? review.risks.join(" ") : "No explicit visual risks were supplied by the reviewing agent."
      }
    ]
  };
}

export function evaluateBusinessGradeGate(report: AuditReport): BusinessGradeGateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const review = report.agentVisualReview;

  if (report.businessGradeStatus !== "business_grade") {
    errors.push("Business-grade status requires an imported multimodal agent visual review.");
  }
  if (!review) {
    errors.push("Missing report.agentVisualReview.");
  } else {
    errors.push(...validateAgentVisualReview(report, review));
    if (review.visualFindings.length === 0 && report.groupedIssues.length === 0 && review.designVerdict.readiness !== "no_major_redesign_needed") {
      warnings.push("Agent visual review contains no findings and there are no grouped issues.");
    }
  }
  if (report.groupedIssues.length === 0 && report.findings.length > 0) {
    errors.push("Findings exist but groupedIssues is empty.");
  }
  for (const issue of report.groupedIssues) {
    if (issue.recommendation.length < 20 || issue.acceptanceCriteria.length === 0 || issue.evidenceRefs.length === 0) {
      errors.push(`Grouped issue is not actionable enough: ${issue.issueId}`);
    }
  }

  return {
    schemaVersion: "design-review-workflow.business-grade-gate.v1",
    status: errors.length > 0 ? "fail" : "pass",
    businessGradeStatus: report.businessGradeStatus,
    checkedAt: new Date().toISOString(),
    errors,
    warnings,
    summary: {
      screenshotsReviewed: review?.screenshotsReviewed.length ?? 0,
      pageReviews: review?.pageReviews.length ?? 0,
      visualFindings: review?.visualFindings.length ?? 0,
      redesignActions: review?.redesignActions.length ?? 0,
      groupedIssues: report.groupedIssues.length,
      designVerdict: review?.designVerdict ? "present" : "missing"
    }
  };
}

export function automatedBusinessGradeGate(report: AuditReport): BusinessGradeGateResult {
  return evaluateBusinessGradeGate({ ...report, businessGradeStatus: report.businessGradeStatus ?? "automated_scan" });
}

function validateAgentVisualReview(report: AuditReport, review: AgentVisualReview): string[] {
  const errors: string[] = [];
  if (review.auditId !== report.auditId) {
    errors.push(`Review auditId ${review.auditId} does not match report ${report.auditId}.`);
  }
  for (const { path, value } of reviewStrings(review)) {
    if (templateTextPattern.test(value)) {
      errors.push(`Visual review contains template/TODO text at ${path}.`);
    }
    if (weakTextPattern.test(value.trim())) {
      errors.push(`Visual review text is too generic at ${path}.`);
    }
    if (unsupportedClaimPattern.test(value)) {
      errors.push(`Visual review appears to make an unsupported analytics/user/competitor claim at ${path}.`);
    }
  }
  if (review.strengths.length === 0) {
    errors.push("Agent visual review must include at least one concrete strength.");
  }
  if (review.risks.length === 0) {
    errors.push("Agent visual review must include at least one concrete risk.");
  }
  if (review.redesignActions.length < 3 && review.designVerdict.readiness !== "no_major_redesign_needed") {
    errors.push("Business-grade review requires at least 3 redesign actions unless designVerdict.readiness is no_major_redesign_needed.");
  }
  if (review.redesignActions.length === 0 && review.designVerdict.readiness === "no_major_redesign_needed" && review.designVerdict.rationale.length < 80) {
    errors.push("No-major-redesign verdict needs a detailed evidence-backed rationale.");
  }

  const pagesById = new Map(report.pages.map((page) => [page.pageId, page]));
  const reviewedPageIds = new Set(review.pageReviews.map((pageReview) => pageReview.pageId));
  for (const page of report.pages) {
    if (!reviewedPageIds.has(page.pageId)) {
      errors.push(`Missing visual review for captured page: ${page.pageId}`);
    }
  }
  const screenshotIds = new Set<string>();
  const screenshotPaths = new Set<string>();
  const screenshotPage = new Map<string, string>();
  for (const page of report.pages) {
    for (const screenshot of Object.values(page.screenshots)) {
      screenshotIds.add(screenshot.id);
      screenshotPaths.add(screenshot.path);
      screenshotPage.set(screenshot.id, page.pageId);
      screenshotPage.set(screenshot.path, page.pageId);
    }
  }
  const isKnownScreenshot = (ref: string) => screenshotIds.has(ref) || screenshotPaths.has(ref);
  const reviewedScreenshots = new Set(review.screenshotsReviewed);

  for (const ref of review.screenshotsReviewed) {
    if (!isKnownScreenshot(ref)) {
      errors.push(`Review references unknown screenshot: ${ref}`);
    }
  }
  for (const pageReview of review.pageReviews) {
    const page = pagesById.get(pageReview.pageId);
    if (!page) {
      errors.push(`Page review references unknown pageId: ${pageReview.pageId}`);
      continue;
    }
    if (pageReview.url !== page.url) {
      errors.push(`Page review URL mismatch for ${pageReview.pageId}.`);
    }
    for (const ref of pageReview.screenshotsReviewed) {
      if (!isKnownScreenshot(ref)) {
        errors.push(`Page review references unknown screenshot: ${ref}`);
      }
      if (!reviewedScreenshots.has(ref)) {
        errors.push(`Page review uses screenshot not listed in screenshotsReviewed: ${ref}`);
      }
    }
    if (!pageReview.screenshotsReviewed.some((ref) => screenshotPage.get(ref) === pageReview.pageId)) {
      errors.push(`Page review for ${pageReview.pageId} must reference at least one screenshot from that page.`);
    }
  }
  for (const finding of review.visualFindings) {
    const page = pagesById.get(finding.pageId);
    if (!page) {
      errors.push(`Visual finding references unknown pageId: ${finding.pageId}`);
      continue;
    }
    if (finding.url !== page.url) {
      errors.push(`Visual finding URL mismatch for ${finding.reviewId}.`);
    }
    for (const ref of finding.evidenceRefs) {
      if (!isKnownScreenshot(ref)) {
        errors.push(`Visual finding references unknown screenshot: ${ref}`);
      }
      if (!reviewedScreenshots.has(ref)) {
        errors.push(`Visual finding uses screenshot not listed in screenshotsReviewed: ${ref}`);
      }
    }
    const claimText = `${finding.observation} ${finding.whyItMatters} ${finding.recommendation}`;
    if (unsupportedClaimPattern.test(claimText)) {
      errors.push(`Visual finding appears to make an unsupported analytics/user/competitor claim: ${finding.reviewId}`);
    }
  }
  for (const action of review.redesignActions) {
    for (const pageRef of action.affectedPages) {
      const page = pagesById.get(pageRef.pageId);
      if (!page) {
        errors.push(`Redesign action references unknown pageId: ${action.actionId}/${pageRef.pageId}`);
        continue;
      }
      if (pageRef.url !== page.url) {
        errors.push(`Redesign action URL mismatch for ${action.actionId}/${pageRef.pageId}.`);
      }
    }
    for (const ref of action.evidenceRefs) {
      if (!isKnownScreenshot(ref)) {
        errors.push(`Redesign action references unknown screenshot: ${action.actionId}/${ref}`);
      }
      if (!reviewedScreenshots.has(ref)) {
        errors.push(`Redesign action uses screenshot not listed in screenshotsReviewed: ${action.actionId}/${ref}`);
      }
    }
  }
  return errors;
}

function reviewStrings(review: AgentVisualReview): Array<{ path: string; value: string }> {
  const result: Array<{ path: string; value: string }> = [];
  const visit = (value: unknown, path: string) => {
    if (typeof value === "string") {
      result.push({ path, value });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        visit(nested, path ? `${path}.${key}` : key);
      }
    }
  };
  visit(review, "review");
  return result.filter(({ path }) => !path.endsWith(".reviewer") && !path.endsWith(".auditId") && !path.endsWith(".reviewedAt") && !path.includes("evidenceRefs") && !path.includes("screenshotsReviewed"));
}

function readinessLabel(readiness: AgentVisualReview["designVerdict"]["readiness"]): string {
  return readiness.replace(/_/g, " ");
}

function agentFindingToFinding(
  report: AuditReport,
  review: AgentVisualReview,
  finding: AgentVisualReview["visualFindings"][number],
  index: number
): Finding {
  const page = report.pages.find((item) => item.pageId === finding.pageId);
  return {
    findingId: stableId("agent_finding", `${review.reviewer}:${finding.reviewId}:${finding.title}`, index),
    source: "agent_visual",
    title: finding.title,
    category: finding.category,
    severity: finding.severity,
    priorityScore: priorityScore({
      severity: finding.severity,
      impact: finding.impact,
      confidence: finding.confidence,
      effort: finding.effort,
      pageImportance: page?.businessImportance ?? "medium"
    }),
    impact: finding.impact,
    effort: finding.effort,
    confidence: finding.confidence,
    evidence: {
      pageId: finding.pageId,
      url: finding.url,
      section: finding.section,
      screenshotRefs: finding.evidenceRefs,
      textQuotes: []
    },
    observation: finding.observation,
    whyItMatters: finding.whyItMatters,
    recommendation: finding.recommendation,
    designPrinciples: [finding.category],
    implementation: {
      owner: ownerForCategory(finding.category),
      acceptanceCriteria: finding.acceptanceCriteria,
      dependencies: [],
      definitionOfDone: ["The changed page has been visually reviewed again.", "A new workflow run shows the issue is resolved or intentionally suppressed."]
    },
    relatedFindings: [finding.reviewId, ...finding.sourceFindingIds]
  };
}

function ticketsFromGroupedIssues(groupedIssues: GroupedIssue[], findings: Finding[]): TicketRecommendation[] {
  if (groupedIssues.length === 0) return createTickets(findings);
  return groupedIssues.slice(0, 12).map((issue) => ({
    title: issue.title,
    role: ownerForCategory(issue.category),
    priority: issue.severity,
    effort: effortForIssue(issue, findings),
    sourceFindingIds: issue.sourceFindingIds,
    problem: issue.observation,
    goal: issue.recommendation,
    scope: [...new Set(issue.affectedPages.map((page) => page.section ?? page.url))].slice(0, 6),
    acceptanceCriteria: issue.acceptanceCriteria,
    definitionOfDone: ["Affected pages are re-reviewed visually.", "Evidence screenshots show the issue is resolved."],
    evidenceRefs: [...issue.evidenceRefs, ...issue.affectedPages.map((page) => page.url)]
  }));
}

function ticketsFromRedesignActions(actions: AgentVisualReview["redesignActions"]): TicketRecommendation[] {
  return actions.slice(0, 8).map((action) => ({
    title: action.title,
    role: ["designer", "developer"],
    priority: action.priority,
    effort: action.effort,
    sourceFindingIds: action.sourceFindingIds,
    problem: action.expectedImpact,
    goal: action.recommendation,
    scope: action.affectedPages.map((page) => page.section ?? page.url),
    acceptanceCriteria: action.acceptanceCriteria,
    definitionOfDone: ["Affected screenshots are re-reviewed by the workflow-running agent.", "The updated static report shows the action as resolved or intentionally accepted."],
    evidenceRefs: [...action.evidenceRefs, ...action.affectedPages.map((page) => page.url)]
  }));
}

function ownerForCategory(category: Finding["category"]): Finding["implementation"]["owner"] {
  if (category === "content_design" || category === "brand") return ["copywriter", "marketing"];
  if (category === "accessibility_basic" || category === "performance_perception") return ["developer", "designer"];
  if (category === "conversion" || category === "trust") return ["designer", "copywriter", "product"];
  return ["designer", "developer"];
}

function effortForIssue(issue: GroupedIssue, findings: Finding[]): Finding["effort"] {
  const related = findings.filter((finding) => issue.sourceFindingIds.includes(finding.findingId));
  if (related.some((finding) => finding.effort === "high")) return "high";
  if (related.some((finding) => finding.effort === "medium")) return "medium";
  return "low";
}
