import { access } from "node:fs/promises";
import * as path from "node:path";
import { AuditReport, Finding } from "../schemas/audit.js";
import { AuditPaths } from "../storage/project.js";
import { writeJson, writeText } from "../utils/fs.js";

export type DesignWorkflowArtifactPaths = {
  evidenceJsonl: string;
  routeTemplates: string;
  visualSystem: string;
  experienceTiming: string;
  standardsRegistry: string;
  suppressionReport: string;
  repoAnalysis: string;
  sourceCandidates: string;
  benchmarkJson: string;
  benchmarkMarkdown: string;
  patchPlan: string;
  changedFiles: string;
  manualActions: string;
  remainingUserDecisions: string;
};

export async function writeDesignWorkflowArtifacts(report: AuditReport, paths: AuditPaths): Promise<DesignWorkflowArtifactPaths> {
  const outputs: DesignWorkflowArtifactPaths = {
    evidenceJsonl: path.join(paths.report, "evidence.jsonl"),
    routeTemplates: path.join(paths.report, "route-templates.json"),
    visualSystem: path.join(paths.report, "visual-system.json"),
    experienceTiming: path.join(paths.report, "experience-timing.json"),
    standardsRegistry: path.join(paths.report, "standards-registry.json"),
    suppressionReport: path.join(paths.report, "suppression-report.json"),
    repoAnalysis: path.join(paths.report, "repo-analysis.json"),
    sourceCandidates: path.join(paths.report, "source-candidates.json"),
    benchmarkJson: path.join(paths.report, "design-benchmark.json"),
    benchmarkMarkdown: path.join(paths.report, "design-benchmark.md"),
    patchPlan: path.join(paths.report, "patch-plan.md"),
    changedFiles: path.join(paths.report, "changed-files.json"),
    manualActions: path.join(paths.report, "manual-actions.md"),
    remainingUserDecisions: path.join(paths.report, "remaining-user-decisions.md")
  };

  await writeText(outputs.evidenceJsonl, renderEvidenceJsonl(report));
  await writeJson(outputs.routeTemplates, routeTemplateModel(report));
  await writeJson(outputs.visualSystem, visualSystemModel(report));
  await writeJson(outputs.experienceTiming, experienceTimingModel(report));
  await writeJsonIfMissing(outputs.standardsRegistry, defaultDesignStandardsRegistry(report));
  await writeJsonIfMissing(outputs.suppressionReport, emptySuppressionReport(report));
  await writeJsonIfMissing(outputs.repoAnalysis, repoAnalysisPlaceholder(report));
  await writeJsonIfMissing(outputs.sourceCandidates, sourceCandidatesPlaceholder(report));
  await writeJson(outputs.benchmarkJson, designBenchmarkModel(report));
  await writeText(outputs.benchmarkMarkdown, renderDesignBenchmarkMarkdown(report));
  await writeTextIfMissing(outputs.patchPlan, renderPatchPlan(report));
  await writeJsonIfMissing(outputs.changedFiles, changedFilesPlaceholder(report));
  await writeText(outputs.manualActions, renderManualActions(report));
  await writeText(outputs.remainingUserDecisions, renderRemainingUserDecisions(report));

  return outputs;
}

async function writeJsonIfMissing(filePath: string, value: unknown): Promise<void> {
  if (await exists(filePath)) return;
  await writeJson(filePath, value);
}

async function writeTextIfMissing(filePath: string, value: string): Promise<void> {
  if (await exists(filePath)) return;
  await writeText(filePath, value);
}

export function designBenchmarkModel(report: AuditReport) {
  const findingsWithScreenshots = report.findings.filter((finding) => finding.evidence.screenshotRefs.length > 0).length;
  const findingsWithAcceptance = report.findings.filter((finding) => finding.implementation.acceptanceCriteria.length > 0).length;
  const approvalRequired = report.findings.filter(approvalRequiredForFinding).length;
  const evidenceCompleteness = percent(findingsWithScreenshots, Math.max(report.findings.length, 1));
  const actionability = percent(findingsWithAcceptance, Math.max(report.findings.length, 1));
  const handoffReadiness = Math.round((evidenceCompleteness * 0.35) + (actionability * 0.35) + (report.pages.length > 0 ? 20 : 0) + (report.tickets.length > 0 ? 10 : 0));

  return {
    schemaVersion: "design-review-workflow.benchmark.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    url: report.config.url,
    score: {
      overall: Math.min(100, handoffReadiness),
      evidenceCompleteness,
      actionability,
      reportCompleteness: 100
    },
    counts: {
      pages: report.pages.length,
      findings: report.findings.length,
      findingsWithScreenshots,
      tickets: report.tickets.length,
      approvalRequired
    },
    gates: [
      { name: "Evidence-backed findings", status: findingsWithScreenshots === report.findings.length ? "pass" : "warn" },
      { name: "Acceptance criteria", status: findingsWithAcceptance === report.findings.length ? "pass" : "warn" },
      { name: "Agent handoff bundle", status: "pass" },
      { name: "Risk approval boundaries", status: approvalRequired > 0 ? "warn" : "pass" }
    ]
  };
}

