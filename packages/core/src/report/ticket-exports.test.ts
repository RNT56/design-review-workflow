import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { writeTicketExports } from "./ticket-exports.js";
import type { AuditPaths } from "../storage/project.js";
import type { AuditReport } from "../schemas/audit.js";

describe("writeTicketExports", () => {
  it("writes backlog and import artifacts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-export-"));
    const paths = {
      exports: path.join(root, "exports")
    } as AuditPaths;
    const report = {
      tickets: [
        {
          title: "Fix CTA hierarchy",
          role: ["designer"],
          priority: "high",
          effort: "low",
          sourceFindingIds: ["finding_1"],
          problem: "Primary action is unclear.",
          goal: "Make the primary action obvious.",
          scope: ["hero"],
          acceptanceCriteria: ["One primary CTA is visible."],
          definitionOfDone: ["Evidence reviewed."],
          evidenceRefs: ["screenshot_1"]
        }
      ]
    } as AuditReport;

    const outputs = await writeTicketExports(report, paths);
    expect(outputs.backlogJsonPath).toContain("ticket-backlog.json");
    expect(await readFile(outputs.githubIssuesPath!, "utf8")).toContain("Fix CTA hierarchy");
    expect(await readFile(outputs.linearCsvPath!, "utf8")).toContain('"Title","Description","Priority","Labels"');
  });
});
