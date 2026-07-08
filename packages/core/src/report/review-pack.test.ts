import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { runAudit } from "../index.js";
import type { AuditReport, Finding, PageEvidence, Scorecard } from "../schemas/audit.js";
import { createNestedAuditPaths } from "../storage/project.js";
import { writeReports } from "./index.js";
import { buildReviewPack } from "./review-pack.js";

describe("buildReviewPack", () => {
  it("creates optimized sheets, gallery, manifest metadata, and issue evidence surfaces", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wdr-review-pack-"));
    const auditRoot = path.join(root, "projects", "example-com", "audits", "audit_1");
    const paths = await createNestedAuditPaths(auditRoot);
    const report = sampleReport();
    await writePng(path.join(auditRoot, "screenshots", "desktop", "page_1_desktop_above_fold.png"), 900, 600);
    await writePng(path.join(auditRoot, "screenshots", "desktop", "page_1_desktop_full_page.png"), 900, 2200);
    await writePng(path.join(auditRoot, "screenshots", "mobile", "page_1_mobile_above_fold.png"), 390, 844);
    await writePng(path.join(auditRoot, "screenshots", "states", "page_1_mobile_nav_open.png"), 390, 844);
    await writeReports(report.config, report, paths);

    const result = await buildReviewPack(auditRoot);
    const manifest = JSON.parse(await readFile(result.screenshotManifest, "utf8")) as {
      screenshots: Array<{ id: string; pixelWidth: number; pixelHeight: number; displayRole: string; sheetRefs: string[]; groups: string[] }>;
    };
    const reviewPackManifest = JSON.parse(await readFile(path.join(result.packRoot, "review-pack-manifest.json"), "utf8")) as {
      recommendedReviewOrder: Array<{ step: string; paths: string[] }>;
      sheets: Array<{ type: string; path: string; issueId?: string }>;
      evidenceBrief: { path: string; absolutePath: string };
      gallery: { path: string };
    };
    const template = JSON.parse(await readFile(result.template, "utf8")) as { schemaVersion: string; pageReviews: unknown[] };
    const reportEvidenceBrief = JSON.parse(await readFile(path.join(auditRoot, "report", "evidence-brief.json"), "utf8")) as { generatedAt: string };
    const packEvidenceBrief = JSON.parse(await readFile(path.join(result.packRoot, "evidence-brief.json"), "utf8")) as { generatedAt: string };
    const galleryHtml = await readFile(path.join(result.packRoot, "gallery", "index.html"), "utf8");
    const contactSheetIndexHtml = await readFile(path.join(auditRoot, "report", "contact-sheets", "index.html"), "utf8");

    expect(manifest.screenshots).toHaveLength(4);
    expect(manifest.screenshots.find((screenshot) => screenshot.id === "page_1_desktop_full_page")).toMatchObject({
      pixelHeight: 2200,
      displayRole: "full_page_flow"
    });
    expect(manifest.screenshots.find((screenshot) => screenshot.id === "page_1_desktop_above_fold")?.sheetRefs).toContain("contact-sheets/first-viewports.png");
    expect(manifest.screenshots.find((screenshot) => screenshot.id === "page_1_desktop_above_fold")?.groups).toContain("issue:issue_1");
    expect(manifest.screenshots.find((screenshot) => screenshot.id === "page_1_mobile_nav_state")).toMatchObject({
      displayRole: "state_capture",
      state: "mobile_nav_open",
      interactionState: { category: "navigation", label: "Menu" }
    });
    expect(reviewPackManifest.gallery.path).toBe("agent-review-pack/gallery/index.html");
    expect(reviewPackManifest.evidenceBrief.path).toBe("evidence-brief.json");
    expect(reviewPackManifest.evidenceBrief.absolutePath).toBe(path.join(auditRoot, "report", "evidence-brief.json"));
    expect(packEvidenceBrief.generatedAt).toBe(reportEvidenceBrief.generatedAt);
    expect(reviewPackManifest.recommendedReviewOrder.map((step) => step.step)).toEqual(["first_viewports", "issue_evidence", "page_flows", "interaction_states", "raw_screenshots"]);
    expect(reviewPackManifest.recommendedReviewOrder.find((step) => step.step === "interaction_states")?.paths).toContain("screenshots/states/page_1_mobile_nav_open.png");
    expect(reviewPackManifest.sheets.some((sheet) => sheet.type === "page_flow" && sheet.path === "contact-sheets/pages/page_1-flow.png")).toBe(true);
    expect(reviewPackManifest.sheets.some((sheet) => sheet.type === "issue_evidence" && sheet.path === "contact-sheets/issues/issue_1.png")).toBe(true);
    expect(galleryHtml).toContain("data-filter=\"page\"");
    expect(galleryHtml).toContain("../../contact-sheets/first-viewports.png");
    expect(galleryHtml).toContain("../../../screenshots/desktop/page_1_desktop_above_fold.png");
    expect(galleryHtml).not.toContain("http://");
    expect(galleryHtml).not.toContain("https://example.com/screenshots");
    expect(contactSheetIndexHtml).toContain("../../screenshots/desktop/page_1_desktop_above_fold.png");
    expect(template.schemaVersion).toBe("design-review-workflow.agent-visual-review.v1");
    expect(template.pageReviews).toHaveLength(1);
    expect(result.pagePrompts).toHaveLength(1);
    expect(result.contactSheets.length).toBeGreaterThanOrEqual(5);
    await expectExists(path.join(result.packRoot, "agent-review.schema.json"));
    await expectExists(path.join(auditRoot, "report", "contact-sheets", "first-viewports.png"));
    await expectExists(path.join(auditRoot, "report", "contact-sheets", "pages", "page_1-flow.png"));
    await expectExists(path.join(auditRoot, "report", "contact-sheets", "issues", "issue_1.png"));
    await expectExists(path.join(auditRoot, "report", "evidence-brief.json"));
    await expectExists(path.join(result.packRoot, "evidence-brief.json"));
    await expectExists(path.join(result.packRoot, "gallery", "index.html"));
  });

  it("builds readable review-pack surfaces from a captured deterministic fixture site", async () => {
    const fixture = await startFixtureSite();
    try {
      const root = await mkdtemp(path.join(tmpdir(), "wdr-review-pack-fixture-"));
      const result = await runAudit(
        {
          url: fixture.url,
          mode: "quick_scan",
          maxPages: 2,
          outputPdf: false,
          outputHtml: true,
          outputJson: true,
          outputMarkdown: true
        },
        { workspaceRoot: root }
      );
      const pack = await buildReviewPack(result.auditRoot);
      const manifest = JSON.parse(await readFile(pack.screenshotManifest, "utf8")) as {
        screenshots: Array<{ displayRole: string; pixelHeight: number; sheetRefs: string[] }>;
      };
      const reviewPackManifest = JSON.parse(await readFile(path.join(pack.packRoot, "review-pack-manifest.json"), "utf8")) as {
        sheets: Array<{ type: string; path: string }>;
      };
      const galleryHtml = await readFile(path.join(pack.packRoot, "gallery", "index.html"), "utf8");

      expect(manifest.screenshots.some((screenshot) => screenshot.displayRole === "full_page_flow" && screenshot.pixelHeight > 1000)).toBe(true);
      expect(manifest.screenshots.every((screenshot) => screenshot.sheetRefs.length > 0)).toBe(true);
      expect(reviewPackManifest.sheets.some((sheet) => sheet.path === "contact-sheets/first-viewports.png")).toBe(true);
      expect(reviewPackManifest.sheets.filter((sheet) => sheet.type === "page_flow").length).toBeGreaterThanOrEqual(1);
      expect(galleryHtml).toContain("data-filter=\"source\"");
      expect(galleryHtml).not.toMatch(/(?:src|href)="https?:\/\//);
      await expectExists(path.join(result.auditRoot, "report", "contact-sheets", "first-viewports.png"));
      await expectExists(path.join(result.auditRoot, "report", "agent-review-pack", "gallery", "index.html"));
    } finally {
      await fixture.close();
    }
  }, 90_000);
});

