import { AgentVisualReview, Finding, GroupedIssue } from "../schemas/audit.js";
import { stableId } from "../utils/id.js";

export function groupFindings(findings: Finding[], agentReview?: AgentVisualReview): GroupedIssue[] {
  const groups = new Map<string, GroupedIssue>();
  const reviewIds = new Set(agentReview?.visualFindings.map((finding) => finding.reviewId) ?? []);

  for (const finding of findings) {
    const key = groupKey(finding);
    const existing = groups.get(key);
    const sourceReviewIds = finding.source === "agent_visual" ? finding.relatedFindings.filter((id) => reviewIds.has(id)) : [];
    const issue: GroupedIssue =
      existing ??
      {
        issueId: stableId("issue", key, groups.size + 1),
        title: finding.title,
        category: finding.category,
        severity: finding.severity,
        priorityScore: finding.priorityScore,
        source: finding.source,
        affectedPages: [],
        sourceFindingIds: [],
        sourceReviewIds: [],
        evidenceRefs: [],
        observation: finding.observation,
        recommendation: finding.recommendation,
        acceptanceCriteria: finding.implementation.acceptanceCriteria
      };

    issue.priorityScore = Math.max(issue.priorityScore, finding.priorityScore);
    issue.severity = severityRank(finding.severity) > severityRank(issue.severity) ? finding.severity : issue.severity;
    issue.source = issue.source === finding.source ? issue.source : "merged";
    issue.sourceFindingIds = unique([...issue.sourceFindingIds, finding.findingId]);
    issue.sourceReviewIds = unique([...issue.sourceReviewIds, ...sourceReviewIds]);
    issue.evidenceRefs = unique([...issue.evidenceRefs, ...finding.evidence.screenshotRefs]);
    issue.acceptanceCriteria = unique([...issue.acceptanceCriteria, ...finding.implementation.acceptanceCriteria]);

    if (!issue.affectedPages.some((page) => page.pageId === finding.evidence.pageId && page.section === finding.evidence.section)) {
      issue.affectedPages.push({
        pageId: finding.evidence.pageId,
        url: finding.evidence.url,
        section: finding.evidence.section
      });
    }

    groups.set(key, issue);
  }

  return [...groups.values()].sort((a, b) => b.priorityScore - a.priorityScore);
}

function groupKey(finding: Finding): string {
  return `${finding.category}:${normalize(finding.title)}:${normalize(finding.recommendation)}`;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function severityRank(value: Finding["severity"]): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[value];
}
