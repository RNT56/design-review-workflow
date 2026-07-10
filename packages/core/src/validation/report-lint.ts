import { access, copyFile, readFile } from "node:fs/promises";
import * as path from "node:path";
import { PNG } from "pngjs";
import { AuditReport, AuditReportSchema } from "../schemas/audit.js";
import { evaluateBusinessGradeGate } from "../review/business-grade.js";
import { readReportFromAuditDir } from "../storage/index.js";
import { createNestedAuditPaths } from "../storage/project.js";
import { writeAgentBundle } from "../report/agent-bundle.js";
import { writeBusinessGradeArtifacts } from "../report/business-grade-artifacts.js";
import { writeEvidenceBrief } from "../report/evidence-brief.js";
import { writeJson } from "../utils/fs.js";
import { validateArtifactContracts } from "./artifact-contracts.js";
import { verifyBundleIntegrity, writeBundleIntegrityManifest } from "./integrity.js";

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
    integrityFiles: number;
  };
};

export type ReportRepairOptions = {
  rebuildReviewPack?: boolean;
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
  await checkSafety(report, errors, warnings);
  await checkCrossArtifactConsistency(report, auditDir, errors);
  errors.push(...(await validateArtifactContracts(auditDir, report.auditId)));
  const integrity = await verifyBundleIntegrity(auditDir);
  errors.push(...integrity.errors);

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
      ticketExports: report.ticketExports ? Object.keys(report.ticketExports).length : 0,
      integrityFiles: integrity.checkedFiles
    }
  };
  return result;
}

export async function writeReportValidationArtifacts(auditDir: string, result: ReportLintResult): Promise<void> {
  await writeJson(path.join(auditDir, "report", "validation.json"), result);
  await writeJson(path.join(auditDir, "report", "quality-gate.json"), {
    schemaVersion: "design-review-workflow.quality-gate.v1",
    status: result.status,
    strict: result.strict,
    errors: result.errors.length,
    warnings: result.warnings.length,
    checkedAt: result.checkedAt,
    integrityFiles: result.summary.integrityFiles
  });
}

export async function finalizeAuditValidation(auditDir: string, strict = false): Promise<ReportLintResult> {
  const report = await readReportFromAuditDir(auditDir);
  const paths = await createNestedAuditPaths(auditDir);
  await writeBundleIntegrityManifest(auditDir);
  const preliminary = await lintAuditReport(auditDir, strict);
  await writeReportValidationArtifacts(auditDir, preliminary);
  await writeAgentBundle(report, paths, await reportOutputsFor(report, paths), preliminary);
  await writeBundleIntegrityManifest(auditDir);
  const finalResult = await lintAuditReport(auditDir, strict);
  await writeReportValidationArtifacts(auditDir, finalResult);
  return finalResult;
}

