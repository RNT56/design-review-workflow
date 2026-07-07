import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createAuditConfig } from "../config/defaults.js";
import type { AuditReport } from "../schemas/audit.js";
import { AUDIT_ROOT_ENV, auditSlugForTarget, configuredAuditRoot, resolveAuditOutputLocation } from "./audit-output.js";
import { readProjectIndex, updateProjectIndex } from "./index.js";
import { createAuditPaths } from "./project.js";

describe("audit output storage policy", () => {
  it("defaults to deterministic audit-reports site/run folders", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-storage-"));
    const config = {
      ...createAuditConfig({
        url: "https://www.wenacar.de/",
        auditName: "WenaCar GmbH",
        outputPdf: false
      }),
      auditId: "scan_storage"
    };

    const paths = await createAuditPaths(config, root);

    expect(paths.root).toBe(path.join(root, "audit-reports", "wenacar-gmbh"));
    expect(paths.auditRoot).toMatch(/audit-reports\/wenacar-gmbh\/\d{4}-\d{2}-\d{2}T\d{6}Z-scan_storage$/);
    expect(JSON.parse(await readFile(path.join(paths.auditRoot, "audit-config.json"), "utf8"))).toMatchObject({
      auditRoot: "audit-reports",
      auditName: "WenaCar GmbH"
    });
  });

  it("honors audit root env and explicit output overrides without overwriting", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-storage-"));
    const previous = process.env[AUDIT_ROOT_ENV];
    process.env[AUDIT_ROOT_ENV] = "custom-audits";
    try {
      expect(configuredAuditRoot(undefined, root)).toBe(path.join(root, "custom-audits"));
      const config = {
        ...createAuditConfig({
          url: "https://example.com/",
          auditName: "Example Site",
          outputDir: "manual-output",
          outputPdf: false
        }),
        auditId: "scan_manual"
      };
      const location = resolveAuditOutputLocation(config, root);
      expect(location.auditReportsRoot).toBe(path.join(root, "custom-audits"));
      expect(location.auditRoot).toBe(path.join(root, "manual-output"));

      await createAuditPaths(config, root);
      await expect(createAuditPaths(config, root)).rejects.toThrow(/Audit output already exists/);
    } finally {
      if (previous === undefined) {
        delete process.env[AUDIT_ROOT_ENV];
      } else {
        process.env[AUDIT_ROOT_ENV] = previous;
      }
    }
  });

  it("uses audit name before domain for site slugs", () => {
    expect(auditSlugForTarget("https://www.example.com/", "Northwind Studio")).toBe("northwind-studio");
    expect(auditSlugForTarget("https://www.example.com/")).toBe("example-com");
  });

  it("preserves existing index entries in configured custom audit roots", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-storage-"));
    const customRoot = "custom-audits";
    const firstAuditRoot = path.join(root, customRoot, "example-com", "run-a");
    const secondAuditRoot = path.join(root, customRoot, "example-org", "run-b");

    await updateProjectIndex(root, indexedReport("scan_a", "https://example.com/", customRoot), firstAuditRoot, {});
    await updateProjectIndex(root, indexedReport("scan_b", "https://example.org/", customRoot), secondAuditRoot, {});

    const index = await readProjectIndex(root, customRoot);
    expect(index.audits.map((audit) => audit.auditId)).toEqual(["scan_b", "scan_a"]);
    expect(JSON.parse(await readFile(path.join(root, customRoot, "audit-index.json"), "utf8")).audits).toHaveLength(2);
  });

  it("keeps legacy project entries out of newly written custom-root indexes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-storage-"));
    const customRoot = "custom-audits";
    const legacyRoot = path.join(root, "projects");
    await mkdir(legacyRoot, { recursive: true });
    await writeFile(
      path.join(legacyRoot, "index.json"),
      `${JSON.stringify({ updatedAt: "2026-07-07T00:00:00.000Z", audits: [indexEntry("legacy_scan", "legacy-site", path.join(root, "projects", "legacy-site", "audits", "legacy_scan"))] }, null, 2)}\n`
    );

    await updateProjectIndex(root, indexedReport("scan_custom", "https://custom.example/", customRoot), path.join(root, customRoot, "custom-example", "run-a"), {});

    const customRaw = JSON.parse(await readFile(path.join(root, customRoot, "audit-index.json"), "utf8")) as { audits: Array<{ auditId: string }> };
    expect(customRaw.audits.map((audit) => audit.auditId)).toEqual(["scan_custom"]);
    expect((await readProjectIndex(root, customRoot)).audits.map((audit) => audit.auditId)).toEqual(["scan_custom", "legacy_scan"]);
  });
});

function indexedReport(auditId: string, url: string, auditRoot: string): AuditReport {
  return {
    auditId,
    generatedAt: auditId === "scan_a" ? "2026-07-07T00:00:00.000Z" : "2026-07-07T00:01:00.000Z",
    config: {
      auditId,
      mode: "quick_scan",
      url,
      auditRoot
    },
    scorecard: { overallScore: auditId === "scan_a" ? 80 : 82 },
    findings: [],
    pages: []
  } as unknown as AuditReport;
}

function indexEntry(auditId: string, site: string, auditRoot: string) {
  return {
    auditId,
    site,
    url: `https://${site}.example/`,
    mode: "quick_scan",
    generatedAt: "2026-07-06T00:00:00.000Z",
    auditRoot,
    reportJson: path.join(auditRoot, "report", "report.json"),
    overallScore: 70,
    findings: 0,
    pages: 0
  };
}
