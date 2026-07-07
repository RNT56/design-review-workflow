import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createAuditConfig } from "../config/defaults.js";
import { AUDIT_ROOT_ENV, auditSlugForTarget, configuredAuditRoot, resolveAuditOutputLocation } from "./audit-output.js";
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
});
