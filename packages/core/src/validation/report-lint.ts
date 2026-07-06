import { access, readFile } from "node:fs/promises";
import * as path from "node:path";
import { AuditReport, AuditReportSchema } from "../schemas/audit.js";
import { readReportFromAuditDir } from "../storage/index.js";
import { createNestedAuditPaths } from "../storage/project.js";
import { writeAgentBundle } from "../report/agent-bundle.js";
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

  await checkBundleFiles(report, auditDir, errors, warnings);
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
  await refreshAgentBundle(report, auditDir, result);
  return result;
}

async function checkBundleFiles(report: AuditReport, auditDir: string, errors: string[], warnings: string[]) {
  const required = [
    "report/report.json",
    "report/index.md",
    "report/index.html",
    "report/workflow-manifest.json",
    "report/handoff.json",
    "report/findings.json",
    "report/score.json",
    "report/report-dashboard.json",
    "report/actionability.json",
    "report/evidence-index.json",
    "report/implementation-plan.json",
    "report/agent-execution-plan.md",
    "report/next-actions.md",
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

  const configuredOutputs = [
    ["report/report.md", report.config.outputs.markdown],
    ["report/report.html", report.config.outputs.html || report.config.outputs.pdf],
    ["report/report.pdf", report.config.outputs.pdf]
  ] as const;
  for (const [file, expected] of configuredOutputs) {
    if (expected && !(await exists(path.join(auditDir, file)))) {
      errors.push(`Configured report output is missing: ${file}`);
    }
  }

  const recommended = ["exports/ticket-backlog.json", "exports/github-issues.md", "exports/linear-import.csv", "exports/jira-import.csv"];
  for (const file of recommended) {
    if (!(await exists(path.join(auditDir, file)))) {
      warnings.push(`Missing recommended artifact: ${file}`);
    }
  }

  await checkJsonShape(auditDir, "report/workflow-manifest.json", "schemaVersion", errors);
  await checkJsonShape(auditDir, "report/handoff.json", "schemaVersion", errors);
  await checkJsonShape(auditDir, "report/evidence-index.json", "pages", errors);
  await checkJsonShape(auditDir, "report/implementation-plan.json", "items", errors);
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

async function checkJsonShape(auditDir: string, file: string, requiredKey: string, errors: string[]): Promise<void> {
  try {
    const json = await readFile(path.join(auditDir, file), "utf8");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (!(requiredKey in parsed)) {
      errors.push(`Invalid bundle JSON shape in ${file}: missing ${requiredKey}`);
    }
  } catch (error) {
    errors.push(`Invalid bundle JSON: ${file} (${error instanceof Error ? error.message : String(error)})`);
  }
}

async function refreshAgentBundle(report: AuditReport, auditDir: string, result: ReportLintResult): Promise<void> {
  const paths = await createNestedAuditPaths(auditDir);
  await writeAgentBundle(
    report,
    paths,
    {
      json: path.join(paths.report, "report.json"),
      markdown: (await exists(path.join(paths.report, "report.md"))) ? path.join(paths.report, "report.md") : undefined,
      html: (await exists(path.join(paths.report, "report.html"))) ? path.join(paths.report, "report.html") : undefined,
      pdf: (await exists(path.join(paths.report, "report.pdf"))) ? path.join(paths.report, "report.pdf") : undefined,
      executiveSummary: (await exists(path.join(paths.report, "executive-summary.md"))) ? path.join(paths.report, "executive-summary.md") : undefined
    },
    result
  );
}
