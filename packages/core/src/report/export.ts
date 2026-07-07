import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { AuditReport } from "../schemas/audit.js";
import { auditSlugForTarget, auditTimestamp } from "../storage/audit-output.js";
import { writeJson, writeText } from "../utils/fs.js";
import { readReportFromAuditDir } from "../storage/index.js";

export type AuditExportProfile = "review" | "full" | "repo-import";
export type AuditExportFormat = "zip" | "directory";

export type AuditExportOptions = {
  auditDir: string;
  profile?: AuditExportProfile;
  format?: AuditExportFormat;
  outputPath?: string;
  includePrivatePaths?: boolean;
  overwrite?: boolean;
};

export type AuditExportSummary = {
  auditDir: string;
  profile: AuditExportProfile;
  format: AuditExportFormat;
  outputPath: string;
  files: number;
  bytes: number;
  manifestPath: string;
  checksumsPath: string;
  localPathsRedacted: boolean;
};

type ExportEntry = {
  path: string;
  content: Buffer;
};

type ExportManifestArtifact = {
  path: string;
  bytes: number;
  sha256: string;
};

const REVIEW_FILES = new Set([
  "index.html",
  "audit-config.json",
  "audit-state.json",
  "report/report.html",
  "report/report.md",
  "report/report.json",
  "report/report.pdf",
  "report/index.html",
  "report/index.md",
  "report/executive-summary.md",
  "report/report-dashboard.json",
  "report/findings.json",
  "report/grouped-issues.json",
  "report/score.json",
  "report/validation.json",
  "report/quality-gate.json",
  "report/business-grade-gate.json",
  "report/design-benchmark.json",
  "report/design-benchmark.md",
  "report/standards-registry.json",
  "report/suppression-report.json",
  "report/actionability.json",
  "report/priority-action-plan.md",
  "report/redesign-briefing.md",
  "report/screenshot-manifest.json",
  "report/agent-visual-review.json"
]);

const REVIEW_PREFIXES = [
  "report/hosted/",
  "report/contact-sheets/",
  "report/agent-review-pack/gallery/",
  "screenshots/desktop/",
  "screenshots/mobile/",
  "screenshots/states/",
  "screenshots/annotated/"
];

const REPO_IMPORT_FILES = new Set([
  "index.html",
  "audit-config.json",
  "report/workflow-manifest.json",
  "report/handoff.json",
  "report/agent-execution-plan.md",
  "report/implementation-plan.json",
  "report/evidence-index.json",
  "report/evidence.jsonl",
  "report/repo-analysis.json",
  "report/source-candidates.json",
  "report/patch-plan.md",
  "report/changed-files.json",
  "report/route-templates.json",
  "report/visual-system.json",
  "report/experience-timing.json",
  "report/design-benchmark.json",
  "report/standards-registry.json",
  "report/suppression-report.json",
  "report/actionability.json",
  "report/findings.json",
  "report/grouped-issues.json",
  "report/score.json",
  "report/validation.json",
  "report/quality-gate.json",
  "report/business-grade-gate.json",
  "report/screenshot-manifest.json",
  "report/agent-visual-review.json"
]);

const REPO_IMPORT_PREFIXES = [
  "report/agent-instructions/",
  "report/agent-review-pack/",
  "report/contact-sheets/",
  "screenshots/desktop/",
  "screenshots/mobile/",
  "screenshots/states/",
  "screenshots/annotated/"
];

const EXCLUDED_TOP_LEVEL = new Set(["exports"]);
const EXCLUDED_FILES = new Set(["export-manifest.json", "checksums.sha256", "LICENSE-NOTICE.md"]);

