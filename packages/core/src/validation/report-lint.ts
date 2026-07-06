import { access } from "node:fs/promises";
import * as path from "node:path";
import { AuditReport, AuditReportSchema } from "../schemas/audit.js";
import { readReportFromAuditDir } from "../storage/index.js";
import { writeJson } from "../utils/fs.js";

export type ReportLintResult = {
  status: "pass" | "warn" | "fail";
  strict: boolean;
  checkedAt: string;
  errors: string[];
  warnings: string[];
  summary: {
    findings: number;
    pages: number;
    screenshots: number;
    annotations: number;
    ticketExports: number;
  };
};

export async function lintAuditReport(auditDir: string, strict = false): Promise<ReportLintResult> {
  const report = await readReportFromAuditDir(auditDir);
  const errors: string[] = [];
  const warnings: string[] = [];

  const parsed = AuditReportSchema.safeParse(report);
  if (!parsed.success) {
    errors.push(`Report schema failed: ${parsed.error.message}`);
  }

  await checkBundleFiles(auditDir, errors, warnings);
  await checkEvidence(report, auditDir, errors, warnings);

  if (strict && warnings.length > 0) {
    errors.push("Strict mode treats warnings as failures.");
  }

  const result: ReportLintResult = {
    status: errors.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
    strict,
    checkedAt: new Date().toISOString(),
    errors,
    warnings,
    summary: {
      findings: report.findings.length,
      pages: report.pages.length,
      screenshots: report.pages.reduce((sum, page) => sum + Object.keys(page.screenshots).length, 0),
      annotations: report.screenshotAnnotations.length,
      ticketExports: report.ticketExports ? Object.keys(report.ticketExports).length : 0
    }
  };

  await writeJson(path.join(auditDir, "report", "validation.json"), result);
  await writeJson(path.join(auditDir, "report", "quality-gate.json"), {
    status: result.status,
    strict,
    errors: result.errors.length,
    warnings: result.warnings.length,
    checkedAt: result.checkedAt
  });
  return result;
}

async function checkBundleFiles(auditDir: string, errors: string[], warnings: string[]) {
  const required = [
    "report/report.json",
    "report/index.md",
    "report/index.html",
    "report/findings.json",
    "report/score.json",
    "report/report-dashboard.json",
    "report/actionability.json",
    "report/agent-execution-plan.md",
    "report/agent-instructions/README.md",
    "report/agent-instructions/codex.md",
    "report/agent-instructions/claude-code.md",
    "report/agent-instructions/openclaw.md",
    "report/agent-instructions/hermes.md",
    "report/agent-instructions/opencode.md"
  ];
  for (const file of required) {
    if (!(await exists(path.join(auditDir, file)))) {
      errors.push(`Missing required report bundle file: ${file}`);
    }
  }

  const recommended = ["report/report.pdf", "exports/ticket-backlog.json", "exports/github-issues.md"];
  for (const file of recommended) {
    if (!(await exists(path.join(auditDir, file)))) {
      warnings.push(`Missing recommended artifact: ${file}`);
    }
  }
}

async function checkEvidence(report: AuditReport, auditDir: string, errors: string[], warnings: string[]) {
  const pageById = new Map(report.pages.map((page) => [page.pageId, page]));
  for (const page of report.pages) {
    for (const screenshot of Object.values(page.screenshots)) {
      if (!(await exists(path.join(auditDir, screenshot.path)))) {
        errors.push(`Screenshot file missing: ${screenshot.path}`);
      }
    }
  }

  for (const finding of report.findings) {
    const page = pageById.get(finding.evidence.pageId);
    if (!page) {
      errors.push(`Finding references unknown page: ${finding.findingId}`);
      continue;
    }
    if (!finding.evidence.url || !finding.observation || !finding.recommendation) {
      errors.push(`Finding lacks required content: ${finding.findingId}`);
    }
    if (finding.evidence.screenshotRefs.length === 0) {
      warnings.push(`Finding has no screenshot reference: ${finding.findingId}`);
    }
    for (const ref of finding.evidence.screenshotRefs) {
      if (!page.screenshots[ref]) {
        errors.push(`Finding references missing screenshot id ${ref}: ${finding.findingId}`);
      }
    }
  }
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false
  );
}