async function writePng(filePath: string, width: number, height: number): Promise<void> {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (width * y + x) << 2;
      const stripe = Math.floor(y / 120) % 2 === 0;
      png.data[index] = stripe ? 236 : 210;
      png.data[index + 1] = stripe ? 246 : 230;
      png.data[index + 2] = stripe ? 241 : 226;
      png.data[index + 3] = 255;
    }
  }
  await writeFile(filePath, PNG.sync.write(png));
}

async function expectExists(filePath: string): Promise<void> {
  await expect(access(filePath)).resolves.toBeUndefined();
}

async function startFixtureSite(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/work") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(fixtureHtml("Selected Work", "Proof-led case studies", "/"));
      return;
    }
    if (pathname === "/pixel.png") {
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end(PNG.sync.write(new PNG({ width: 80, height: 60 })));
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(fixtureHtml("Design Systems For Serious Teams", "A deterministic long-page fixture for visual evidence testing.", "/work"));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not expose a TCP port.");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => closeServer(server)
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function fixtureHtml(title: string, subtitle: string, linkHref: string): string {
  const sections = Array.from({ length: 10 }, (_, index) => {
    const alt = index % 2 === 0 ? `Project proof ${index + 1}` : "";
    return `<section class="proof">
      <div>
        <p class="eyebrow">Proof section ${index + 1}</p>
        <h2>${index % 2 === 0 ? "Operational clarity" : "Repeated CTA pattern"}</h2>
        <p>Repeated decision content gives full-page screenshots enough height to require readable chunking in review packs.</p>
        <a class="button" href="${linkHref}">Review the work</a>
      </div>
      <img src="/pixel.png" ${alt ? `alt="${alt}"` : ""} />
    </section>`;
  }).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin:0; font-family:Arial, sans-serif; color:#172026; background:#f6faf8; }
    header { position:sticky; top:0; z-index:2; display:flex; justify-content:space-between; align-items:center; padding:18px 32px; background:white; border-bottom:1px solid #d8e2e0; }
    nav a { margin-left:16px; color:#0f766e; font-weight:700; }
    .menu { display:none; }
    .hero { min-height:760px; display:grid; align-content:center; gap:18px; padding:48px 8vw; background:linear-gradient(180deg,#ffffff,#e6f2ef); }
    h1 { max-width:820px; font-size:64px; line-height:1.02; margin:0; }
    .hero p { max-width:620px; font-size:20px; color:#53666f; }
    .button { display:inline-flex; width:max-content; min-height:44px; align-items:center; border-radius:8px; padding:0 18px; color:white; background:#0f766e; text-decoration:none; font-weight:800; }
    .proof { display:grid; grid-template-columns:minmax(0,1fr) 240px; gap:28px; align-items:center; margin:24px auto; max-width:1100px; padding:28px; background:white; border:1px solid #d8e2e0; border-radius:8px; }
    .proof img { width:100%; height:170px; object-fit:cover; background:#e1ece9; }
    .eyebrow { color:#0f766e; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
    @media (max-width: 700px) {
      header { padding:12px 16px; }
      nav { display:none; }
      .menu { display:inline-flex; min-height:40px; align-items:center; border:1px solid #d8e2e0; border-radius:8px; background:white; }
      .menu[aria-expanded="true"] + nav { display:grid; position:absolute; top:64px; left:16px; right:16px; padding:16px; background:white; border:1px solid #d8e2e0; }
      .hero { min-height:760px; padding:36px 20px; }
      h1 { font-size:42px; }
      .proof { grid-template-columns:1fr; margin:16px; padding:20px; }
    }
  </style>
</head>
<body>
  <header>
    <strong>Fixture Studio</strong>
    <button class="menu" aria-expanded="false" onclick="this.setAttribute('aria-expanded', this.getAttribute('aria-expanded') === 'true' ? 'false' : 'true')">Menu</button>
    <nav><a href="/">Home</a><a href="/work">Work</a></nav>
  </header>
  <main>
    <section class="hero">
      <h1>${title}</h1>
      <p>${subtitle}</p>
      <a class="button" href="${linkHref}">Start the review</a>
    </section>
    ${sections}
  </main>
</body>
</html>`;
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
      relatedWorkflows: [],
      reviewMode: "auto",
      viewports: [{ name: "desktop", width: 1440, height: 1000, deviceScaleFactor: 1, isMobile: false }],
      capture: { settleScroll: true, reducedMotion: true, waitForImages: true, maxScrollPasses: 2, scrollStepRatio: 0.75, stepDelayMs: 180, settleTimeoutMs: 4000 },
      crawl: { sameDomainOnly: true, includeSubdomains: false, maxDepth: 1, excludePatterns: [] },
      interactions: {
        level: 1,
        captureStates: true,
        maxStateCapturesPerPage: 8,
        maxStateCapturesPerViewport: 5,
        allowCheckoutStart: false,
        allowFormErrorChecks: false,
        allowPurchase: false,
        allowLogin: false
      },
      retries: { capture: 1, provider: 1, export: 0 },
      privacy: { redactLocalPathsInExports: true, redactSecretsInExports: true, redactCookiesInReports: true },
      retention: { screenshots: "keep", providerPayloads: "keep", exports: "keep", dryRunOnly: true },
      outputs: { markdown: true, html: true, pdf: false, json: true, screenshotAnnotations: "basic" },
      modelRouter: { qualityProfile: "balanced", allowOpenRouter: false, allowOpenAI: false, allowAnthropic: false, allowGemini: false },
      scoring: { strictness: "enterprise", tone: "client_ready" }
    },
    businessGradeStatus: "automated_scan",
    websiteType: "portfolio",
    websiteTypeConfidence: "medium",
    pages: [page],
    findings: [finding],
    groupedIssues: [sampleIssue()],
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
      },
      page_1_desktop_full_page: {
        id: "page_1_desktop_full_page",
        viewport: "desktop",
        kind: "full_page",
        path: "screenshots/desktop/page_1_desktop_full_page.png",
        width: 1440,
        height: 2600
      },
      page_1_mobile_above_fold: {
        id: "page_1_mobile_above_fold",
        viewport: "mobile",
        kind: "above_fold",
        path: "screenshots/mobile/page_1_mobile_above_fold.png",
        width: 390,
        height: 844
      },
      page_1_mobile_nav_state: {
        id: "page_1_mobile_nav_state",
        viewport: "mobile",
        kind: "state",
        state: "mobile_nav_open",
        path: "screenshots/states/page_1_mobile_nav_open.png",
        width: 390,
        height: 844
      }
    },
    interactionStates: [
      {
        id: "state_mobile_nav",
        viewport: "mobile",
        category: "navigation",
        label: "Menu",
        triggerSelector: "[aria-controls='site-menu']",
        triggerRole: "button",
        triggerText: "Menu",
        action: "click",
        state: "mobile_nav_open",
        screenshotId: "page_1_mobile_nav_state",
        beforeUrl: "https://example.com/",
        afterUrl: "https://example.com/",
        urlChanged: false,
        notes: []
      }
    ],
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

function sampleIssue(): AuditReport["groupedIssues"][number] {
  return {
    issueId: "issue_1",
    title: "Primary action hierarchy needs stronger evidence",
    category: "conversion",
    severity: "medium",
    priorityScore: 76,
    source: "deterministic",
    affectedPages: [{ pageId: "page_1", url: "https://example.com/", section: "hero" }],
    sourceFindingIds: ["finding_1"],
    sourceReviewIds: [],
    evidenceRefs: ["page_1_desktop_above_fold", "page_1_mobile_above_fold"],
    observation: "The first viewport screenshots show the primary action competing with surrounding content.",
    recommendation: "Give the primary action clearer visual weight and place it closer to the message.",
    acceptanceCriteria: ["Desktop and mobile first viewports show one dominant primary CTA."]
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
