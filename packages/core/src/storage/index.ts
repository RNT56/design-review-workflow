import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { AuditReport, AuditReportSchema } from "../schemas/audit.js";
import { ensureDir, writeJson } from "../utils/fs.js";
import { auditSlugForTarget, configuredAuditRoot, legacyProjectsRoot } from "./audit-output.js";
import { readAuditIndexSqlite, upsertAuditIndexSqlite } from "./sqlite.js";

export type ProjectIndexEntry = {
  auditId: string;
  site: string;
  url: string;
  mode: string;
  generatedAt: string;
  auditRoot: string;
  reportJson: string;
  reportHtml?: string;
  reportPdf?: string;
  workflowManifest?: string;
  handoffJson?: string;
  validationJson?: string;
  qualityGateJson?: string;
  overallScore: number;
  findings: number;
  pages: number;
};

export type ProjectIndex = {
  updatedAt: string;
  audits: ProjectIndexEntry[];
};

export async function updateProjectIndex(workspaceRoot: string, report: AuditReport, auditRoot: string, outputs: { json?: string; html?: string; pdf?: string }): Promise<ProjectIndex> {
  const indexRoot = configuredAuditRoot(report.config.auditRoot, workspaceRoot);
  const indexPath = path.join(indexRoot, "audit-index.json");
  await ensureDir(path.dirname(indexPath));
  const current = await readProjectIndex(workspaceRoot);
  const site = auditSlugForTarget(report.config.url, report.config.auditName, report.config.auditSlug);
  const entry: ProjectIndexEntry = {
    auditId: report.auditId,
    site,
    url: report.config.url,
    mode: report.config.mode,
    generatedAt: report.generatedAt,
    auditRoot,
    reportJson: outputs.json ?? path.join(auditRoot, "report", "report.json"),
    reportHtml: outputs.html,
    reportPdf: outputs.pdf,
    workflowManifest: path.join(auditRoot, "report", "workflow-manifest.json"),
    handoffJson: path.join(auditRoot, "report", "handoff.json"),
    validationJson: path.join(auditRoot, "report", "validation.json"),
    qualityGateJson: path.join(auditRoot, "report", "quality-gate.json"),
    overallScore: report.scorecard.overallScore,
    findings: report.findings.length,
    pages: report.pages.length
  };

  const withoutCurrent = current.audits.filter((audit) => audit.auditRoot !== auditRoot && audit.auditId !== report.auditId);
  const next: ProjectIndex = {
    updatedAt: new Date().toISOString(),
    audits: [entry, ...withoutCurrent].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
  };
  await writeJson(indexPath, next);
  await writeLatestPointers(indexRoot, entry);
  await upsertAuditIndexSqlite(indexRoot, entry).catch(() => undefined);
  return next;
}

export async function readProjectIndex(workspaceRoot: string, auditRootInput?: string): Promise<ProjectIndex> {
  const auditRoot = configuredAuditRoot(auditRootInput, workspaceRoot);
  const legacyRoot = legacyProjectsRoot(workspaceRoot);
  const sources = await Promise.all([
    readAuditIndexSqlite(auditRoot).catch(() => []),
    readIndexJson(path.join(auditRoot, "audit-index.json")).catch(() => []),
    readAuditIndexSqlite(legacyRoot, "index.sqlite").catch(() => []),
    readIndexJson(path.join(legacyRoot, "index.json")).catch(() => [])
  ]);
  const audits = dedupeAudits(sources.flat()).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  return {
    updatedAt: audits[0]?.generatedAt ?? new Date(0).toISOString(),
    audits
  };
}

export async function readReportFromAuditDir(auditDir: string): Promise<AuditReport> {
  const reportPath = path.join(auditDir, "report", "report.json");
  return AuditReportSchema.parse(JSON.parse(await readFile(reportPath, "utf8")));
}

async function writeLatestPointers(indexRoot: string, entry: ProjectIndexEntry): Promise<void> {
  const latest = {
    schemaVersion: "design-review-workflow.latest-audit.v1",
    updatedAt: new Date().toISOString(),
    audit: entry
  };
  await writeJson(path.join(indexRoot, "latest-audit.json"), latest);
  await writeJson(path.join(indexRoot, entry.site, "latest-audit.json"), latest);
}

async function readIndexJson(indexPath: string): Promise<ProjectIndexEntry[]> {
  const parsed = JSON.parse(await readFile(indexPath, "utf8")) as ProjectIndex;
  return Array.isArray(parsed.audits) ? parsed.audits : [];
}

function dedupeAudits(audits: ProjectIndexEntry[]): ProjectIndexEntry[] {
  const byKey = new Map<string, ProjectIndexEntry>();
  for (const audit of audits) {
    const key = audit.auditRoot || `${audit.site}:${audit.auditId}`;
    const current = byKey.get(key);
    if (!current || audit.generatedAt.localeCompare(current.generatedAt) >= 0) {
      byKey.set(key, audit);
    }
  }
  return [...byKey.values()];
}
