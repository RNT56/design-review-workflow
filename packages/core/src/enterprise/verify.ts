import { access, readFile } from "node:fs/promises";
import * as path from "node:path";
import { compareAuditDirs } from "../compare/compare.js";
import { evaluateBusinessGradeGate } from "../review/business-grade.js";
import { readReportFromAuditDir } from "../storage/index.js";
import { lintAuditReport } from "../validation/report-lint.js";

export type EnterpriseVerifyStatus = "pass" | "warn" | "fail";

export type EnterpriseVerifyCheck = {
  name: string;
  status: EnterpriseVerifyStatus;
  message: string;
  artifacts?: string[];
};

export type EnterpriseVerifyOptions = {
  auditDir: string;
  allowPending?: boolean;
  baselineAuditDir?: string;
  maxScoreDrop?: number;
};

export type EnterpriseVerifyResult = {
  schemaVersion: "design-review-workflow.enterprise-verify.v1";
  auditDir: string;
  checkedAt: string;
  status: EnterpriseVerifyStatus;
  summary: {
    pages: number;
    findings: number;
    screenshots: number;
    businessGradeStatus: string;
    requiredArtifacts: number;
    missingArtifacts: number;
  };
  checks: EnterpriseVerifyCheck[];
};

const REQUIRED_ENTERPRISE_ARTIFACTS = [
  "report/performance-audit.json",
  "report/accessibility-detail.json",
  "report/privacy-tracking.json",
  "report/resource-audit.json",
  "report/interaction-states.json",
  "report/related-workflows.json",
  "report/enterprise-readiness.json",
  "report/stakeholder-recommendations.md",
  "report/before-after-comparison.md"
];

export async function verifyEnterpriseAudit(options: EnterpriseVerifyOptions): Promise<EnterpriseVerifyResult> {
  const auditDir = path.resolve(options.auditDir);
  const report = await readReportFromAuditDir(auditDir);
  const checks: EnterpriseVerifyCheck[] = [];

  const lint = await lintAuditReport(auditDir, false);
  checks.push({
    name: "Strict report bundle shape",
    status: lint.status === "fail" ? "fail" : lint.status,
    message: `report lint returned ${lint.status}`,
    artifacts: [path.join(auditDir, "report", "validation.json"), path.join(auditDir, "report", "quality-gate.json")]
  });

  const missingArtifacts: string[] = [];
  for (const artifact of REQUIRED_ENTERPRISE_ARTIFACTS) {
    if (!(await exists(path.join(auditDir, artifact)))) missingArtifacts.push(artifact);
  }
  checks.push({
    name: "Enterprise artifact inventory",
    status: missingArtifacts.length === 0 ? "pass" : "fail",
    message:
      missingArtifacts.length === 0
        ? "All required enterprise-local artifacts are present."
        : `Missing enterprise artifact(s): ${missingArtifacts.join(", ")}`,
    artifacts: REQUIRED_ENTERPRISE_ARTIFACTS.map((artifact) => path.join(auditDir, artifact))
  });

  const screenshotCount = report.pages.reduce((sum, page) => sum + Object.keys(page.screenshots).length, 0);
  const pagesWithFirstViewport = report.pages.filter((page) =>
    Object.values(page.screenshots).some((screenshot) => screenshot.kind === "above_fold")
  ).length;
  const pagesWithFullPage = report.pages.filter((page) =>
    Object.values(page.screenshots).some((screenshot) => screenshot.kind === "full_page")
  ).length;
  checks.push({
    name: "Screenshot coverage",
    status: pagesWithFirstViewport === report.pages.length && pagesWithFullPage === report.pages.length ? "pass" : "fail",
    message: `${pagesWithFirstViewport}/${report.pages.length} pages have first viewport screenshots and ${pagesWithFullPage}/${report.pages.length} pages have full-page screenshots.`,
    artifacts: [path.join(auditDir, "report", "screenshot-manifest.json")]
  });

  const businessGate = evaluateBusinessGradeGate(report);
  const businessStatus =
    businessGate.status === "pass"
      ? "pass"
      : options.allowPending && report.businessGradeStatus === "agent_review_pending"
        ? "warn"
        : "fail";
  checks.push({
    name: "Business-grade gate",
    status: businessStatus,
    message:
      businessGate.status === "pass"
        ? "A validated AgentVisualReview is imported and business-grade lint passes."
        : report.businessGradeStatus === "agent_review_pending"
          ? "Business-grade visual review is pending."
          : `Business-grade lint would fail with ${businessGate.errors.length} error(s).`,
    artifacts: [path.join(auditDir, "report", "business-grade-gate.json"), path.join(auditDir, "report", "agent-visual-review.json")]
  });

  const related = await readJson(path.join(auditDir, "report", "related-workflows.json"));
  checks.push({
    name: "Related workflow seam",
    status: related && typeof related === "object" && Array.isArray((related as { workflows?: unknown }).workflows) ? "pass" : "fail",
    message: "Related workflow metadata is present and kept separate from design findings.",
    artifacts: [path.join(auditDir, "report", "related-workflows.json")]
  });

  if (options.baselineAuditDir) {
    const comparison = await compareAuditDirs(path.resolve(options.baselineAuditDir), auditDir);
    const maxScoreDrop = options.maxScoreDrop ?? 5;
    const failed = comparison.result.scoreDelta < 0 && Math.abs(comparison.result.scoreDelta) > maxScoreDrop;
    checks.push({
      name: "Baseline score drift",
      status: failed ? "fail" : "pass",
      message: `Score delta is ${comparison.result.scoreDelta >= 0 ? "+" : ""}${comparison.result.scoreDelta}; max allowed drop is ${maxScoreDrop}.`,
      artifacts: [comparison.outputPath]
    });
  }

  const status = checks.some((check) => check.status === "fail") ? "fail" : checks.some((check) => check.status === "warn") ? "warn" : "pass";
  return {
    schemaVersion: "design-review-workflow.enterprise-verify.v1",
    auditDir,
    checkedAt: new Date().toISOString(),
    status,
    summary: {
      pages: report.pages.length,
      findings: report.findings.length,
      screenshots: screenshotCount,
      businessGradeStatus: report.businessGradeStatus,
      requiredArtifacts: REQUIRED_ENTERPRISE_ARTIFACTS.length,
      missingArtifacts: missingArtifacts.length
    },
    checks
  };
}

async function readJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false
  );
}
