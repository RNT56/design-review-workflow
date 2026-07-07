import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import * as path from "node:path";
import express from "express";
import { chromium, type Browser } from "playwright";
import { PNG } from "pngjs";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type FixtureServer = {
  root: string;
  url: string;
  server: Server;
  vite: ViteDevServer;
};

let fixture: FixtureServer;
let browser: Browser;

describe("local evidence UI", () => {
  beforeAll(async () => {
    fixture = await startUiFixture();
    browser = await chromium.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await fixture?.vite.close();
    await closeServer(fixture?.server);
  });

  it("keeps screenshot drawers collapsed, links issue sheets, loads images, and gates Agent Review visibility", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(fixture.url, { waitUntil: "networkidle" });
      await page.locator(".history-row").first().click();

      await expect.poll(() => page.getByRole("button", { name: "Agent Review" }).count()).toBe(0);
      await page.getByRole("button", { name: "Evidence" }).click();
      await page.getByRole("button", { name: "Issue Evidence" }).click();

      const issueSheetHref = await page.getByRole("link", { name: "Issue evidence sheet" }).first().getAttribute("href");
      expect(issueSheetHref).toContain("/report/contact-sheets/issues/issue_1.png");

      const firstDrawerOpen = await page.locator("details.screenshot-drawer").first().evaluate((node) => (node as HTMLDetailsElement).open);
      expect(firstDrawerOpen).toBe(false);
      await page.locator("details.screenshot-drawer summary").first().click();
      const firstImage = page.locator("details.screenshot-drawer img").first();
      await expect
        .poll(async () => firstImage.evaluate((node) => (node as HTMLImageElement).naturalWidth).catch(() => 0))
        .toBeGreaterThan(0);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);

      await page.locator(".history-row").nth(1).click();
      await expect.poll(() => page.getByRole("button", { name: "Agent Review" }).count()).toBe(1);
    } finally {
      await page.close();
    }
  }, 60_000);
});

