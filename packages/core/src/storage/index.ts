import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { AuditReport, AuditReportSchema } from "../schemas/audit.js";
import { ensureDir, writeJson } from "../utils/fs.js";
import { siteSlug } from "../utils/url.js";
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
  overallScore: number;
  findings: number;
  pages: number;
};

export type ProjectIndex = {
  updatedAt: string;
  audits: ProjectIndexEntry[];
};

export async function updateProjectIndex(workspaceRoot: string, report: AuditReport, auditRoot: string, outputs: { json?: string; html?: string; pdf?: string }): Promise<ProjectIndex> {
  const indexPath = path.join(workspaceRoot, "projects", "index.json");
  await ensureDir(path.dirname(indexPath));
  const current = await readProjectIndex(workspaceRoot);
  const site = siteSlug(report.config.url);
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
    overallScore: report.scorecard.overallScore,
    findings: report.findings.length,
    pages: report.pages.length
  };

  const withoutCurrent = current.audits.filter((audit) => audit.auditId !== report.auditId);
  const next: ProjectIndex = {
    updatedAt: new Date().toISOString(),
    audits: [entry, ...withoutCurrent].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
  };
  await writeJson(indexPath, next);
  await upsertAuditIndexSqlite(workspaceRoot, entry).catch(() => undefined);
  return next;
}

export async function readProjectIndex(workspaceRoot: string): Promise<ProjectIndex> {
  const sqliteAudits = await readAuditIndexSqlite(workspaceRoot).catch(() => []);
  if (sqliteAudits.length > 0) {
    return {
      updatedAt: new Date().toISOString(),
      audits: sqliteAudits
    };
  }

  const indexPath = path.join(workspaceRoot, "projects", "index.json");
  try {
    const parsed = JSON.parse(await readFile(indexPath, "utf8")) as ProjectIndex;
    return {
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
      audits: Array.isArray(parsed.audits) ? parsed.audits : []
    };
  } catch {
    return { updatedAt: new Date(0).toISOString(), audits: [] };
  }
}

export async function readReportFromAuditDir(auditDir: string): Promise<AuditReport> {
  const reportPath = path.join(auditDir, "report", "report.json");
  return AuditReportSchema.parse(JSON.parse(await readFile(reportPath, "utf8")));
}
