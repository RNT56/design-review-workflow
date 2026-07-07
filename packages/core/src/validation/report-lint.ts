import { access, readFile } from "node:fs/promises";
import * as path from "node:path";
import { AuditReport, AuditReportSchema } from "../schemas/audit.js";
import { readReportFromAuditDir } from "../storage/index.js";
import { createNestedAuditPaths } from "../storage/project.js";
import { writeAgentBundle } from "../report/agent-bundle.js";
import { writeBusinessGradeArtifacts } from "../report/business-grade-artifacts.js";
import { writeEvidenceBrief } from "../report/evidence-brief.js";
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

  await refreshAgentBundle(report, auditDir);
  await checkBundleFiles(report, auditDir, errors, warnings);
  await checkEvidence(report, auditDir, errors, warnings);
  await checkSafety(report, errors, warnings);

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
    "index.html",
    "report/report.json",
    "report/index.md",
    "report/index.html",
    "report/workflow-manifest.json",
    "report/handoff.json",
    "report/findings.json",
    "report/score.json",
    "report/report-dashboard.json",
    "report/actionability.json",
    "report/evidence-brief.json",
    "report/evidence-index.json",
    "report/screenshot-manifest.json",
    "report/grouped-issues.json",
    "report/business-grade-gate.json",
    "report/evidence.jsonl",
    "report/implementation-plan.json",
    "report/repo-analysis.json",
    "report/source-candidates.json",
    "report/route-templates.json",
    "report/visual-system.json",
    "report/experience-timing.json",
    "report/standards-registry.json",
    "report/suppression-report.json",
    "report/design-benchmark.json",
    "report/design-benchmark.md",
    "report/patch-plan.md",
    "report/changed-files.json",
    "report/manual-actions.md",
    "report/remaining-user-decisions.md",
    "report/agent-execution-plan.md",
    "report/next-actions.md",
    "report/hosted/index.html",
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
  await checkJsonShape(auditDir, "report/report.json", "businessGradeStatus", errors);
  await checkJsonShape(auditDir, "report/report.json", "groupedIssues", errors);
  await checkJsonShape(auditDir, "report/handoff.json", "schemaVersion", errors);
  await checkJsonShape(auditDir, "report/evidence-brief.json", "pages", errors);
  await checkJsonShape(auditDir, "report/evidence-index.json", "pages", errors);
  await checkJsonShape(auditDir, "report/screenshot-manifest.json", "screenshots", errors);
  await checkJsonShape(auditDir, "report/grouped-issues.json", "length", errors, true);
  await checkJsonShape(auditDir, "report/business-grade-gate.json", "schemaVersion", errors);
  await checkJsonShape(auditDir, "report/implementation-plan.json", "items", errors);
  await checkJsonShape(auditDir, "report/repo-analysis.json", "schemaVersion", errors);
  await checkJsonShape(auditDir, "report/source-candidates.json", "byFinding", errors);
  await checkJsonShape(auditDir, "report/route-templates.json", "templates", errors);
  await checkJsonShape(auditDir, "report/visual-system.json", "schemaVersion", errors);
  await checkJsonShape(auditDir, "report/experience-timing.json", "pages", errors);
  await checkJsonShape(auditDir, "report/standards-registry.json", "rules", errors);
  await checkJsonShape(auditDir, "report/suppression-report.json", "suppressionsApplied", errors);
  await checkJsonShape(auditDir, "report/design-benchmark.json", "score", errors);
  await checkJsonShape(auditDir, "report/changed-files.json", "changedFiles", errors);
}

async function checkEvidence(report: AuditReport, auditDir: string, errors: string[], warnings: string[]) {
  const pageById = new Map(report.pages.map((page) => [page.pageId, page]));
  const annotationRefs = new Set<string>();
  for (const annotation of report.screenshotAnnotations) {
    annotationRefs.add(annotation.annotatedScreenshot.id);
    annotationRefs.add(annotation.annotatedScreenshot.path);
  }
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
      const knownPageRef = page.screenshots[ref] || Object.values(page.screenshots).some((screenshot) => screenshot.path === ref);
      if (!knownPageRef && !annotationRefs.has(ref)) {
        errors.push(`Finding references missing screenshot id ${ref}: ${finding.findingId}`);
      }
    }
  }
}

async function checkSafety(report: AuditReport, errors: string[], warnings: string[]) {
  const blockedUrlPattern = /\/(login|log-in|signin|sign-in|admin|account|billing|payment|checkout\/complete|order-confirmation|orders?\/)/i;
  const cautionUrlPattern = /\/(checkout|cart|profile|settings)/i;
  const secretPattern = /(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY|password\s*=|api[_-]?key\s*=)/i;

  const urls = new Set<string>([
    report.config.url,
    ...report.pages.map((page) => page.url),
    ...report.findings.map((finding) => finding.evidence.url)
  ]);
  for (const url of urls) {
    let pathname = url;
    try {
      pathname = new URL(url).pathname;
    } catch {
      // Keep the original value for pattern checks.
    }
    if (blockedUrlPattern.test(pathname)) {
      errors.push(`Unsafe private/auth/payment URL appears in report artifacts: ${url}`);
    } else if (cautionUrlPattern.test(pathname)) {
      warnings.push(`Review checkout/account-adjacent URL before implementation: ${url}`);
    }
  }

  for (const finding of report.findings) {
    const text = [
      finding.title,
      finding.observation,
      finding.whyItMatters,
      finding.recommendation,
      ...finding.evidence.textQuotes,
      finding.businessRisk ?? "",
      finding.expectedKpiImpact ?? "",
      finding.suggestedExperiment ?? ""
    ].join("\n");
    if (secretPattern.test(text)) {
      errors.push(`Secret-looking value appears in finding text: ${finding.findingId}`);
    }
  }
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false
  );
}

async function checkJsonShape(auditDir: string, file: string, requiredKey: string, errors: string[], allowArray = false): Promise<void> {
  try {
    const json = await readFile(path.join(auditDir, file), "utf8");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (allowArray && Array.isArray(parsed)) {
      return;
    }
    if (!(requiredKey in parsed)) {
      errors.push(`Invalid bundle JSON shape in ${file}: missing ${requiredKey}`);
    }
  } catch (error) {
    errors.push(`Invalid bundle JSON: ${file} (${error instanceof Error ? error.message : String(error)})`);
  }
}

async function refreshAgentBundle(report: AuditReport, auditDir: string, result?: ReportLintResult): Promise<void> {
  const paths = await createNestedAuditPaths(auditDir);
  const hasReviewPack = await exists(path.join(paths.report, "agent-review-pack", "review-pack-manifest.json"));
  await writeEvidenceBrief(report, paths);
  await writeBusinessGradeArtifacts(report, paths, {
    preserveReviewPackManifest: hasReviewPack
  });
  await writeAgentBundle(
    report,
    paths,
    {
      json: path.join(paths.report, "report.json"),
      markdown: (await exists(path.join(paths.report, "report.md"))) ? path.join(paths.report, "report.md") : undefined,
      html: (await exists(path.join(paths.report, "report.html"))) ? path.join(paths.report, "report.html") : undefined,
      pdf: (await exists(path.join(paths.report, "report.pdf"))) ? path.join(paths.report, "report.pdf") : undefined,
      staticIndex: path.join(paths.auditRoot, "index.html"),
      executiveSummary: (await exists(path.join(paths.report, "executive-summary.md"))) ? path.join(paths.report, "executive-summary.md") : undefined
    },
    result
  );
}