async function startUiFixture(): Promise<FixtureServer> {
  const root = await mkdtemp(path.join(tmpdir(), "wdr-ui-fixture-"));
  const siteRoot = path.join(root, "projects", "example-com", "audits");
  await writeAuditAssets(path.join(siteRoot, "audit_auto"));
  await writeAuditAssets(path.join(siteRoot, "audit_business"));

  const autoReport = reportFixture("audit_auto", false);
  const businessReport = reportFixture("audit_business", true);
  const reports = new Map([
    ["audit_auto", autoReport],
    ["audit_business", businessReport]
  ]);

  const app = express();
  app.use("/projects", express.static(path.join(root, "projects")));
  app.get("/api/audits", (_request, response) => {
    response.json([
      { site: "example-com", audit: "audit_auto", score: 72, findings: 1 },
      { site: "example-com", audit: "audit_business", score: 81, findings: 2 }
    ]);
  });
  app.get("/api/audits/:site/:audit/report", (request, response) => {
    const report = reports.get(request.params.audit);
    if (!report) {
      response.status(404).json({ error: "not found" });
      return;
    }
    response.json(report);
  });

  const vite = await createViteServer({
    root: path.resolve("apps/web"),
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);

  const server = await listen(app);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("UI fixture server did not expose a port.");
  return { root, server, vite, url: `http://127.0.0.1:${address.port}/` };
}

async function writeAuditAssets(auditRoot: string): Promise<void> {
  await mkdir(path.join(auditRoot, "screenshots", "desktop"), { recursive: true });
  await mkdir(path.join(auditRoot, "screenshots", "mobile"), { recursive: true });
  await mkdir(path.join(auditRoot, "report", "contact-sheets", "issues"), { recursive: true });
  await mkdir(path.join(auditRoot, "report", "contact-sheets", "pages"), { recursive: true });
  await mkdir(path.join(auditRoot, "report", "agent-review-pack", "gallery"), { recursive: true });
  await writePng(path.join(auditRoot, "screenshots", "desktop", "page_1_desktop_above_fold.png"), 640, 420);
  await writePng(path.join(auditRoot, "screenshots", "mobile", "page_1_mobile_above_fold.png"), 390, 844);
  await writePng(path.join(auditRoot, "report", "contact-sheets", "issues", "issue_1.png"), 900, 700);
  await writePng(path.join(auditRoot, "report", "contact-sheets", "first-viewports.png"), 900, 700);
  await writePng(path.join(auditRoot, "report", "contact-sheets", "all-pages.png"), 900, 700);
  await writePng(path.join(auditRoot, "report", "contact-sheets", "pages", "page_1-first-viewports.png"), 900, 700);
  await writePng(path.join(auditRoot, "report", "contact-sheets", "pages", "page_1-flow.png"), 900, 1400);
  await writeFile(path.join(auditRoot, "report", "agent-review-pack", "gallery", "index.html"), "<!doctype html><title>Gallery</title>");
}

function reportFixture(auditId: string, withAgentReview: boolean) {
  return {
    auditId,
    generatedAt: "2026-07-07T00:00:00.000Z",
    config: { url: "https://example.com/", mode: "quick_scan", outputs: { pdf: false, html: true, markdown: true, json: true } },
    businessGradeStatus: withAgentReview ? "business_grade" : "automated_scan",
    websiteType: "portfolio",
    websiteTypeConfidence: "medium",
    pages: [
      {
        pageId: "page_1",
        url: "https://example.com/",
        title: "Example",
        pageType: "homepage",
        businessImportance: "high",
        screenshots: {
          page_1_desktop_above_fold: {
            id: "page_1_desktop_above_fold",
            viewport: "desktop",
            kind: "above_fold",
            path: "screenshots/desktop/page_1_desktop_above_fold.png",
            width: 640,
            height: 420
          },
          page_1_mobile_above_fold: {
            id: "page_1_mobile_above_fold",
            viewport: "mobile",
            kind: "above_fold",
            path: "screenshots/mobile/page_1_mobile_above_fold.png",
            width: 390,
            height: 844
          }
        }
      }
    ],
    findings: [
      {
        findingId: "finding_1",
        source: "deterministic",
        title: "Primary CTA needs hierarchy",
        category: "conversion",
        severity: "medium",
        priorityScore: 72,
        impact: "medium",
        effort: "medium",
        confidence: "high",
        observation: "The primary CTA competes with surrounding content.",
        recommendation: "Increase CTA contrast and place it closer to the headline.",
        evidence: { url: "https://example.com/", viewport: "desktop", section: "hero", screenshotRefs: ["page_1_desktop_above_fold"] }
      }
    ],
    groupedIssues: [
      {
        issueId: "issue_1",
        title: "Primary CTA hierarchy is not strong enough",
        category: "conversion",
        severity: "medium",
        priorityScore: 76,
        source: withAgentReview ? "merged" : "deterministic",
        affectedPages: [{ pageId: "page_1", url: "https://example.com/", section: "hero" }],
        sourceFindingIds: ["finding_1"],
        sourceReviewIds: withAgentReview ? ["visual_1"] : [],
        evidenceRefs: ["page_1_desktop_above_fold", "missing_ref_for_warning"],
        observation: "The first viewport evidence shows a CTA that does not dominate the decision area.",
        recommendation: "Make one primary next action visually dominant in the first viewport.",
        acceptanceCriteria: ["The first viewport has one clearly dominant primary CTA."]
      }
    ],
    agentVisualReview: withAgentReview
      ? {
          reviewer: "codex",
          reviewedAt: "2026-07-07T00:00:00.000Z",
          auditId,
          designVerdict: {
            readiness: "targeted_redesign_recommended",
            styleAndTaste: "The fixture page feels clean and practical, but the CTA area needs more confidence and visual emphasis.",
            messagingAndCopy: "The fixture copy explains the general offer, but it needs sharper CTA wording and more proof near the decision point.",
            audienceFit: "The visual language fits a professional audience that wants a quick read and clear next step.",
            brandFit: "The brand impression is coherent enough for the fixture but would benefit from stronger proof placement.",
            strongestDesignQualities: ["The first viewport keeps the offer readable and avoids unnecessary decoration."],
            weakestDesignRisks: ["The primary action is too visually muted for a decision-oriented page."],
            redesignDirection: "Keep the restrained structure and redesign the action/proof area to make the decision path more obvious.",
            rationale: "The screenshot evidence shows a clear page structure, but the business action does not read as strongly as the message.",
            confidence: "high",
            limitations: []
          },
          screenshotsReviewed: ["page_1_desktop_above_fold", "page_1_mobile_above_fold"],
          pageReviews: [
            {
              pageId: "page_1",
              url: "https://example.com/",
              screenshotsReviewed: ["page_1_desktop_above_fold"],
              firstViewport: "The page communicates the offer but the CTA hierarchy is visually muted.",
              hierarchy: "Typography and spacing are readable, with a weak decision area.",
              composition: "The composition is stable but does not push the primary action into a strong focal position.",
              navigation: "Navigation is clear enough for the fixture.",
              ctaClarity: "The CTA is present, but it needs stronger contrast and isolation from supporting content.",
              mobile: "Mobile preserves the hero but compresses the CTA relationship.",
              trustAndProof: "Proof is present but not close enough to the action.",
              visualSystemCoherence: "The fixture has a coherent type and spacing system with room to clarify action treatment.",
              accessibilityBasics: "The visible text hierarchy is readable in the fixture screenshot.",
              styleAndTaste: "The page feels restrained and modern enough, but it lacks a decisive action moment.",
              messagingAndCopy: "The page copy is understandable, but the CTA label and supporting proof should be more specific to the user decision.",
              redesignAdvice: "Redesign the first viewport so message, proof, and CTA form one stronger decision unit.",
              notes: []
            }
          ],
          visualFindings: [
            {
              reviewId: "visual_1",
              title: "CTA needs stronger first-viewport dominance",
              category: "conversion",
              severity: "medium",
              confidence: "high",
              pageId: "page_1",
              url: "https://example.com/",
              evidenceRefs: ["page_1_desktop_above_fold"],
              observation: "The screenshot shows the CTA competing with adjacent visual elements.",
              recommendation: "Increase contrast and isolate the primary CTA."
            }
          ],
          redesignActions: [
            {
              actionId: "action_1",
              title: "Strengthen the first viewport CTA",
              priority: "medium",
              effort: "medium",
              confidence: "high",
              affectedPages: [{ pageId: "page_1", url: "https://example.com/", section: "hero" }],
              evidenceRefs: ["page_1_desktop_above_fold"],
              recommendation: "Increase the CTA contrast, spacing, and proof proximity so the first viewport has one obvious next step.",
              expectedImpact: "The first viewport should become easier to scan and easier to act on from the captured design state.",
              acceptanceCriteria: ["The primary CTA is visually dominant in the first viewport."],
              sourceFindingIds: ["finding_1"]
            }
          ],
          strengths: ["The first viewport is structurally clear."],
          risks: ["Decision action is visually underpowered."],
          confidence: "high",
          limitations: []
        }
      : undefined,
    quickWins: [{ findingId: "finding_1", title: "Primary CTA needs hierarchy", recommendation: "Increase CTA contrast." }],
    tickets: [],
    screenshotAnnotations: [],
    competitorBenchmarks: [],
    scorecard: {
      overallScore: withAgentReview ? 81 : 72,
      subscores: {
        visualDesignQuality: { score: 78, confidence: "medium", rationale: "fixture" },
        uxClarityNavigation: { score: 82, confidence: "medium", rationale: "fixture" },
        conversionReadiness: { score: 70, confidence: "medium", rationale: "fixture" }
      }
    },
    redesignBriefing: [{ title: "Fixture Briefing", body: "Improve first viewport CTA dominance." }]
  };
}

async function writePng(filePath: string, width: number, height: number): Promise<void> {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (width * y + x) << 2;
      png.data[index] = 232;
      png.data[index + 1] = x % 80 < 40 ? 244 : 226;
      png.data[index + 2] = 238;
      png.data[index + 3] = 255;
    }
  }
  await writeFile(filePath, PNG.sync.write(png));
}

function listen(app: express.Express): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server: Server | undefined): Promise<void> {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
