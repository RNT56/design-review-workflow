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
  InteractionSettingsSchema,
  InteractionStateEvidenceSchema,
  PageEvidenceSchema,
  ProgressEvent,
  ScorecardSchema
} from "./schemas/audit.js";
import { createAuditPaths } from "./storage/project.js";
import { updateProjectIndex } from "./storage/index.js";
import { writeJson } from "./utils/fs.js";
import { reviewEvidence } from "./review/findings.js";
import { finalizeAuditValidation, type ReportLintResult } from "./validation/report-lint.js";

export * from "./config/defaults.js";
export * from "./criteria/library.js";
export * from "./model/router.js";
export * from "./model/providers.js";
export * from "./schemas/audit.js";
export * from "./review/classification.js";
export * from "./review/scoring.js";
export * from "./review/suppressions.js";
export * from "./review/grouping.js";
export * from "./review/business-grade.js";
export * from "./compare/compare.js";
export * from "./storage/index.js";
export * from "./storage/audit-output.js";
export * from "./integrations/figma.js";
export * from "./monitoring/monitor.js";
export * from "./validation/report-lint.js";
export * from "./validation/integrity.js";
export * from "./report/design-artifacts.js";
export * from "./report/screenshot-manifest.js";
export * from "./report/business-grade-artifacts.js";
export * from "./report/review-pack.js";
export * from "./report/agent-review-import.js";
export * from "./report/agent-review-generate.js";
export * from "./report/evidence-brief.js";
export * from "./report/export.js";
export * from "./report/related-workflows.js";
export * from "./source/repo-analysis.js";
export * from "./enterprise/verify.js";
export * from "./enterprise/retention.js";
export * from "./enterprise/fixtures.js";
export * from "./enterprise/fixture-runner.js";
export * from "./security/network-policy.js";

export type RunAuditOptions = {
  workspaceRoot?: string;
  auditRoot?: string;
  auditName?: string;
  auditSlug?: string;
  auditRunId?: string;
  outputDir?: string;
  onProgress?: (event: ProgressEvent) => void;
  signal?: AbortSignal;
  validateNavigation?: (url: string) => Promise<void>;
};

export type RunAuditResult = {
  config: AuditConfig;
  auditRoot: string;
  report: AuditReport;
  outputs: ReportOutputs;
  validation: ReportLintResult;
};

export async function runAudit(input: AuditInput | AuditConfig, options: RunAuditOptions = {}): Promise<RunAuditResult> {
  const parsedConfig = AuditConfigSchema.safeParse(input).success ? AuditConfigSchema.parse(input) : createAuditConfig(input as AuditInput);
  const config = AuditConfigSchema.parse({
    ...parsedConfig,
    auditRoot: options.auditRoot ?? parsedConfig.auditRoot,
    auditName: options.auditName ?? parsedConfig.auditName,
    auditSlug: options.auditSlug ?? parsedConfig.auditSlug,
    auditRunId: options.auditRunId ?? parsedConfig.auditRunId,
    outputDir: options.outputDir ?? parsedConfig.outputDir
  });
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const paths = await createAuditPaths(config, workspaceRoot);
  const completedSteps: string[] = [];
  const writeAuditState = async (state: Record<string, unknown>) => {
    await writeJson(path.join(paths.auditRoot, "audit-state.json"), {
      auditId: config.auditId,
      updatedAt: new Date().toISOString(),
      retries: config.retries,
      resumability: {
        supported: true,
        completedSteps,
        note: "Safe deterministic steps can be replayed by rerunning the audit. Raw screenshots remain immutable evidence once report generation completes."
      },
      ...state
    });
  };

  try {
    options.signal?.throwIfAborted();
    options.onProgress?.({ stage: "start", message: `Audit ${config.auditId} created` });
    await writeAuditState({ status: "capturing", step: "capture" });

    const capture = await captureEvidence(config, paths, options.onProgress, options.signal, options.validateNavigation);
    completedSteps.push("capture");
    options.signal?.throwIfAborted();

    await writeAuditState({ status: "reviewing", step: "review", capturedPages: capture.pages.length });

    options.onProgress?.({ stage: "review", message: "Generating structured findings" });
    const report = AuditReportSchema.parse(await reviewEvidence(config, capture.pages, paths));
    completedSteps.push("review");
    options.signal?.throwIfAborted();

    if (config.competitors.length > 0) {
      report.competitorBenchmarks = await runCompetitorBenchmarks(config, report.scorecard.overallScore, paths, options.onProgress, options.validateNavigation);
      completedSteps.push("competitor_benchmark");
    }

    options.onProgress?.({ stage: "report", message: "Writing reports and static visual pack" });
    const outputs = await writeReports(config, report, paths, { reviewPack: true });
    completedSteps.push("report");
    options.signal?.throwIfAborted();
    options.onProgress?.({ stage: "validate", message: "Validating report bundle" });
    const validation = await finalizeAuditValidation(paths.auditRoot, false);
    completedSteps.push("validate");
    await updateProjectIndex(workspaceRoot, report, paths.auditRoot, outputs);
    completedSteps.push("index");

    await writeAuditState({
      status: "completed",
      step: "done",
      report: outputs,
      validation
    });

    options.onProgress?.({ stage: "done", message: `Audit completed at ${paths.auditRoot}` });

    return {
      config,
      auditRoot: paths.auditRoot,
      report,
      outputs,
      validation
    };
  } catch (error) {
    await writeAuditState({
      status: options.signal?.aborted ? "cancelled" : "failed",
      failure: classifyAuditFailure(error)
    }).catch(() => undefined);
    throw error;
  }
}

export function validateReport(data: unknown): AuditReport {
  return AuditReportSchema.parse(data);
}

export const schemas = {
  AuditConfigSchema,
  AuditReportSchema,
  FindingSchema,
  InteractionSettingsSchema,
  InteractionStateEvidenceSchema,
  PageEvidenceSchema,
  ScorecardSchema
};

function classifyAuditFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  let category = "unknown";
  if (error instanceof DOMException && error.name === "AbortError") category = "cancelled";
  if (/timeout|timed out/i.test(message)) category = "timeout";
  else if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN|DNS/i.test(message)) category = "navigation_dns";
  else if (/ERR_SSL|certificate|TLS/i.test(message)) category = "navigation_tls";
  else if (/net::ERR|ECONN|socket|network|fetch/i.test(message)) category = "network";
  else if (/screenshot/i.test(message)) category = "screenshot";
  else if (/schema|zod|parse/i.test(message)) category = "schema";
  else if (/report|html|pdf|write|EACCES|ENOENT/i.test(message)) category = "artifact_write";
  return {
    category,
    message,
    retryable: category === "timeout" || category === "navigation_dns" || category === "network",
    failedAt: new Date().toISOString()
  };
}
