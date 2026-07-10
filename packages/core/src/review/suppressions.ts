import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { Finding } from "../schemas/audit.js";
import { readReportFromAuditDir } from "../storage/index.js";
import { writeJson } from "../utils/fs.js";
import { findingFingerprint } from "../utils/id.js";

const SuppressionEntrySchema = z
  .object({
    fingerprint: z.string().regex(/^ff_[0-9a-f]{24}$/).optional(),
    findingId: z.string().min(1).optional(),
    reason: z.string().min(10),
    owner: z.string().min(2),
    expiresAt: z.string().date().optional(),
    createdAt: z.string().datetime().optional(),
    ticket: z.string().min(1).optional()
  })
  .refine((entry) => Boolean(entry.fingerprint || entry.findingId), {
    message: "Each suppression must identify a finding by fingerprint or findingId."
  });

export const SuppressionLedgerSchema = z.object({
  schemaVersion: z.literal("design-review-workflow.suppressions.v2"),
  suppressions: z.array(SuppressionEntrySchema)
});

export type SuppressionReport = {
  schemaVersion: "design-review-workflow.suppression-report.v2";
  auditId: string;
  generatedAt: string;
  sourceFile: string;
  suppressionsApplied: number;
  suppressionsExpired: number;
  suppressionsUnmatched: number;
  suppressedFindingIds: string[];
  suppressedFindingFingerprints: string[];
  suppressions: Array<Record<string, unknown>>;
  expired: Array<Record<string, unknown>>;
  unmatched: Array<Record<string, unknown>>;
  note: string;
};

export async function applySuppressionLedger(
  auditDir: string,
  suppressionFile: string,
  now = new Date()
): Promise<{ report: SuppressionReport; outputPath: string }> {
  const audit = await readReportFromAuditDir(auditDir);
  const ledger = SuppressionLedgerSchema.parse(JSON.parse(await readFile(suppressionFile, "utf8")));
  const byFingerprint = new Map(audit.findings.map((finding) => [fingerprint(finding), finding]));
  const byId = new Map(audit.findings.map((finding) => [finding.findingId, finding]));
  const active: Array<Record<string, unknown>> = [];
  const expired: Array<Record<string, unknown>> = [];
  const unmatched: Array<Record<string, unknown>> = [];

  for (const entry of ledger.suppressions) {
    const finding = (entry.fingerprint ? byFingerprint.get(entry.fingerprint) : undefined) ??
      (entry.findingId ? byId.get(entry.findingId) : undefined);
    if (!finding) {
      unmatched.push({ ...entry, status: "unmatched" });
      continue;
    }
    const resolved = {
      ...entry,
      fingerprint: fingerprint(finding),
      findingId: finding.findingId,
      findingTitle: finding.title
    };
    if (entry.expiresAt && Date.parse(`${entry.expiresAt}T23:59:59.999Z`) < now.getTime()) {
      expired.push({ ...resolved, status: "expired" });
    } else {
      active.push({ ...resolved, status: "active" });
    }
  }

  const report: SuppressionReport = {
    schemaVersion: "design-review-workflow.suppression-report.v2",
    auditId: audit.auditId,
    generatedAt: now.toISOString(),
    sourceFile: path.resolve(suppressionFile),
    suppressionsApplied: active.length,
    suppressionsExpired: expired.length,
    suppressionsUnmatched: unmatched.length,
    suppressedFindingIds: active.map((entry) => String(entry.findingId)),
    suppressedFindingFingerprints: active.map((entry) => String(entry.fingerprint)),
    suppressions: active,
    expired,
    unmatched,
    note: "Suppressions are non-destructive. Findings and scores remain unchanged; active entries are available to monitor and downstream triage views."
  };
  const outputPath = path.join(auditDir, "report", "suppression-report.json");
  await writeJson(outputPath, report);
  return { report, outputPath };
}

export function activeSuppressedFingerprints(report: SuppressionReport): Set<string> {
  return new Set(report.suppressedFindingFingerprints);
}

function fingerprint(finding: Finding): string {
  return finding.fingerprint ?? findingFingerprint(finding);
}
