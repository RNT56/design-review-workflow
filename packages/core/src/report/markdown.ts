import { AuditReport, Finding } from "../schemas/audit.js";

export function renderMarkdownReport(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(`# Website Design Review: ${new URL(report.config.url).hostname}`);
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Mode: ${report.config.mode}`);
  lines.push(`Business-grade status: ${report.businessGradeStatus}`);
  lines.push(`Website type: ${report.websiteType} (${report.websiteTypeConfidence} confidence)`);
  lines.push("");

  lines.push("## Executive Summary");
  lines.push("");
  lines.push(`Overall score: **${report.scorecard.overallScore}/100**`);
  if (report.businessGradeStatus !== "business_grade") {
    lines.push("This report is not labeled business-grade until a repo-capable multimodal agent imports a validated visual review artifact.");
  }
  if (report.findings.length > 0) {
    lines.push(`The audit found ${report.findings.length} validated finding(s). The highest priority risks are:`);
    for (const finding of report.findings.slice(0, 5)) {
      lines.push(`- ${finding.title} (${finding.severity}, priority ${finding.priorityScore})`);
    }
  } else {
    lines.push("Automated rules found no deterministic blockers; this is not a design-quality verdict until strict multimodal visual review is imported.");
  }
  lines.push("");

  lines.push("## Design Verdict");
  lines.push("");
  if (report.agentVisualReview && report.businessGradeStatus === "business_grade") {
    const verdict = report.agentVisualReview.designVerdict;
    lines.push(`Readiness: **${formatScoreLabel(verdict.readiness)}**`);
    lines.push("");
    lines.push(`Style and taste: ${verdict.styleAndTaste}`);
    lines.push("");
    lines.push(`Messaging and copy: ${verdict.messagingAndCopy}`);
    lines.push("");
    lines.push(`Audience fit: ${verdict.audienceFit}`);
    lines.push("");
    lines.push(`Brand fit: ${verdict.brandFit}`);
    lines.push("");
    lines.push(`Redesign direction: ${verdict.redesignDirection}`);
    lines.push("");
    lines.push(`Rationale: ${verdict.rationale}`);
    lines.push("");
    lines.push("Strongest design qualities:");
    for (const item of verdict.strongestDesignQualities) lines.push(`- ${item}`);
    lines.push("");
    lines.push("Weakest design risks:");
    for (const item of verdict.weakestDesignRisks) lines.push(`- ${item}`);
    lines.push("");
    lines.push("### Prioritized Redesign Actions");
    lines.push("");
    if (report.agentVisualReview.redesignActions.length === 0) {
      lines.push("The imported review did not require major redesign actions.");
    } else {
      for (const action of report.agentVisualReview.redesignActions) {
        lines.push(`#### ${action.title}`);
        lines.push(`Priority: ${action.priority}; confidence: ${action.confidence}; effort: ${action.effort}`);
        lines.push("");
        lines.push(`Recommendation: ${action.recommendation}`);
        lines.push("");
        lines.push(`Expected impact: ${action.expectedImpact}`);
        lines.push("");
        lines.push(`Evidence: ${action.evidenceRefs.join(", ")}`);
        lines.push("");
      }
    }
  } else {
    lines.push("Visual review required. Automated rules may find deterministic blockers, but this is not a design-quality verdict and does not include style/taste judgment.");
    lines.push("");
    lines.push("A repo-capable multimodal agent must inspect the screenshots, complete `agent-runs/<agent>/visual-review.json`, import it, and pass `business-grade lint` before this report can claim business-grade design judgment.");
  }
  lines.push("");

  lines.push("## Grouped Issues");
  lines.push("");
  if (report.groupedIssues.length === 0) {
    lines.push("No grouped deterministic issues were generated. Business-grade design judgment still requires imported strict visual review.");
  } else {
    for (const issue of report.groupedIssues.slice(0, 12)) {
      lines.push(`### [${issue.severity.toUpperCase()}] ${issue.title}`);
      lines.push(`Source: ${issue.source}`);
      lines.push(`Priority: ${issue.priorityScore}`);
      lines.push(`Affected pages: ${issue.affectedPages.map((page) => page.section ? `${page.url} (${page.section})` : page.url).join(", ")}`);
      lines.push("");
      lines.push(`Observation: ${issue.observation}`);
      lines.push("");
      lines.push(`Recommendation: ${issue.recommendation}`);
      lines.push("");
      lines.push("Acceptance criteria:");
      for (const criterion of issue.acceptanceCriteria) {
        lines.push(`- ${criterion}`);
      }
      lines.push("");
    }
  }
  lines.push("");

  if (report.agentVisualReview) {
    lines.push("## Agent Visual Review");
    lines.push("");
    lines.push(`Reviewer: ${report.agentVisualReview.reviewer}`);
    lines.push(`Reviewed at: ${report.agentVisualReview.reviewedAt}`);
    lines.push(`Screenshots reviewed: ${report.agentVisualReview.screenshotsReviewed.length}`);
    lines.push(`Confidence: ${report.agentVisualReview.confidence}`);
    lines.push("");
    for (const review of report.agentVisualReview.pageReviews) {
      lines.push(`### ${review.url}`);
      lines.push(`First viewport: ${review.firstViewport}`);
      lines.push(`Hierarchy: ${review.hierarchy}`);
      lines.push(`Composition: ${review.composition}`);
      lines.push(`CTA clarity: ${review.ctaClarity}`);
      lines.push(`Messaging/copy: ${review.messagingAndCopy}`);
      lines.push(`Mobile: ${review.mobile}`);
      lines.push(`Trust/proof: ${review.trustAndProof}`);
      lines.push(`Visual system: ${review.visualSystemCoherence}`);
      lines.push(`Accessibility basics: ${review.accessibilityBasics}`);
      lines.push(`Style/taste: ${review.styleAndTaste}`);
      lines.push(`Redesign advice: ${review.redesignAdvice}`);
      lines.push("");
    }
  }

  lines.push("## Scorecard");
  lines.push("");
  lines.push("| Dimension | Score | Confidence |");
  lines.push("| --- | ---: | --- |");
  for (const [label, item] of Object.entries(report.scorecard.subscores)) {
    lines.push(`| ${formatScoreLabel(label)} | ${item.score} | ${item.confidence} |`);
  }
  lines.push("");

  lines.push("## Top Prioritized Findings");
  lines.push("");
  for (const finding of report.findings.slice(0, 10)) {
    lines.push(renderFinding(finding));
  }

  lines.push("## Quick Wins");
  lines.push("");
  if (report.quickWins.length === 0) {
    lines.push("No high-confidence low-effort quick wins were detected.");
  } else {
    for (const finding of report.quickWins) {
      lines.push(`- **${finding.title}**: ${finding.recommendation}`);
    }
  }
  lines.push("");

  lines.push("## Page Inventory");
  lines.push("");

  if (report.competitorBenchmarks.length > 0) {
    lines.push("## Competitor Benchmark");
    lines.push("");
    lines.push("| Competitor | Score | Pages | Top Gap |");
    lines.push("| --- | ---: | ---: | --- |");
    for (const competitor of report.competitorBenchmarks) {
      lines.push(`| ${competitor.competitorUrl} | ${competitor.scorecard.overallScore} | ${competitor.pagesReviewed} | ${competitor.relativeWeaknesses[0] ?? ""} |`);
    }
    lines.push("");
  }

  if (report.screenshotAnnotations.length > 0) {
    lines.push("## Screenshot Annotations");
    lines.push("");
    for (const annotation of report.screenshotAnnotations.slice(0, 20)) {
      lines.push(`- ${annotation.label}: ${annotation.annotatedScreenshot.path}`);
    }
    lines.push("");
  }
  lines.push("| Page | Type | Importance | Title |");
  lines.push("| --- | --- | --- | --- |");
  for (const page of report.pages) {
    lines.push(`| ${page.url} | ${page.pageType} | ${page.businessImportance} | ${page.title ?? ""} |`);
  }
  lines.push("");

  lines.push("## Redesign Briefing");
  lines.push("");
  for (const section of report.redesignBriefing) {
    lines.push(`### ${section.title}`);
    lines.push(section.body);
    lines.push("");
  }

  lines.push("## Ticket-Ready Recommendations");
  lines.push("");
  for (const ticket of report.tickets) {
    lines.push(`### ${ticket.title}`);
    lines.push(`Priority: ${ticket.priority}`);
    lines.push(`Owner: ${ticket.role.join(", ")}`);
    lines.push(`Effort: ${ticket.effort}`);
    lines.push("");
    lines.push(`Problem: ${ticket.problem}`);
    lines.push("");
    lines.push(`Goal: ${ticket.goal}`);
    lines.push("");
    lines.push("Acceptance criteria:");
    for (const criterion of ticket.acceptanceCriteria) {
      lines.push(`- ${criterion}`);
    }
    lines.push("");
  }

  if (report.ticketExports) {
    lines.push("## Ticket Export Files");
    lines.push("");
    if (report.ticketExports.githubIssuesPath) lines.push(`- GitHub issue markdown: ${report.ticketExports.githubIssuesPath}`);
    if (report.ticketExports.linearCsvPath) lines.push(`- Linear CSV: ${report.ticketExports.linearCsvPath}`);
    if (report.ticketExports.jiraCsvPath) lines.push(`- Jira CSV: ${report.ticketExports.jiraCsvPath}`);
    if (report.ticketExports.backlogJsonPath) lines.push(`- Backlog JSON: ${report.ticketExports.backlogJsonPath}`);
    lines.push("");
  }

  lines.push("## Evidence Appendix");
  lines.push("");
  for (const page of report.pages) {
    lines.push(`### ${page.url}`);
    lines.push(`Screenshots: ${Object.values(page.screenshots).map((screenshot) => screenshot.path).join(", ")}`);
    lines.push(`Headings: ${page.text.headings.map((heading) => heading.text).slice(0, 8).join(" | ")}`);
    lines.push("");
  }

  lines.push("## Assumptions And Limitations");
  lines.push("");
  for (const assumption of report.assumptions) {
    lines.push(`- ${assumption}`);
  }
  for (const limitation of report.limitations) {
    lines.push(`- ${limitation}`);
  }
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function renderFinding(finding: Finding): string {
  return [
    `### [${finding.severity.toUpperCase()}] ${finding.title}`,
    `**Page:** ${finding.evidence.url}`,
    `**Viewport:** ${finding.evidence.viewport ?? "not viewport-specific"}`,
    `**Section:** ${finding.evidence.section ?? "unspecified"}`,
    `**Category:** ${finding.category}`,
    `**Source:** ${finding.source}`,
    `**Impact:** ${finding.impact}`,
    `**Effort:** ${finding.effort}`,
    `**Confidence:** ${finding.confidence}`,
    `**Priority:** ${finding.priorityScore}`,
    `**Evidence:** ${finding.evidence.screenshotRefs.join(", ") || finding.evidence.pageId}`,
    "",
    `**Observation:** ${finding.observation}`,
    "",
    `**Why it matters:** ${finding.whyItMatters}`,
    "",
    `**Recommendation:** ${finding.recommendation}`,
    "",
    "**Acceptance criteria:**",
    ...finding.implementation.acceptanceCriteria.map((criterion) => `- ${criterion}`),
    ""
  ].join("\n");
}

function formatScoreLabel(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}
