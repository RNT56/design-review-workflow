import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { readReportFromAuditDir } from "../storage/index.js";
import { writeJson } from "../utils/fs.js";

export const BundleIntegrityFileSchema = z.object({
  path: z.string().min(1),
  bytes: z.number().int().min(0),
  sha256: z.string().regex(/^[a-f0-9]{64}$/)
});

export const BundleIntegrityManifestSchema = z.object({
  schemaVersion: z.literal("design-review-workflow.bundle-integrity.v1"),
  auditId: z.string().min(1),
  generatedAt: z.string().datetime(),
  algorithm: z.literal("sha256"),
  scope: z.literal("canonical_evidence"),
  files: z.array(BundleIntegrityFileSchema).min(1)
});

export type BundleIntegrityManifest = z.infer<typeof BundleIntegrityManifestSchema>;

export type BundleIntegrityVerification = {
  status: "pass" | "fail";
  manifestPath: string;
  checkedFiles: number;
  errors: string[];
};

const CANONICAL_FILES = new Set([
  "audit-config.json",
  "crawl-map.json",
  "capture-failures.json",
  "page-inventory.json",
  "report/report.json",
  "report/evidence.jsonl",
  "report/evidence-brief.json",
  "report/screenshot-manifest.json",
  "report/agent-visual-review.json"
]);

const CANONICAL_PREFIXES = ["screenshots/desktop/", "screenshots/mobile/", "screenshots/states/", "extracted/pages/"];

export async function writeBundleIntegrityManifest(auditDir: string): Promise<BundleIntegrityManifest> {
  const resolvedAuditDir = path.resolve(auditDir);
  const report = await readReportFromAuditDir(resolvedAuditDir);
  const candidates = (await listFiles(resolvedAuditDir))
    .filter(isCanonicalEvidencePath)
    .sort();
  const files = await Promise.all(candidates.map(async (relativePath) => {
    const content = await readFile(path.join(resolvedAuditDir, relativePath));
    return {
      path: relativePath,
      bytes: content.byteLength,
      sha256: sha256(content)
    };
  }));
  const manifest = BundleIntegrityManifestSchema.parse({
    schemaVersion: "design-review-workflow.bundle-integrity.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    algorithm: "sha256",
    scope: "canonical_evidence",
    files
  });
  await writeJson(path.join(resolvedAuditDir, "report", "bundle-integrity.json"), manifest);
  return manifest;
}

export async function verifyBundleIntegrity(auditDir: string): Promise<BundleIntegrityVerification> {
  const resolvedAuditDir = path.resolve(auditDir);
  const manifestPath = path.join(resolvedAuditDir, "report", "bundle-integrity.json");
  const errors: string[] = [];
  let manifest: BundleIntegrityManifest;
  try {
    manifest = BundleIntegrityManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  } catch (error) {
    return {
      status: "fail",
      manifestPath,
      checkedFiles: 0,
      errors: [`Missing or invalid bundle integrity manifest: ${error instanceof Error ? error.message : String(error)}`]
    };
  }

  const report = await readReportFromAuditDir(resolvedAuditDir).catch(() => undefined);
  if (report && manifest.auditId !== report.auditId) {
    errors.push(`Integrity manifest auditId ${manifest.auditId} does not match report ${report.auditId}.`);
  }

  const manifestPaths = new Set<string>();
  for (const file of manifest.files) {
    const normalized = normalizeRelativePath(file.path);
    if (!isSafeRelativePath(normalized)) {
      errors.push(`Integrity manifest contains unsafe path: ${file.path}`);
      continue;
    }
    if (!isCanonicalEvidencePath(normalized)) {
      errors.push(`Integrity manifest contains non-canonical path: ${file.path}`);
      continue;
    }
    if (manifestPaths.has(normalized)) {
      errors.push(`Integrity manifest contains duplicate path: ${normalized}`);
      continue;
    }
    manifestPaths.add(normalized);
    try {
      const content = await readFile(path.join(resolvedAuditDir, normalized));
      if (content.byteLength !== file.bytes) {
        errors.push(`Integrity size mismatch for ${normalized}: expected ${file.bytes}, found ${content.byteLength}.`);
      }
      const digest = sha256(content);
      if (digest !== file.sha256) {
        errors.push(`Integrity checksum mismatch for ${normalized}.`);
      }
    } catch {
      errors.push(`Integrity file missing: ${normalized}`);
    }
  }

  const actualCanonicalPaths = (await listFiles(resolvedAuditDir)).filter(isCanonicalEvidencePath);
  for (const actualPath of actualCanonicalPaths) {
    if (!manifestPaths.has(actualPath)) {
      errors.push(`Canonical evidence is not covered by the integrity manifest: ${actualPath}`);
    }
  }

  for (const required of ["audit-config.json", "report/report.json", "report/evidence-brief.json", "report/screenshot-manifest.json"]) {
    if (!manifestPaths.has(required)) {
      errors.push(`Integrity manifest is missing required canonical evidence: ${required}`);
    }
  }

  return {
    status: errors.length > 0 ? "fail" : "pass",
    manifestPath,
    checkedFiles: manifest.files.length,
    errors
  };
}

function isCanonicalEvidencePath(value: string): boolean {
  const normalized = normalizeRelativePath(value);
  return CANONICAL_FILES.has(normalized) || CANONICAL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function isSafeRelativePath(value: string): boolean {
  return Boolean(value) && !path.isAbsolute(value) && value !== ".." && !value.startsWith("../") && !value.includes("/../");
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, absolute)));
    } else if (entry.isFile()) {
      const relative = normalizeRelativePath(path.relative(root, absolute));
      const fileStat = await stat(absolute).catch(() => undefined);
      if (fileStat?.isFile()) files.push(relative);
    }
  }
  return files;
}

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