export function defaultDesignStandardsRegistry(report?: AuditReport) {
  return {
    schemaVersion: "design-review-workflow.standards.v1",
    generatedAt: new Date().toISOString(),
    auditId: report?.auditId,
    rules: [
      { id: "design.evidence.required", area: "evidence", severity: "critical", description: "Every finding must cite captured URL and screenshot or page evidence." },
      { id: "design.safety.no-private-actions", area: "safety", severity: "critical", description: "Agents must not enter auth, account, admin, payment, or checkout-completion flows." },
      { id: "design.hierarchy.primary-action", area: "conversion", severity: "high", description: "Core pages should expose one clear primary user action where appropriate." },
      { id: "design.content.headline-specificity", area: "content_design", severity: "medium", description: "Primary headings should state audience, outcome, or concrete page purpose." },
      { id: "design.trust.proof-near-decision", area: "trust", severity: "medium", description: "Credibility proof should appear near important decisions when relevant." },
      { id: "design.accessibility.labels-contrast", area: "accessibility_basic", severity: "high", description: "Forms require accessible names and text should meet common readability thresholds." },
      { id: "design.mobile.tap-targets", area: "mobile", severity: "medium", description: "Important touch targets should be comfortably tappable on mobile." },
      { id: "design.system.consistency", area: "design_system", severity: "medium", description: "Typography, color, spacing, and component treatments should use consistent patterns." }
    ],
    riskBoundaries: [
      "Conversion, trust, policy, pricing, brand positioning, and checkout-adjacent changes require human approval before implementation.",
      "The workflow produces design-review guidance, not legal accessibility certification or analytics-backed causal claims."
    ]
  };
}