export async function exportAudit(options: AuditExportOptions): Promise<AuditExportSummary> {
  const profile = normalizeProfile(options.profile ?? "review");
  const format = normalizeFormat(options.format ?? "zip");
  const auditDir = path.resolve(options.auditDir);
  const report = await readReportFromAuditDir(auditDir);
  const generatedAt = new Date().toISOString();
  const site = auditSlugForTarget(report.config.url, report.config.auditName, report.config.auditSlug);
  const exportBaseName = `design-review-${site}-${auditTimestamp(new Date(generatedAt))}-${profile}`;
  const outputPath =
    options.outputPath ??
    path.join(auditDir, "exports", format === "zip" ? `${exportBaseName}.zip` : exportBaseName);
  const localPathsRedacted = options.includePrivatePaths !== true;
  const selectedFiles = await selectAuditFiles(auditDir, profile);
  const entries = await buildExportEntries(auditDir, selectedFiles, localPathsRedacted);
  entries.push({ path: "LICENSE-NOTICE.md", content: Buffer.from(renderLicenseNotice(), "utf8") });

  const manifest = buildExportManifest({
    auditDir,
    outputPath,
    generatedAt,
    profile,
    format,
    report,
    entries,
    localPathsRedacted
  });
  entries.push({
    path: "export-manifest.json",
    content: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  });
  const checksums = renderChecksums(entries);
  entries.push({ path: "checksums.sha256", content: Buffer.from(checksums, "utf8") });

  await assertWritableOutput(outputPath, options.overwrite === true);
  if (format === "directory") {
    await writeDirectoryExport(outputPath, entries);
  } else {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, buildZip(entries));
  }

  await writeJson(path.join(auditDir, "export-manifest.json"), manifest);
  await writeText(path.join(auditDir, "checksums.sha256"), checksums);

  return {
    auditDir,
    profile,
    format,
    outputPath,
    files: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.content.byteLength, 0),
    manifestPath: format === "directory" ? path.join(outputPath, "export-manifest.json") : path.join(auditDir, "export-manifest.json"),
    checksumsPath: format === "directory" ? path.join(outputPath, "checksums.sha256") : path.join(auditDir, "checksums.sha256"),
    localPathsRedacted
  };
}

function normalizeProfile(profile: AuditExportProfile): AuditExportProfile {
  if (profile === "review" || profile === "full" || profile === "repo-import") return profile;
  throw new Error(`Unsupported export profile: ${profile}`);
}

function normalizeFormat(format: AuditExportFormat): AuditExportFormat {
  if (format === "zip" || format === "directory") return format;
  throw new Error(`Unsupported export format: ${format}`);
}

async function selectAuditFiles(auditDir: string, profile: AuditExportProfile): Promise<string[]> {
  const allFiles = await listFiles(auditDir);
  if (profile === "full") return allFiles;
  const files = profile === "review" ? REVIEW_FILES : REPO_IMPORT_FILES;
  const prefixes = profile === "review" ? REVIEW_PREFIXES : REPO_IMPORT_PREFIXES;
  return allFiles.filter((file) => files.has(file) || prefixes.some((prefix) => file.startsWith(prefix)));
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const relativePath = normalizeArchivePath(path.relative(root, absolute));
    if (EXCLUDED_FILES.has(relativePath)) continue;
    const topLevel = relativePath.split("/")[0];
    if (topLevel && EXCLUDED_TOP_LEVEL.has(topLevel)) continue;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, absolute)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

async function buildExportEntries(auditDir: string, files: string[], redactLocalPaths: boolean): Promise<ExportEntry[]> {
  const entries: ExportEntry[] = [];
  for (const file of files) {
    const content = await readFile(path.join(auditDir, file));
    entries.push({
      path: file,
      content: redactLocalPaths && isLikelyText(file, content) ? sanitizeLocalPaths(content) : content
    });
  }
  return entries;
}

