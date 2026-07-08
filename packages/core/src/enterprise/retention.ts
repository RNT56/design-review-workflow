import { readdir, stat } from "node:fs/promises";
import * as path from "node:path";
import { readReportFromAuditDir } from "../storage/index.js";

export type RetentionPlanResult = {
  schemaVersion: "design-review-workflow.retention-plan.v1";
  auditDir: string;
  generatedAt: string;
  policy: {
    screenshots: string;
    providerPayloads: string;
    exports: string;
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
    name: "screenshots" | "provider_payloads" | "exports";
    policy: string;
    files: number;
    bytes: number;
    cleanupCandidate: boolean;
    paths: string[];
  }>;
  note: string;
};

export async function planAuditRetention(auditDir: string): Promise<RetentionPlanResult> {
  const resolvedAuditDir = path.resolve(auditDir);
  const report = await readReportFromAuditDir(resolvedAuditDir);
  const screenshotFiles = await listFilesIfExists(resolvedAuditDir, ["screenshots"]);
  const providerFiles = await listFilesIfExists(resolvedAuditDir, ["agent-runs"]);
  const exportFiles = await listFilesIfExists(resolvedAuditDir, ["exports"]);
  const groups = [
    await group(resolvedAuditDir, "screenshots", report.config.retention.screenshots, screenshotFiles),
    await group(resolvedAuditDir, "provider_payloads", report.config.retention.providerPayloads, providerFiles),
    await group(resolvedAuditDir, "exports", report.config.retention.exports, exportFiles)
  ];
  const cleanupGroups = groups.filter((item) => item.cleanupCandidate);
  return {
    schemaVersion: "design-review-workflow.retention-plan.v1",
    auditDir: resolvedAuditDir,
    generatedAt: new Date().toISOString(),
    policy: report.config.retention,
    totals: {
      files: groups.reduce((sum, item) => sum + item.files, 0),
      bytes: groups.reduce((sum, item) => sum + item.bytes, 0),
      cleanupCandidates: cleanupGroups.reduce((sum, item) => sum + item.files, 0),
      cleanupCandidateBytes: cleanupGroups.reduce((sum, item) => sum + item.bytes, 0)
    },
    groups,
    note:
      "Retention planning is non-destructive. This command reports cleanup candidates only; deleting local evidence requires a future explicit cleanup command."
  };
}

async function group(root: string, name: RetentionPlanResult["groups"][number]["name"], policy: string, paths: string[]) {
  const sizes = await Promise.all(paths.map((filePath) => sizeOfFile(path.join(root, filePath))));
  return {
    name,
    policy,
    files: paths.length,
    bytes: sizes.reduce((sum, size) => sum + size, 0),
    cleanupCandidate: policy === "plan_cleanup",
    paths: paths.slice(0, 250)
  };
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
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, absolute)));
    } else if (entry.isFile()) {
      files.push(path.relative(root, absolute).replace(/\\/g, "/"));
    }
  }
  return files.sort();
}

async function sizeOfFile(relativeOrAbsolute: string): Promise<number> {
  try {
    return (await stat(relativeOrAbsolute)).size;
  } catch {
    return 0;
  }
}
