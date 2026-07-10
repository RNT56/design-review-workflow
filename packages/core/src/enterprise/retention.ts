import { readdir, stat } from "node:fs/promises";
import * as path from "node:path";
import { readReportFromAuditDir } from "../storage/index.js";

type RetentionGroupName = "screenshots" | "provider_payloads" | "exports" | "derived_assets";

export type RetentionPlanResult = {
  schemaVersion: "design-review-workflow.retention-plan.v2";
  auditDir: string;
  generatedAt: string;
  policy: {
    screenshots: string;
    providerPayloads: string;
    exports: string;
    derivedAssets?: string;
    maxAgeDays?: number;
    dryRunOnly: boolean;
  };
  totals: {
    files: number;
    bytes: number;
    cleanupCandidates: number;
    cleanupCandidateBytes: number;
  };
  groups: Array<{
    name: RetentionGroupName;
    policy: string;
    files: number;
    bytes: number;
    cleanupCandidate: boolean;
    cleanupCandidates: number;
    cleanupCandidateBytes: number;
    ageExpiredFiles: number;
    paths: string[];
    cleanupPaths: string[];
  }>;
  note: string;
};

export async function planAuditRetention(auditDir: string, now = new Date()): Promise<RetentionPlanResult> {
  const resolvedAuditDir = path.resolve(auditDir);
  const report = await readReportFromAuditDir(resolvedAuditDir);
  const policies = report.config.retention;
  const groups = [
    await group(resolvedAuditDir, "screenshots", policies.screenshots, await listFilesIfExists(resolvedAuditDir, ["screenshots"]), policies.maxAgeDays, now),
    await group(resolvedAuditDir, "provider_payloads", policies.providerPayloads, await listFilesIfExists(resolvedAuditDir, ["agent-runs"]), policies.maxAgeDays, now),
    await group(resolvedAuditDir, "exports", policies.exports, await listFilesIfExists(resolvedAuditDir, ["exports"]), policies.maxAgeDays, now),
    await group(
      resolvedAuditDir,
      "derived_assets",
      policies.derivedAssets ?? "keep",
      await listFilesAcross(resolvedAuditDir, [
        ["report", "contact-sheets"],
        ["report", "hosted", "assets"],
        ["report", "agent-review-pack", "gallery"]
      ]),
      policies.maxAgeDays,
      now
    )
  ];
  return {
    schemaVersion: "design-review-workflow.retention-plan.v2",
    auditDir: resolvedAuditDir,
    generatedAt: now.toISOString(),
    policy: policies,
    totals: {
      files: groups.reduce((sum, item) => sum + item.files, 0),
      bytes: groups.reduce((sum, item) => sum + item.bytes, 0),
      cleanupCandidates: groups.reduce((sum, item) => sum + item.cleanupCandidates, 0),
      cleanupCandidateBytes: groups.reduce((sum, item) => sum + item.cleanupCandidateBytes, 0)
    },
    groups,
    note: "Retention planning is non-destructive. Policy and maxAgeDays identify raw, provider, export, and regenerable derived candidates; no files are deleted."
  };
}

async function group(root: string, name: RetentionGroupName, policy: string, paths: string[], maxAgeDays: number | undefined, now: Date) {
  const metadata = await Promise.all(paths.map(async (filePath) => {
    const value = await stat(path.join(root, filePath)).catch(() => undefined);
    return { path: filePath, bytes: value?.size ?? 0, mtimeMs: value?.mtimeMs ?? now.getTime() };
  }));
  const cutoff = maxAgeDays === undefined ? undefined : now.getTime() - maxAgeDays * 86_400_000;
  const expired = cutoff === undefined ? [] : metadata.filter((item) => item.mtimeMs < cutoff);
  const cleanup = policy === "plan_cleanup" ? metadata : expired;
  return {
    name,
    policy,
    files: metadata.length,
    bytes: metadata.reduce((sum, item) => sum + item.bytes, 0),
    cleanupCandidate: cleanup.length > 0,
    cleanupCandidates: cleanup.length,
    cleanupCandidateBytes: cleanup.reduce((sum, item) => sum + item.bytes, 0),
    ageExpiredFiles: expired.length,
    paths: paths.slice(0, 250),
    cleanupPaths: cleanup.map((item) => item.path).slice(0, 250)
  };
}

async function listFilesAcross(root: string, groups: string[][]): Promise<string[]> {
  return [...new Set((await Promise.all(groups.map((segments) => listFilesIfExists(root, segments)))).flat())].sort();
}

async function listFilesIfExists(root: string, segments: string[]): Promise<string[]> {
  const absolute = path.join(root, ...segments);
  try {
    return await listFiles(root, absolute);
  } catch {
    return [];
  }
}

async function listFiles(root: string, current: string): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, absolute)));
    else if (entry.isFile()) files.push(path.relative(root, absolute).replace(/\\/g, "/"));
  }
  return files.sort();
}
