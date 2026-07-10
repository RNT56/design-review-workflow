import { createHash, randomBytes } from "node:crypto";
import type { AuditMode } from "../schemas/audit.js";
import type { Finding } from "../schemas/audit.js";

export function createAuditId(_mode: AuditMode): string {
  return `scan_${randomBytes(4).toString("hex")}`;
}

export function stableId(prefix: string, value: string, index?: number): string {
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 12);
  return index === undefined ? `${prefix}_${hash}` : `${prefix}_${index.toString().padStart(3, "0")}_${hash}`;
}

type FingerprintFinding = Pick<Finding, "category" | "title" | "recommendation" | "evidence">;

export function findingFingerprint(finding: FingerprintFinding): string {
  const route = routeTemplate(finding.evidence.url);
  const section = normalizeSemanticText(finding.evidence.section ?? "page");
  const value = [
    finding.category,
    normalizeSemanticText(finding.title),
    normalizeSemanticText(finding.recommendation),
    route,
    section
  ].join("|");
  return `ff_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

export function routeTemplate(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const pathname = url.pathname
      .replace(/\/+/g, "/")
      .replace(/\/$/, "")
      .split("/")
      .map((segment) => {
        if (/^\d+$/.test(segment)) return ":number";
        if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ":uuid";
        if (/^[0-9a-f]{16,}$/i.test(segment)) return ":id";
        return segment.toLowerCase();
      })
      .join("/");
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${pathname || "/"}`;
  } catch {
    return normalizeSemanticText(rawUrl);
  }
}

export function normalizeSemanticText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