export async function repairAuditReport(
  auditDir: string,
  strict = false,
  options: ReportRepairOptions = {}
): Promise<ReportLintResult> {
  const report = await readReportFromAuditDir(auditDir);
  const paths = await createNestedAuditPaths(auditDir);
  const hasReviewPack = await exists(path.join(paths.report, "agent-review-pack", "review-pack-manifest.json"));
  await writeEvidenceBrief(report, paths);
  if (hasReviewPack) {
    await copyFile(
      path.join(paths.report, "evidence-brief.json"),
      path.join(paths.report, "agent-review-pack", "evidence-brief.json")
    );
  }
  await writeBusinessGradeArtifacts(report, paths, {
    buildReviewPack: options.rebuildReviewPack === true || !hasReviewPack,
    preserveReviewPackManifest: hasReviewPack && options.rebuildReviewPack !== true
  });
  await writeAgentBundle(report, paths, await reportOutputsFor(report, paths));
  return finalizeAuditValidation(auditDir, strict);
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
    "report/bundle-integrity.json",
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
    "report/performance-audit.json",
    "report/accessibility-detail.json",
    "report/privacy-tracking.json",
    "report/resource-audit.json",
    "report/interaction-states.json",
    "report/related-workflows.json",
    "report/enterprise-readiness.json",
    "report/learnings/README.md",
    "report/learnings/agent-learning-template.md",
    "report/learnings/run-retrospective.json",
    "report/standards-registry.json",
    "report/criteria-evaluation.json",
    "report/suppression-report.json",
    "report/design-benchmark.json",
    "report/design-benchmark.md",
    "report/stakeholder-recommendations.md",
    "report/before-after-comparison.md",
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
  await checkJsonShape(auditDir, "report/performance-audit.json", "pages", errors);
  await checkJsonShape(auditDir, "report/accessibility-detail.json", "pages", errors);
  await checkJsonShape(auditDir, "report/privacy-tracking.json", "riskSignals", errors);
  await checkJsonShape(auditDir, "report/resource-audit.json", "pages", errors);
  await checkJsonShape(auditDir, "report/interaction-states.json", "states", errors);
  await checkJsonShape(auditDir, "report/related-workflows.json", "workflows", errors);
  await checkJsonShape(auditDir, "report/enterprise-readiness.json", "gates", errors);
  await checkJsonShape(auditDir, "report/learnings/run-retrospective.json", "counts", errors);
  await checkJsonShape(auditDir, "report/standards-registry.json", "rules", errors);
  await checkJsonShape(auditDir, "report/criteria-evaluation.json", "pages", errors);
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
      const screenshotPath = path.join(auditDir, screenshot.path);
      if (!(await exists(screenshotPath))) {
        errors.push(`Screenshot file missing: ${screenshot.path}`);
        continue;
      }
      try {
        const png = PNG.sync.read(await readFile(screenshotPath));
        if (png.width !== screenshot.width || png.height !== screenshot.height) {
          errors.push(
            `Screenshot dimensions mismatch for ${screenshot.id}: report ${screenshot.width}x${screenshot.height}, file ${png.width}x${png.height}.`
          );
        }
      } catch (error) {
        errors.push(`Screenshot is not a readable PNG: ${screenshot.path} (${error instanceof Error ? error.message : String(error)})`);
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

async function checkCrossArtifactConsistency(report: AuditReport, auditDir: string, errors: string[]): Promise<void> {
  const findings = await readJsonIfExists(path.join(auditDir, "report", "findings.json"));
  if (findings !== undefined && !sameJson(findings, report.findings)) {
    errors.push("report/findings.json does not match report/report.json findings.");
  }
  const score = await readJsonIfExists(path.join(auditDir, "report", "score.json"));
  if (score !== undefined && !sameJson(score, report.scorecard)) {
    errors.push("report/score.json does not match report/report.json scorecard.");
  }
  const groupedIssues = await readJsonIfExists(path.join(auditDir, "report", "grouped-issues.json"));
  if (groupedIssues !== undefined && !sameJson(groupedIssues, report.groupedIssues)) {
    errors.push("report/grouped-issues.json does not match report/report.json groupedIssues.");
  }

  const evidenceBrief = await readJsonIfExists(path.join(auditDir, "report", "evidence-brief.json")) as
    | { auditId?: string; businessGradeStatus?: string; pages?: unknown[] }
    | undefined;
  if (evidenceBrief) {
    if (evidenceBrief.auditId !== report.auditId) errors.push("Evidence brief auditId does not match the report.");
    if (evidenceBrief.businessGradeStatus !== report.businessGradeStatus) errors.push("Evidence brief business-grade status is stale.");
    if (evidenceBrief.pages?.length !== report.pages.length) errors.push("Evidence brief page count does not match the report.");
  }

  const packEvidencePath = path.join(auditDir, "report", "agent-review-pack", "evidence-brief.json");
  if (await exists(packEvidencePath)) {
    const packEvidence = await readJsonIfExists(packEvidencePath);
    if (!sameJson(packEvidence, evidenceBrief)) {
      errors.push("Agent review-pack evidence brief differs from report/evidence-brief.json.");
    }
  }

  const screenshotManifest = await readJsonIfExists(path.join(auditDir, "report", "screenshot-manifest.json")) as
    | { auditId?: string; screenshots?: unknown[]; pages?: unknown[] }
    | undefined;
  const screenshotCount = report.pages.reduce((sum, page) => sum + Object.keys(page.screenshots).length, 0);
  if (screenshotManifest) {
    if (screenshotManifest.auditId !== report.auditId) errors.push("Screenshot manifest auditId does not match the report.");
    if (screenshotManifest.screenshots?.length !== screenshotCount) errors.push("Screenshot manifest count does not match report screenshots.");
    if (screenshotManifest.pages?.length !== report.pages.length) errors.push("Screenshot manifest page count does not match the report.");
  }

  const storedBusinessGate = await readJsonIfExists(path.join(auditDir, "report", "business-grade-gate.json")) as
    | { status?: string; businessGradeStatus?: string }
    | undefined;
  if (storedBusinessGate) {
    const expectedGate = evaluateBusinessGradeGate(report);
    if (storedBusinessGate.status !== expectedGate.status || storedBusinessGate.businessGradeStatus !== expectedGate.businessGradeStatus) {
      errors.push("Stored business-grade gate is stale relative to report/report.json.");
    }
  }

  const criteria = await readJsonIfExists(path.join(auditDir, "report", "criteria-evaluation.json")) as
    | { auditId?: string; pages?: Array<{ pageId?: string; criteria?: Array<{ findingIds?: string[] }> }> }
    | undefined;
  if (criteria) {
    if (criteria.auditId !== report.auditId) errors.push("Criteria evaluation auditId does not match the report.");
    const pageIds = new Set(report.pages.map((page) => page.pageId));
    const findingIds = new Set(report.findings.map((finding) => finding.findingId));
    for (const page of criteria.pages ?? []) {
      if (!page.pageId || !pageIds.has(page.pageId)) errors.push(`Criteria evaluation references unknown page: ${page.pageId ?? "missing"}.`);
      for (const criterion of page.criteria ?? []) {
        for (const findingId of criterion.findingIds ?? []) {
          if (!findingIds.has(findingId)) errors.push(`Criteria evaluation references unknown finding: ${findingId}.`);
        }
      }
    }
  }

  const suppression = await readJsonIfExists(path.join(auditDir, "report", "suppression-report.json")) as
    | { schemaVersion?: string; suppressedFindingIds?: string[]; suppressedFindingFingerprints?: string[] }
    | undefined;
  if (suppression?.schemaVersion === "design-review-workflow.suppression-report.v2") {
    const knownIds = new Set(report.findings.map((finding) => finding.findingId));
    const knownFingerprints = new Set(report.findings.map((finding) => finding.fingerprint).filter(Boolean));
    for (const findingId of suppression.suppressedFindingIds ?? []) {
      if (!knownIds.has(findingId)) errors.push(`Suppression report references unknown active finding: ${findingId}.`);
    }
    for (const fingerprint of suppression.suppressedFindingFingerprints ?? []) {
      if (!knownFingerprints.has(fingerprint)) errors.push(`Suppression report references unknown active fingerprint: ${fingerprint}.`);
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

async function readJsonIfExists(filePath: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function reportOutputsFor(report: AuditReport, paths: Awaited<ReturnType<typeof createNestedAuditPaths>>) {
  return {
    json: path.join(paths.report, "report.json"),
    markdown: report.config.outputs.markdown && (await exists(path.join(paths.report, "report.md"))) ? path.join(paths.report, "report.md") : undefined,
    html: (report.config.outputs.html || report.config.outputs.pdf) && (await exists(path.join(paths.report, "report.html"))) ? path.join(paths.report, "report.html") : undefined,
    pdf: report.config.outputs.pdf && (await exists(path.join(paths.report, "report.pdf"))) ? path.join(paths.report, "report.pdf") : undefined,
    staticIndex: path.join(paths.auditRoot, "index.html"),
    executiveSummary: (await exists(path.join(paths.report, "executive-summary.md"))) ? path.join(paths.report, "executive-summary.md") : undefined
  };
}
