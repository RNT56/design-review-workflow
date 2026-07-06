import * as path from "node:path";
import { captureEvidence } from "./capture/capture.js";
import { runCompetitorBenchmarks } from "./benchmark/competitors.js";
import { AuditInput, createAuditConfig } from "./config/defaults.js";
import { writeReports, type ReportOutputs } from "./report/index.js";
import {
  AuditConfig,
  AuditConfigSchema,
  AuditReport,
  AuditReportSchema,
  FindingSchema,
  PageEvidenceSchema,
  ProgressEvent,
  ScorecardSchema
} from "./schemas/audit.js";
import { createAuditPaths } from "./storage/project.js";
import { updateProjectIndex } from "./storage/index.js";
import { writeJson } from "./utils/fs.js";
import { reviewEvidence } from "./review/findings.js";

export * from "./config/defaults.js";
export * from "./criteria/library.js";
export * from "./model/router.js";
export * from "./model/providers.js";
export * from "./schemas/audit.js";
export * from "./review/classification.js";
export * from "./review/scoring.js";
export * from "./compare/compare.js";
export * from "./storage/index.js";
export * from "./integrations/figma.js";
export * from "./monitoring/monitor.js";
export * from "./validation/report-lint.js";

export type RunAuditOptions = {
  workspaceRoot?: string;
  onProgress?: (event: ProgressEvent) => void;
};

export type RunAuditResult = {
  config: AuditConfig;
  auditRoot: string;
  report: AuditReport;
  outputs: ReportOutputs;
};

export async function runAudit(input: AuditInput | AuditConfig, options: RunAuditOptions = {}): Promise<RunAuditResult> {
  const config = AuditConfigSchema.safeParse(input).success ? AuditConfigSchema.parse(input) : createAuditConfig(input as AuditInput);
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const paths = await createAuditPaths(config, workspaceRoot);

  options.onProgress?.({ stage: "start", message: `Audit ${config.auditId} created` });
  await writeJson(path.join(paths.auditRoot, "audit-state.json"), {
    auditId: config.auditId,
    status: "capturing",
    updatedAt: new Date().toISOString()
  });

  const capture = await captureEvidence(config, paths, options.onProgress);

  await writeJson(path.join(paths.auditRoot, "audit-state.json"), {
    auditId: config.auditId,
    status: "reviewing",
    updatedAt: new Date().toISOString(),
    capturedPages: capture.pages.length
  });

  options.onProgress?.({ stage: "review", message: "Generating structured findings" });
  const report = AuditReportSchema.parse(await reviewEvidence(config, capture.pages, paths));

  if (config.competitors.length > 0) {
    report.competitorBenchmarks = await runCompetitorBenchmarks(config, report.scorecard.overallScore, paths, options.onProgress);
  }

  options.onProgress?.({ stage: "report", message: "Writing reports" });
  const outputs = await writeReports(config, report, paths);
  await updateProjectIndex(workspaceRoot, report, paths.auditRoot, outputs);

  await writeJson(path.join(paths.auditRoot, "audit-state.json"), {
    auditId: config.auditId,
    status: "completed",
    updatedAt: new Date().toISOString(),
    report: outputs
  });

  options.onProgress?.({ stage: "done", message: `Audit completed at ${paths.auditRoot}` });

  return {
    config,
    auditRoot: paths.auditRoot,
    report,
    outputs
  };
}

export function validateReport(data: unknown): AuditReport {
  return AuditReportSchema.parse(data);
}

export const schemas = {
  AuditConfigSchema,
  AuditReportSchema,
  FindingSchema,
  PageEvidenceSchema,
  ScorecardSchema
};
