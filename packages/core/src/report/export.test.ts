import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createAuditConfig } from "../config/defaults.js";
import type { AuditConfig, AuditReport, Finding, Scorecard } from "../schemas/audit.js";
import { createAuditPaths } from "../storage/project.js";
import { writeReports } from "./index.js";
import { exportAudit } from "./export.js";

describe("exportAudit", () => {
  it("writes redacted repo-import directory exports with manifest, checksums, and license notice", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-export-"));
    const config = {
      ...createAuditConfig({
        url: "https://example.com/",
        auditName: "Example Client",
        outputPdf: false
      }),
      auditId: "scan_export",
      auditRunId: "manual-export"
    };
    const paths = await createAuditPaths(config, root);
    await writeFile(path.join(paths.screenshotsDesktop, "page_1_desktop_above_fold.png"), "png");
    await writeReports(config, sampleReport(config), paths);
    await writeFile(
      path.join(paths.report, "source-candidates.json"),
      `${JSON.stringify({ file: "/Users/example/private/site/src/App.tsx" }, null, 2)}\n`
    );

    const outputPath = path.join(paths.auditRoot, "exports", "repo-import");
    const result = await exportAudit({
      auditDir: paths.auditRoot,
      profile: "repo-import",
      format: "directory",
      outputPath
    });

    const manifest = JSON.parse(await readFile(path.join(outputPath, "export-manifest.json"), "utf8")) as {
      schemaVersion: string;
      profile: string;
      targetUrl: string;
      artifacts: Array<{ path: string }>;
      privacy: { localPathsRedacted: boolean; cloudUploadIncluded: boolean };
      license: { noticeFile: string };
    };
    const sourceCandidates = await readFile(path.join(outputPath, "report", "source-candidates.json"), "utf8");

    expect(result.outputPath).toBe(outputPath);
    expect(manifest.schemaVersion).toBe("design-review-workflow.export-manifest.v1");
    expect(manifest.profile).toBe("repo-import");
    expect(manifest.targetUrl).toBe("https://example.com/");
    expect(manifest.privacy).toMatchObject({ localPathsRedacted: true, cloudUploadIncluded: false });
    expect(manifest.license.noticeFile).toBe("LICENSE-NOTICE.md");
    expect(manifest.artifacts.some((artifact) => artifact.path === "report/handoff.json")).toBe(true);
    expect(sourceCandidates).toContain("[redacted-local-path]");
    expect(sourceCandidates).not.toContain("/Users/example/private");
    expect(await readFile(path.join(outputPath, "LICENSE-NOTICE.md"), "utf8")).toContain("non-commercial");
    expect(await readFile(path.join(outputPath, "checksums.sha256"), "utf8")).toContain("export-manifest.json");
    expect(await readFile(path.join(paths.auditRoot, "export-manifest.json"), "utf8")).toContain("design-review-workflow.export-manifest.v1");
  });

  it("writes review zip exports without requiring additional credentials", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-export-"));
    const config = {
      ...createAuditConfig({
        url: "https://example.org/",
        outputPdf: false
      }),
      auditId: "scan_zip",
      auditRunId: "manual-zip"
    };
    const paths = await createAuditPaths(config, root);
    await mkdir(paths.screenshotsDesktop, { recursive: true });
    await writeFile(path.join(paths.screenshotsDesktop, "page_1_desktop_above_fold.png"), "png");
    await writeReports(config, sampleReport(config), paths);

    const result = await exportAudit({ auditDir: paths.auditRoot, profile: "review", format: "zip" });
    const zip = await readFile(result.outputPath);

    expect(result.outputPath).toMatch(/exports\/design-review-example-org-\d{4}-\d{2}-\d{2}T\d{6}Z-review\.zip$/);
    expect(zip.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(await readFile(path.join(paths.auditRoot, "checksums.sha256"), "utf8")).toContain("LICENSE-NOTICE.md");
  });
});

function sampleReport(config: AuditConfig): AuditReport {
  const screenshot = {
    id: "page_1_desktop_above_fold",
    viewport: "desktop" as const,
    kind: "above_fold" as const,
    path: "screenshots/desktop/page_1_desktop_above_fold.png",
    width: 1440,
    height: 1000
  };
  const finding: Finding = {
    findingId: "finding_1",
    source: "deterministic",
    title: "Primary action needs clearer hierarchy",
    category: "conversion",
    severity: "high",
    priorityScore: 82,
    impact: "high",
    effort: "medium",
    confidence: "high",
    evidence: {
      pageId: "page_1",
      url: config.url,
      viewport: "desktop",
      section: "hero",
      screenshotRefs: [screenshot.id],
      textQuotes: ["Example Domain"]
    },
    observation: "The hero area does not make one next action visually dominant in captured evidence.",
    whyItMatters: "A clear primary action reduces decision friction for users who understand the offer.",
    recommendation: "Make one primary CTA visually dominant and keep secondary actions subordinate.",
    designPrinciples: ["hierarchy"],
    implementation: {
      owner: ["designer", "developer"],
      acceptanceCriteria: ["One primary CTA is visually dominant."],
      dependencies: [],
      definitionOfDone: ["A rerun shows the issue is no longer present."]
    },
    relatedFindings: []
  };

  return {
    auditId: config.auditId,
    generatedAt: "2026-07-07T00:00:00.000Z",
    config,
    websiteType: "unknown",
    websiteTypeConfidence: "low",
    businessGradeStatus: "automated_scan",
    pages: [
      {
        pageId: "page_1",
        url: config.url,
        normalizedUrl: config.url,
        title: "Example Domain",
        language: "en",
        pageType: "homepage",
        pageTypeConfidence: "high",
        businessImportance: "high",
        primaryUserGoal: "Understand the offer",
        screenshots: { [screenshot.id]: screenshot },
        text: {
          headings: [{ text: "Example Domain", tag: "h1", visible: true }],
          buttons: [],
          links: [],
          forms: [],
          imagesMissingAlt: 0,
          imageCount: 0,
          visibleTextSample: "Example Domain"
        },
        structure: { sections: [], components: [], navigation: [] }
      }
    ],
    findings: [finding],
    groupedIssues: [],
    quickWins: [],
    scorecard: scorecard(),
    screenshotAnnotations: [],
    competitorBenchmarks: [],
    redesignBriefing: [{ title: "Starting point", body: "A minimal report for tests." }],
    tickets: [
      {
        title: finding.title,
        role: finding.implementation.owner,
        priority: finding.severity,
        effort: finding.effort,
        sourceFindingIds: [finding.findingId],
        problem: finding.observation,
        goal: finding.recommendation,
        scope: ["hero"],
        acceptanceCriteria: finding.implementation.acceptanceCriteria,
        definitionOfDone: finding.implementation.definitionOfDone,
        evidenceRefs: [screenshot.id]
      }
    ],
    assumptions: [],
    limitations: []
  };
}

function scorecard(): Scorecard {
  return {
    overallScore: 83,
    confidence: "high",
    subscores: {
      visualDesignQuality: item(85),
      uxClarityNavigation: item(82),
      conversionReadiness: item(76),
      mobileExperience: item(84),
      brandFitTrust: item(80),
      contentDesignUxWriting: item(86),
      accessibilityBasics: item(88),
      performancePerception: item(90),
      designSystemConsistency: item(78)
    },
    weights: {},
    websiteTypeAdjustment: "none",
    topStrengths: [],
    topRisks: []
  };
}

function item(score: number) {
  return { score, confidence: "high" as const, rationale: "test" };
}
