import { copyFile, readFile } from "node:fs/promises";
import * as path from "node:path";
import { applyAgentVisualReview, evaluateBusinessGradeGate, parseAgentVisualReview, type BusinessGradeGateResult } from "../review/business-grade.js";
import { groupFindings } from "../review/grouping.js";
import { createScorecard } from "../review/scoring.js";
import { AuditReport } from "../schemas/audit.js";
import { auditReportsRootFromAuditDir, workspaceRootFromAuditReportsRoot } from "../storage/audit-output.js";
import { readReportFromAuditDir, updateProjectIndex } from "../storage/index.js";
import { createNestedAuditPaths } from "../storage/project.js";
import { ensureDir, writeJson } from "../utils/fs.js";
import { writeReports, type ReportOutputs } from "./index.js";

export type AgentReviewImportResult = {
  auditId: string;
  auditRoot: string;
  report: AuditReport;
  outputs: ReportOutputs;
  gate: BusinessGradeGateResult;
  canonicalReviewPath: string;
  reviewerRunPath: string;
};

export async function markAgentReviewPending(auditDir: string): Promise<AgentReviewImportResult> {
  const paths = await createNestedAuditPaths(auditDir);
  const report = await readReportFromAuditDir(auditDir);
  const updatedReport: AuditReport = {
    ...report,
    businessGradeStatus: "agent_review_pending",
    groupedIssues: report.groupedIssues.length > 0 ? report.groupedIssues : groupFindings(report.findings, report.agentVisualReview),
    scorecard: createScorecard(report.findings, report.pages, report.websiteType, "agent_review_pending")
  };
  const outputs = await writeReports(updatedReport.config, updatedReport, paths);
  const gate = evaluateBusinessGradeGate(updatedReport);
  await writeJson(path.join(paths.report, "business-grade-gate.json"), gate);
  await updateProjectIndex(workspaceRootFromAuditDir(auditDir), updatedReport, auditDir, outputs).catch(() => undefined);
  return {
    auditId: updatedReport.auditId,
    auditRoot: auditDir,
    report: updatedReport,
    outputs,
    gate,
    canonicalReviewPath: path.join(paths.report, "agent-visual-review.json"),
    reviewerRunPath: path.join(paths.agentRuns, "<agent>", "visual-review.json")
  };
}

export async function importAgentVisualReview(auditDir: string, filePath: string): Promise<AgentReviewImportResult> {
  const paths = await createNestedAuditPaths(auditDir);
  const report = await readReportFromAuditDir(auditDir);
  const review = parseAgentVisualReview(JSON.parse(await readFile(filePath, "utf8")));
  const updatedReport = applyAgentVisualReview(report, review);
  const canonicalReviewPath = path.join(paths.report, "agent-visual-review.json");
  const reviewerRunPath = path.join(paths.agentRuns, slug(review.reviewer), "visual-review.json");

  await ensureDir(path.dirname(reviewerRunPath));
  await copyFile(filePath, reviewerRunPath).catch(async () => {
    await writeJson(reviewerRunPath, review);
  });
  await writeJson(canonicalReviewPath, review);

  const outputs = await writeReports(updatedReport.config, updatedReport, paths);
  const gate = evaluateBusinessGradeGate(updatedReport);
  await writeJson(path.join(paths.report, "business-grade-gate.json"), gate);
  await updateProjectIndex(workspaceRootFromAuditDir(auditDir), updatedReport, auditDir, outputs).catch(() => undefined);

  return {
    auditId: updatedReport.auditId,
    auditRoot: auditDir,
    report: updatedReport,
    outputs,
    gate,
    canonicalReviewPath,
    reviewerRunPath
  };
}

function workspaceRootFromAuditDir(auditDir: string): string {
  const auditReportsRoot = auditReportsRootFromAuditDir(auditDir);
  if (auditReportsRoot) {
    return workspaceRootFromAuditReportsRoot(auditReportsRoot);
  }
  return path.dirname(path.dirname(path.resolve(auditDir)));
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
}
