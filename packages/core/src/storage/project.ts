import * as path from "node:path";
import { AuditConfig } from "../schemas/audit.js";
import { ensureDir, writeJson } from "../utils/fs.js";
import { siteSlug } from "../utils/url.js";

export type AuditPaths = {
  root: string;
  auditRoot: string;
  screenshotsDesktop: string;
  screenshotsMobile: string;
  screenshotsStates: string;
  extractedPages: string;
  agentRuns: string;
  synthesis: string;
  report: string;
};

export async function createAuditPaths(config: AuditConfig, workspaceRoot = process.cwd()): Promise<AuditPaths> {
  const root = path.join(workspaceRoot, "projects", siteSlug(config.url));
  const auditRoot = path.join(root, "audits", config.auditId);
  const paths: AuditPaths = {
    root,
    auditRoot,
    screenshotsDesktop: path.join(auditRoot, "screenshots", "desktop"),
    screenshotsMobile: path.join(auditRoot, "screenshots", "mobile"),
    screenshotsStates: path.join(auditRoot, "screenshots", "states"),
    extractedPages: path.join(auditRoot, "extracted", "pages"),
    agentRuns: path.join(auditRoot, "agent-runs"),
    synthesis: path.join(auditRoot, "synthesis"),
    report: path.join(auditRoot, "report")
  };

  await Promise.all(Object.values(paths).map((dir) => ensureDir(dir)));
  await writeJson(path.join(auditRoot, "audit-config.json"), config);
  await writeJson(path.join(auditRoot, "audit-state.json"), {
    auditId: config.auditId,
    status: "created",
    createdAt: new Date().toISOString()
  });

  return paths;
}
