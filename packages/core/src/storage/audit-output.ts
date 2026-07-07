import * as path from "node:path";
import { AuditConfig } from "../schemas/audit.js";
import { sanitizePath, siteSlug } from "../utils/url.js";

export const DEFAULT_AUDIT_ROOT = "audit-reports";
export const AUDIT_ROOT_ENV = "DESIGN_REVIEW_AUDIT_ROOT";

export type AuditOutputLocation = {
  auditReportsRoot: string;
  siteSlug: string;
  runId: string;
  auditRoot: string;
  explicitOutput: boolean;
};

export function configuredAuditRoot(input?: string, workspaceRoot = process.cwd()): string {
  return path.resolve(workspaceRoot, input ?? process.env[AUDIT_ROOT_ENV] ?? DEFAULT_AUDIT_ROOT);
}

export function auditSlugForTarget(targetUrl: string, auditName?: string, auditSlug?: string): string {
  const source = auditSlug?.trim() || auditName?.trim() || safeHostLabel(targetUrl);
  const slug = sanitizePath(
    source
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
  ).slice(0, 80);
  return slug || "site-audit";
}

export function auditTimestamp(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}${minutes}${seconds}Z`;
}

export function auditRunId(config: AuditConfig, date = new Date()): string {
  if (config.auditRunId?.trim()) return safeRunToken(config.auditRunId).slice(0, 120) || config.auditId;
  return `${auditTimestamp(date)}-${safeRunToken(config.auditId)}`;
}

export function resolveAuditOutputLocation(config: AuditConfig, workspaceRoot = process.cwd(), date = new Date()): AuditOutputLocation {
  const auditReportsRoot = configuredAuditRoot(config.auditRoot, workspaceRoot);
  const slug = auditSlugForTarget(config.url, config.auditName, config.auditSlug);
  if (config.outputDir?.trim()) {
    const auditRoot = path.resolve(workspaceRoot, config.outputDir);
    return {
      auditReportsRoot,
      siteSlug: slug,
      runId: path.basename(auditRoot),
      auditRoot,
      explicitOutput: true
    };
  }
  const runId = auditRunId(config, date);
  return {
    auditReportsRoot,
    siteSlug: slug,
    runId,
    auditRoot: path.join(auditReportsRoot, slug, runId),
    explicitOutput: false
  };
}

export function auditReportsRootFromAuditDir(auditDir: string): string | undefined {
  const resolved = path.resolve(auditDir);
  const parts = resolved.split(path.sep);
  const auditReportsIndex = parts.lastIndexOf(DEFAULT_AUDIT_ROOT);
  if (auditReportsIndex >= 0) {
    return parts.slice(0, auditReportsIndex + 1).join(path.sep) || path.sep;
  }
  const projectsIndex = parts.lastIndexOf("projects");
  if (projectsIndex >= 0) {
    return parts.slice(0, projectsIndex + 1).join(path.sep) || path.sep;
  }
  return undefined;
}

export function workspaceRootFromAuditReportsRoot(auditReportsRoot: string): string {
  const resolved = path.resolve(auditReportsRoot);
  return path.basename(resolved) === DEFAULT_AUDIT_ROOT || path.basename(resolved) === "projects"
    ? path.dirname(resolved)
    : path.dirname(path.dirname(resolved));
}

export function legacyProjectsRoot(workspaceRoot = process.cwd()): string {
  return path.resolve(workspaceRoot, "projects");
}

function safeHostLabel(targetUrl: string): string {
  try {
    return siteSlug(targetUrl);
  } catch {
    return targetUrl;
  }
}

function safeRunToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
