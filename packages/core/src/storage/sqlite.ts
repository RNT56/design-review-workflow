import * as path from "node:path";
import { ensureDir } from "../utils/fs.js";
import type { ProjectIndexEntry } from "./index.js";

type DatabaseSyncConstructor = new (path: string, options?: { open?: boolean }) => {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    all(): unknown[];
  };
  close(): void;
};

export async function upsertAuditIndexSqlite(indexRoot: string, entry: ProjectIndexEntry): Promise<void> {
  const dbPath = path.join(indexRoot, "audit-index.sqlite");
  await ensureDir(path.dirname(dbPath));
  const DatabaseSync = await getDatabaseSync();
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audits (
        audit_id TEXT PRIMARY KEY,
        site TEXT NOT NULL,
        url TEXT NOT NULL,
        mode TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        audit_root TEXT NOT NULL,
        report_json TEXT NOT NULL,
        report_html TEXT,
        report_pdf TEXT,
        overall_score INTEGER NOT NULL,
        findings INTEGER NOT NULL,
        pages INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audits_generated_at ON audits(generated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audits_site ON audits(site);
    `);
    db.prepare(`
      INSERT INTO audits (
        audit_id,
        site,
        url,
        mode,
        generated_at,
        audit_root,
        report_json,
        report_html,
        report_pdf,
        overall_score,
        findings,
        pages
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(audit_id) DO UPDATE SET
        site = excluded.site,
        url = excluded.url,
        mode = excluded.mode,
        generated_at = excluded.generated_at,
        audit_root = excluded.audit_root,
        report_json = excluded.report_json,
        report_html = excluded.report_html,
        report_pdf = excluded.report_pdf,
        overall_score = excluded.overall_score,
        findings = excluded.findings,
        pages = excluded.pages
    `).run(
      entry.auditId,
      entry.site,
      entry.url,
      entry.mode,
      entry.generatedAt,
      entry.auditRoot,
      entry.reportJson,
      entry.reportHtml ?? null,
      entry.reportPdf ?? null,
      entry.overallScore,
      entry.findings,
      entry.pages
    );
  } finally {
    db.close();
  }
}

export async function readAuditIndexSqlite(indexRoot: string, fileName = "audit-index.sqlite"): Promise<ProjectIndexEntry[]> {
  const dbPath = path.join(indexRoot, fileName);
  const DatabaseSync = await getDatabaseSync();
  const db = new DatabaseSync(dbPath, { open: true });
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audits (
        audit_id TEXT PRIMARY KEY,
        site TEXT NOT NULL,
        url TEXT NOT NULL,
        mode TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        audit_root TEXT NOT NULL,
        report_json TEXT NOT NULL,
        report_html TEXT,
        report_pdf TEXT,
        overall_score INTEGER NOT NULL,
        findings INTEGER NOT NULL,
        pages INTEGER NOT NULL
      );
    `);
    const rows = db
      .prepare(
        `SELECT audit_id, site, url, mode, generated_at, audit_root, report_json, report_html, report_pdf, overall_score, findings, pages
         FROM audits
         ORDER BY generated_at DESC`
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      auditId: String(row.audit_id),
      site: String(row.site),
      url: String(row.url),
      mode: String(row.mode),
      generatedAt: String(row.generated_at),
      auditRoot: String(row.audit_root),
      reportJson: String(row.report_json),
      reportHtml: row.report_html ? String(row.report_html) : undefined,
      reportPdf: row.report_pdf ? String(row.report_pdf) : undefined,
      overallScore: Number(row.overall_score),
      findings: Number(row.findings),
      pages: Number(row.pages)
    }));
  } catch {
    return [];
  } finally {
    db.close();
  }
}

async function getDatabaseSync(): Promise<DatabaseSyncConstructor> {
  const sqlite = (await import(`node:${"sqlite"}`)) as { DatabaseSync: DatabaseSyncConstructor };
  return sqlite.DatabaseSync;
}
