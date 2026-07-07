import * as path from "node:path";
import { AuditConfig, AuditReport } from "../schemas/audit.js";
import { AuditPaths } from "../storage/project.js";
import { writeJson, writeText } from "../utils/fs.js";
import { renderHtmlReport } from "./html.js";
import { renderMarkdownReport } from "./markdown.js";
import { renderPdfFromHtml } from "./pdf.js";
import { writeTicketExports } from "./ticket-exports.js";
import { writeAgentBundle } from "./agent-bundle.js";
import { writeBusinessGradeArtifacts } from "./business-grade-artifacts.js";
import { groupFindings } from "../review/grouping.js";

export type ReportOutputs = {
  json?: string;
  markdown?: string;
  html?: string;
  pdf?: string;
  executiveSummary?: string;
};

export async function writeReports(config: AuditConfig, report: AuditReport, paths: AuditPaths): Promise<ReportOutputs> {
  const outputs: ReportOutputs = {};
  report.businessGradeStatus = report.businessGradeStatus ?? "automated_scan";
  report.groupedIssues = report.groupedIssues.length > 0 ? report.groupedIssues : groupFindings(report.findings, report.agentVisualReview);
  report.ticketExports = await writeTicketExports(report, paths);

  outputs.json = path.join(paths.report, "report.json");
  await writeJson(outputs.json, report);

  if (config.outputs.markdown) {
    outputs.markdown = path.join(paths.report, "report.md");
    await writeText(outputs.markdown, renderMarkdownReport(report));
  }

  if (config.outputs.html || config.outputs.pdf) {
    outputs.html = path.join(paths.report, "report.html");
    await writeText(outputs.html, renderHtmlReport(report));
  }

  outputs.executiveSummary = path.join(paths.report, "executive-summary.md");
  await writeText(
    outputs.executiveSummary,
    [
      `# Executive Summary`,
      "",
      `Overall score: ${report.scorecard.overallScore}/100`,
      `Validated findings: ${report.findings.length}`,
      `Pages reviewed: ${report.pages.length}`,
      "",
      ...report.findings.slice(0, 5).map((finding) => `- ${finding.title} (${finding.severity}, priority ${finding.priorityScore})`),
      ""
    ].join("\n")
  );

  if (config.outputs.pdf && outputs.html) {
    outputs.pdf = path.join(paths.report, "report.pdf");
    await renderPdfFromHtml(outputs.html, outputs.pdf);
  }

  await writeBusinessGradeArtifacts(report, paths);
  await writeAgentBundle(report, paths, outputs);

  return outputs;
}