function renderEvidenceJsonl(report: AuditReport): string {
  const rows: unknown[] = [];
  for (const page of report.pages) {
    rows.push({
      type: "page",
      pageId: page.pageId,
      url: page.url,
      pageType: page.pageType,
      title: page.title,
      screenshots: Object.values(page.screenshots).map((screenshot) => screenshot.path),
      extractedEvidencePath: `extracted/pages/${page.pageId}.json`
    });
  }
  for (const finding of report.findings) {
    rows.push({
      type: "finding",
      findingId: finding.findingId,
      title: finding.title,
      category: finding.category,
      severity: finding.severity,
      priorityScore: finding.priorityScore,
      evidence: finding.evidence
    });
  }
  for (const annotation of report.screenshotAnnotations) {
    rows.push({
      type: "annotation",
      annotationId: annotation.annotationId,
      findingId: annotation.findingId,
      path: annotation.annotatedScreenshot.path
    });
  }
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function routeTemplateModel(report: AuditReport) {
  const groups = new Map<string, Array<{ pageId: string; url: string; title?: string; importance: string }>>();
  for (const page of report.pages) {
    const pathname = new URL(page.url).pathname;
    const depth = pathname.split("/").filter(Boolean).length;
    const key = `${page.pageType}:${depth}`;
    const group = groups.get(key) ?? [];
    group.push({ pageId: page.pageId, url: page.url, title: page.title, importance: page.businessImportance });
    groups.set(key, group);
  }
  return {
    schemaVersion: "design-review-workflow.route-templates.v1",
    auditId: report.auditId,
    templates: [...groups.entries()].map(([key, pages]) => ({
      templateId: key.replace(/[^a-z0-9]+/gi, "_").toLowerCase(),
      pageType: key.split(":")[0],
      depth: Number(key.split(":")[1]),
      pageCount: pages.length,
      pages
    }))
  };
}

function visualSystemModel(report: AuditReport) {
  const colors = new Map<string, number>();
  const backgrounds = new Map<string, number>();
  const fonts = new Map<string, number>();
  const fontSizes = new Map<string, number>();
  const radii = new Map<string, number>();

  for (const page of report.pages) {
    for (const color of page.cssSignals?.colors ?? []) increment(colors, color);
    for (const color of page.cssSignals?.backgroundColors ?? []) increment(backgrounds, color);
    for (const font of page.cssSignals?.fonts ?? []) increment(fonts, font);
    for (const size of page.cssSignals?.fontSizes ?? []) increment(fontSizes, String(size));
    for (const radius of page.cssSignals?.borderRadii ?? []) increment(radii, String(radius));
  }

  return {
    schemaVersion: "design-review-workflow.visual-system.v1",
    auditId: report.auditId,
    colors: ranked(colors),
    backgroundColors: ranked(backgrounds),
    fonts: ranked(fonts),
    fontSizes: ranked(fontSizes),
    borderRadii: ranked(radii),
    risks: {
      typographyFragmentation: fontSizes.size > 14 || fonts.size > 4,
      colorFragmentation: colors.size + backgrounds.size > 36
    }
  };
}

function experienceTimingModel(report: AuditReport) {
  return {
    schemaVersion: "design-review-workflow.experience-timing.v1",
    auditId: report.auditId,
    source: "browser_navigation_timing",
    pages: report.pages.map((page) => ({
      pageId: page.pageId,
      url: page.url,
      status: page.performance?.status ?? "skipped",
      domContentLoadedMs: page.performance?.domContentLoadedMs,
      loadEventMs: page.performance?.loadEventMs,
      firstPaintMs: page.performance?.firstPaintMs,
      firstContentfulPaintMs: page.performance?.firstContentfulPaintMs,
      transferSizeKb: page.performance?.transferSizeKb,
      lighthouse: page.performance?.lighthouse
    }))
  };
}

function emptySuppressionReport(report: AuditReport) {
  return {
    schemaVersion: "design-review-workflow.suppression-report.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    suppressionsApplied: 0,
    suppressedFindingIds: [],
    note: "No suppressions were supplied. Suppressions are non-destructive and never remove findings from findings.json."
  };
}

function repoAnalysisPlaceholder(report: AuditReport) {
  return {
    schemaVersion: "design-review-workflow.repo-analysis.v1",
    auditId: report.auditId,
    status: "not_supplied",
    sourceRepo: null,
    frameworks: [],
    routeFiles: [],
    componentFiles: [],
    styleFiles: [],
    contentFiles: [],
    configFiles: [],
    note: "No target source repository was supplied. Run the workflow with --repo <path> to generate source-backed candidates."
  };
}

function sourceCandidatesPlaceholder(report: AuditReport) {
  return {
    schemaVersion: "design-review-workflow.source-candidates.v1",
    auditId: report.auditId,
    sourceRepo: null,
    byFinding: {},
    note: "No target source repository was supplied. Run the workflow with --repo <path> to map findings to files."
  };
}

function changedFilesPlaceholder(report: AuditReport) {
  return {
    schemaVersion: "design-review-workflow.changed-files.v1",
    auditId: report.auditId,
    mode: "proposal_only",
    changedFiles: [],
    note: "No target source repository was supplied. Repo-aware candidate files can be generated with the CLI --repo option."
  };
}

function renderPatchPlan(report: AuditReport): string {
  const lines = [
    "# Patch Plan",
    "",
    "This workflow is report-first. It does not modify a target website repository unless an agent is explicitly given that repository and asked to implement changes.",
    "",
    "## Proposed Change Areas",
    ""
  ];
  for (const ticket of report.tickets.slice(0, 12)) {
    lines.push(`### ${ticket.title}`);
    lines.push(`- Priority: ${ticket.priority}`);
    lines.push(`- Owners: ${ticket.role.join(", ")}`);
    lines.push(`- Evidence: ${ticket.evidenceRefs.join(", ")}`);
    lines.push(`- Acceptance: ${ticket.acceptanceCriteria.join("; ")}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function renderManualActions(report: AuditReport): string {
  const gated = report.findings.filter(approvalRequiredForFinding);
  const lines = ["# Manual Actions", "", "Human approval is required before implementing risky public-facing changes.", ""];
  if (gated.length === 0) {
    lines.push("No approval-gated findings were detected by the current rules.");
  } else {
    for (const finding of gated) {
      lines.push(`- ${finding.title}: ${finding.recommendation}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderRemainingUserDecisions(report: AuditReport): string {
  const lines = [
    "# Remaining User Decisions",
    "",
    "- Confirm the website goal and target audience if they were inferred.",
    "- Approve conversion, trust, pricing, checkout-adjacent, or brand-positioning changes before implementation.",
    "- Provide the target website source repository when source-backed implementation is required.",
    "- Run a dedicated performance or accessibility audit when certification-grade evidence is needed.",
    ""
  ];
  if (report.config.websiteGoal) {
    lines.splice(2, 1, `- Website goal supplied: ${report.config.websiteGoal}`);
  }
  return lines.join("\n");
}

function renderDesignBenchmarkMarkdown(report: AuditReport): string {
  const benchmark = designBenchmarkModel(report);
  return `# Design Workflow Benchmark

Audit: ${report.auditId}
URL: ${report.config.url}

## Scores

- Overall handoff readiness: ${benchmark.score.overall}
- Evidence completeness: ${benchmark.score.evidenceCompleteness}
- Actionability: ${benchmark.score.actionability}
- Report completeness: ${benchmark.score.reportCompleteness}

## Gates

${benchmark.gates.map((gate) => `- ${gate.status}: ${gate.name}`).join("\n")}
`;
}

function approvalRequiredForFinding(finding: Finding): boolean {
  return finding.category === "conversion" || finding.category === "trust" || finding.severity === "critical";
}

function percent(numerator: number, denominator: number): number {
  return Math.round((numerator / denominator) * 100);
}

function increment(map: Map<string, number>, value: string): void {
  const key = value.trim();
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function ranked(map: Map<string, number>) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([value, count]) => ({ value, count }));
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false
  );
}
