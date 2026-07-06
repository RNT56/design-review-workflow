import { AuditMode } from "../schemas/audit.js";

export function createAuditId(mode: AuditMode): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${mode}`;
}

export function stableId(prefix: string, value: string, index?: number): string {
  const hash = [...value].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7).toString(36);
  return index === undefined ? `${prefix}_${hash}` : `${prefix}_${index.toString().padStart(3, "0")}_${hash}`;
}
