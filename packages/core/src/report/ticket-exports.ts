import * as path from "node:path";
import { AuditReport, TicketExportBundle, TicketRecommendation } from "../schemas/audit.js";
import { AuditPaths } from "../storage/project.js";
import { writeJson, writeText } from "../utils/fs.js";

export async function writeTicketExports(report: AuditReport, paths: AuditPaths): Promise<TicketExportBundle> {
  const backlogJsonPath = path.join(paths.exports, "ticket-backlog.json");
  const githubIssuesPath = path.join(paths.exports, "github-issues.md");
  const linearCsvPath = path.join(paths.exports, "linear-import.csv");
  const jiraCsvPath = path.join(paths.exports, "jira-import.csv");

  await writeJson(backlogJsonPath, report.tickets);
  await writeText(githubIssuesPath, renderGithubIssues(report.tickets));
  await writeText(linearCsvPath, renderCsv(report.tickets, "linear"));
  await writeText(jiraCsvPath, renderCsv(report.tickets, "jira"));

  return {
    backlogJsonPath,
    githubIssuesPath,
    linearCsvPath,
    jiraCsvPath
  };
}

function renderGithubIssues(tickets: TicketRecommendation[]): string {
  return `${tickets
    .map(
      (ticket) => `## ${ticket.title}

**Priority:** ${ticket.priority}
**Owner:** ${ticket.role.join(", ")}
**Effort:** ${ticket.effort}

### Problem
${ticket.problem}

### Goal
${ticket.goal}

### Scope
${ticket.scope.map((item) => `- ${item}`).join("\n")}

### Acceptance Criteria
${ticket.acceptanceCriteria.map((item) => `- [ ] ${item}`).join("\n")}

### Definition Of Done
${ticket.definitionOfDone.map((item) => `- [ ] ${item}`).join("\n")}

### Evidence
${ticket.evidenceRefs.map((item) => `- ${item}`).join("\n")}
`
    )
    .join("\n---\n\n")}\n`;
}

function renderCsv(tickets: TicketRecommendation[], target: "linear" | "jira"): string {
  const headers = target === "linear" ? ["Title", "Description", "Priority", "Labels"] : ["Summary", "Description", "Priority", "Issue Type", "Labels"];
  const rows = tickets.map((ticket) => {
    const description = [
      `Problem: ${ticket.problem}`,
      `Goal: ${ticket.goal}`,
      `Acceptance criteria: ${ticket.acceptanceCriteria.join("; ")}`,
      `Evidence: ${ticket.evidenceRefs.join("; ")}`
    ].join("\n\n");
    const labels = [...ticket.role, ticket.effort, ...ticket.sourceFindingIds].join(",");
    return target === "linear"
      ? [ticket.title, description, ticket.priority, labels]
      : [ticket.title, description, ticket.priority, "Task", labels];
  });

  return `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
