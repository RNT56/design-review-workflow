import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { AuditReport, Finding, PageEvidence, Scorecard } from "../schemas/audit.js";
import { createNestedAuditPaths } from "../storage/project.js";
import { writeReports } from "./index.js";
import { buildReviewPack } from "./review-pack.js";

describe("buildReviewPack", () => {
  it("creates screenshot manifests, prompts, template, schema, and contact sheets", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-review-pack-"));
    const auditRoot = path.join(root, "projects", "example-com", "audits", "audit_1");
    const paths = await createNestedAuditPaths(auditRoot);
    const report = sampleReport();
    await writePng(path.join(auditRoot, "screenshots", "desktop", "page_1_desktop_above_fold.png"));
    await writeReports(report.config, report, paths);

    const result = await buildReviewPack(auditRoot);
    const manifest = JSON.parse(await readFile(result.screenshotManifest, "utf8")) as { screenshots: unknown[] };
    const template = JSON.parse(await readFile(result.template, "utf8")) as { schemaVersion: string; pageReviews: unknown[] };

    expect(manifest.screenshots).toHaveLength(1);
    expect(template.schemaVersion).toBe("design-review-workflow.agent-visual-review.v1");
    expect(template.pageReviews).toHaveLength(1);
    expect(result.pagePrompts).toHaveLength(1);
    expect(result.contactSheets.length).toBeGreaterThanOrEqual(1);
    await expectExists(path.join(result.packRoot, "agent-review.schema.json"));
    await expectExists(result.contactSheets[0]);
  });
});

async function writePng(filePath: string): Promise<void> {
  await writeFile(
    filePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64"
    )
  );
}

async function expectExists(filePath: string): Promise<void> {
  await expect(access(filePath)).resolves.toBeUndefined();
}

function sampleReport(): AuditReport {
  const page = samplePage();
  const finding = sampleFinding();
  return {
    auditId: "audit_1",
    generatedAt: "2026-07-07T00:00:00.000Z",
    config: {
      auditId: "audit_1",
      mode: "quick_scan",
      url: "https://example.com/",
      maxPages: 1,
      language: "auto",
      competitors: [],
      viewports: [{ name: "desktop", width: 1440, height: 1000, deviceScaleFactor: 1, isMobile: false }],
      crawl: { sameDomainOnly: true, includeSubdomains: false, maxDepth: 1, excludePatterns: [] },
      interactions: { level: 1, allowCheckoutStart: false, allowFormErrorChecks: false, allowPurchase: false, allowLogin: false },
      outputs: { markdown: true, html: true, pdf: false, json: true, screenshotAnnotations: "basic" },
      modelRouter: { qualityProfile: "balanced", allowOpenRouter: false, allowOpenAI: false, allowAnthropic: false, allowGemini: false },
      scoring: { strictness: "enterprise", tone: "client_ready" }
    },
    businessGradeStatus: "automated_scan",
    websiteType: "portfolio",
    websiteTypeConfidence: "medium",
    pages: [page],
    findings: [finding],
    groupedIssues: [],
    quickWins: [],
    scorecard: scorecard(),
    screenshotAnnotations: [],
    competitorBenchmarks: [],
    redesignBriefing: [],
    tickets: [],
    assumptions: [],
    limitations: []
  };
}

function samplePage(): PageEvidence {
  return {
    pageId: "page_1",
    url: "https://example.com/",
    normalizedUrl: "https://example.com/",
    title: "Example",
    language: "en",
    pageType: "homepage",
    pageTypeConfidence: "high",
    businessImportance: "high",
    primaryUserGoal: "Understand the offer",
    screenshots: {
      page_1_desktop_above_fold: {
        id: "page_1_desktop_above_fold",
        viewport: "desktop",
        kind: "above_fold",
        path: "screenshots/desktop/page_1_desktop_above_fold.png",
        width: 1440,
        height: 1000
      }
    },
    text: {
      headings: [{ text: "Example", tag: "h1", visible: true }],
      buttons: [],
      links: [],
      forms: [],
      imagesMissingAlt: 0,
      imageCount: 0,
      visibleTextSample: "Example"
    },
    structure: { sections: [], components: [], navigation: [] }
  };
}

function sampleFinding(): Finding {
  return {
    findingId: "finding_1",
    source: "deterministic",
    title: "Primary action needs clearer hierarchy",
    category: "conversion",
    severity: "medium",
    priorityScore: 70,
    impact: "medium",
    effort: "medium",
    confidence: "high",
    evidence: {
      pageId: "page_1",
      url: "https://example.com/",
      viewport: "desktop",
      section: "hero",
      screenshotRefs: ["page_1_desktop_above_fold"],
      textQuotes: []
    },
    observation: "The deterministic scan identified a primary action hierarchy risk in captured evidence.",
    whyItMatters: "Primary actions need to be obvious for users ready to continue.",
    recommendation: "Make the primary action visually dominant while keeping secondary actions subordinate.",
    designPrinciples: ["hierarchy"],
    implementation: {
      owner: ["designer", "developer"],
      acceptanceCriteria: ["Primary CTA has stronger visual emphasis."],
      dependencies: [],
      definitionOfDone: ["A rerun confirms the CTA is dominant."]
    },
    relatedFindings: []
  };
}

function scorecard(): Scorecard {
  return {
    overallScore: 82,
    confidence: "medium",
    subscores: {
      visualDesignQuality: item(82),
      uxClarityNavigation: item(82),
      conversionReadiness: item(76),
      mobileExperience: item(82),
      brandFitTrust: item(82),
      contentDesignUxWriting: item(82),
      accessibilityBasics: item(82),
      performancePerception: item(82),
      designSystemConsistency: item(82)
    },
    weights: {},
    websiteTypeAdjustment: "test",
    topStrengths: [],
    topRisks: []
  };
}

function item(score: number) {
  return { score, confidence: "medium" as const, rationale: "test" };
}