function buildExportManifest(input: {
  auditDir: string;
  outputPath: string;
  generatedAt: string;
  profile: AuditExportProfile;
  format: AuditExportFormat;
  report: AuditReport;
  entries: ExportEntry[];
  localPathsRedacted: boolean;
}) {
  const artifacts: ExportManifestArtifact[] = input.entries.map((entry) => ({
    path: entry.path,
    bytes: entry.content.byteLength,
    sha256: sha256(entry.content)
  }));
  return {
    schemaVersion: "design-review-workflow.export-manifest.v1",
    generatedAt: input.generatedAt,
    profile: input.profile,
    format: input.format,
    targetUrl: input.report.config.url,
    auditId: input.report.auditId,
    auditSlug: auditSlugForTarget(input.report.config.url, input.report.config.auditName, input.report.config.auditSlug),
    auditRunId: path.basename(input.auditDir),
    sourceAuditDir: input.localPathsRedacted ? "[redacted-local-path]" : input.auditDir,
    outputPath: input.localPathsRedacted ? "[redacted-local-path]" : input.outputPath,
    artifactCount: artifacts.length,
    artifacts,
    validationStatus: {
      businessGradeStatus: input.report.businessGradeStatus,
      qualityGate: readArtifactStatus(input.entries, "report/quality-gate.json"),
      validation: readArtifactStatus(input.entries, "report/validation.json"),
      businessGradeGate: readArtifactStatus(input.entries, "report/business-grade-gate.json")
    },
    privacy: {
      localPathsRedacted: input.localPathsRedacted,
      cloudUploadIncluded: false,
      note:
        "Exports are deterministic local packages. Upload to Google Drive, Dropbox, S3, or similar storage should be performed only by an explicitly authorized external agent connector."
    },
    license: {
      noticeFile: "LICENSE-NOTICE.md",
      summary:
        "Design Review Workflow is non-commercial by default. Commercial use or use for paid/client work requires separate permission from the rights holder."
    }
  };
}

function readArtifactStatus(entries: ExportEntry[], file: string): string | undefined {
  const entry = entries.find((candidate) => candidate.path === file);
  if (!entry) return undefined;
  try {
    const parsed = JSON.parse(entry.content.toString("utf8")) as { status?: string };
    return parsed.status;
  } catch {
    return undefined;
  }
}

function renderLicenseNotice(): string {
  return `# License Notice

Design Review Workflow is provided for non-commercial use unless the rights holder grants
a separate commercial license.

The software, reports, recommendations, workflows, schemas, prompts, templates,
architecture, know-how, screenshots, and derived report materials must not be used in
commercial products, commercial services, paid work, client work, business operations,
design-review programs, commercial datasets, commercial models, or to inform commercial
work without separate permission.
`;
}

function renderChecksums(entries: ExportEntry[]): string {
  return `${entries
    .map((entry) => `${sha256(entry.content)}  ${entry.path}`)
    .sort()
    .join("\n")}\n`;
}

async function assertWritableOutput(outputPath: string, overwrite: boolean): Promise<void> {
  if (overwrite) return;
  try {
    await stat(outputPath);
    throw new Error(`Export output already exists: ${outputPath}. Use --overwrite to replace it.`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Export output already exists:")) {
      throw error;
    }
  }
}

async function writeDirectoryExport(outputPath: string, entries: ExportEntry[]): Promise<void> {
  for (const entry of entries) {
    const absolute = path.join(outputPath, entry.path);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, entry.content);
  }
}

function sanitizeLocalPaths(content: Buffer): Buffer {
  const sanitized = content
    .toString("utf8")
    .replace(/\/Users\/[A-Za-z0-9._-]+\/[^\s"')<>,]+/g, "[redacted-local-path]")
    .replace(/\/home\/[A-Za-z0-9._-]+\/[^\s"')<>,]+/g, "[redacted-local-path]")
    .replace(/[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\[^\s"')<>,]+/g, "[redacted-local-path]");
  return Buffer.from(sanitized, "utf8");
}

function isLikelyText(file: string, content: Buffer): boolean {
  if (content.includes(0)) return false;
  return /\.(csv|css|diff|html|json|jsonl|md|svg|txt|xml|ya?ml)$/i.test(file);
}

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function buildZip(entries: ExportEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const filename = Buffer.from(normalizeArchivePath(entry.path), "utf8");
    const crc = crc32(entry.content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(entry.content.byteLength, 18);
    localHeader.writeUInt32LE(entry.content.byteLength, 22);
    localHeader.writeUInt16LE(filename.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, filename, entry.content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(entry.content.byteLength, 20);
    centralHeader.writeUInt32LE(entry.content.byteLength, 24);
    centralHeader.writeUInt16LE(filename.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, filename);
    offset += localHeader.byteLength + filename.byteLength + entry.content.byteLength;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.byteLength, 12);
  end.writeUInt32LE(localFiles.byteLength, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([localFiles, centralDirectory, end]);
}

function crc32(content: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = new Uint32Array(
  Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  })
);

function normalizeArchivePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}
