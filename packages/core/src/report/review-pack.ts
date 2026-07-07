import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { AgentVisualReview, AuditReport } from "../schemas/audit.js";
import { readReportFromAuditDir } from "../storage/index.js";
import { AuditPaths, createNestedAuditPaths } from "../storage/project.js";
import { ensureDir, writeJson, writeText } from "../utils/fs.js";
import { buildEvidenceBrief } from "./evidence-brief.js";
import { buildScreenshotManifest, ScreenshotManifest, writeScreenshotManifest } from "./screenshot-manifest.js";

export type ReviewPackResult = {
  auditId: string;
  auditRoot: string;
  packRoot: string;
  screenshotManifest: string;
  template: string;
  schema: string;
  instructions: string;
  evidenceBrief: string;
  contactSheets: string[];
  pagePrompts: string[];
};

type ReviewPackSheet = {
  id: string;
  type: "overview" | "first_viewports" | "page_first_viewports" | "page_flow" | "issue_evidence";
  title: string;
  path: string;
  absolutePath: string;
  screenshotIds: string[];
  pageId?: string;
  issueId?: string;
};

type ReviewPackManifest = {
  schemaVersion: "design-review-workflow.review-pack.v1";
  auditId: string;
  generatedAt: string;
  gallery: {
    path: string;
    absolutePath: string;
  };
  evidenceBrief: {
    path: string;
    absolutePath: string;
  };
  recommendedReviewOrder: Array<{
    step: "first_viewports" | "issue_evidence" | "page_flows" | "raw_screenshots";
    title: string;
    paths: string[];
  }>;
  sheets: ReviewPackSheet[];
  statistics: {
    pages: number;
    screenshots: number;
    firstViewportSheets: number;
    pageFlowSheets: number;
    issueSheets: number;
  };
};

export async function buildReviewPack(auditDir: string): Promise<ReviewPackResult> {
  const report = await readReportFromAuditDir(auditDir);
  const paths = await createNestedAuditPaths(auditDir);
  const packRoot = path.join(paths.report, "agent-review-pack");
  const promptRoot = path.join(packRoot, "page-prompts");
  const contactSheetRoot = path.join(paths.report, "contact-sheets");
  await ensureDir(packRoot);
  await ensureDir(promptRoot);
  await ensureDir(contactSheetRoot);

  const manifest = await writeScreenshotManifest(report, paths);
  const evidenceBrief = buildEvidenceBrief(report);
  const evidenceBriefPath = path.join(paths.report, "evidence-brief.json");
  await writeJson(evidenceBriefPath, evidenceBrief);
  await writeJson(path.join(packRoot, "evidence-brief.json"), evidenceBrief);
  await writeJson(path.join(packRoot, "agent-review-template.json"), reviewTemplate(report, manifest));
  await writeJson(path.join(packRoot, "agent-review.schema.json"), agentReviewJsonSchema());
  await writeText(path.join(packRoot, "README.md"), renderReviewPackReadme(report, paths));

  const pagePrompts = await writePagePrompts(report, manifest, promptRoot);
  const { sheets, galleryPath } = await renderReviewPackSurfaces(report, paths, manifest, contactSheetRoot);
  applySheetRefs(manifest, sheets);
  const reviewPackManifest = buildReviewPackManifest(report, paths, manifest, sheets, galleryPath);
  await writeJson(path.join(paths.report, "screenshot-manifest.json"), manifest);
  await writeJson(path.join(packRoot, "screenshot-manifest.json"), manifest);
  await writeJson(path.join(packRoot, "review-pack-manifest.json"), reviewPackManifest);
  await writeJson(path.join(packRoot, "contact-sheets.json"), {
    schemaVersion: "design-review-workflow.contact-sheets.v1",
    auditId: report.auditId,
    generatedAt: reviewPackManifest.generatedAt,
    sheets: sheets.map((sheet) => sheet.absolutePath)
  });

  return {
    auditId: report.auditId,
    auditRoot: paths.auditRoot,
    packRoot,
    screenshotManifest: path.join(paths.report, "screenshot-manifest.json"),
    template: path.join(packRoot, "agent-review-template.json"),
    schema: path.join(packRoot, "agent-review.schema.json"),
    instructions: path.join(packRoot, "README.md"),
    evidenceBrief: evidenceBriefPath,
    contactSheets: sheets.map((sheet) => sheet.absolutePath),
    pagePrompts
  };
}

function reviewTemplate(report: AuditReport, manifest: ScreenshotManifest): AgentVisualReview {
  return {
    schemaVersion: "design-review-workflow.agent-visual-review.v1",
    reviewer: "agent-name",
    reviewedAt: new Date().toISOString(),
    auditId: report.auditId,
    designVerdict: {
      readiness: "targeted_redesign_recommended",
      styleAndTaste: "TODO: describe the visual style, taste level, freshness, restraint, and whether the page feels modern and appropriate for the audience.",
      messagingAndCopy: "TODO: assess the site-level messaging and copy: clarity, specificity, tone, audience fit, proof, persuasion, and whether CTA wording supports the intended decision.",
      audienceFit: "TODO: explain whether the design language matches the likely target audience, their expectations, and the decision they need to make.",
      brandFit: "TODO: explain whether the visible brand impression feels credible, distinct, coherent, and aligned with the offer.",
      strongestDesignQualities: ["TODO: name a concrete visual strength supported by screenshot evidence."],
      weakestDesignRisks: ["TODO: name a concrete visual risk supported by screenshot evidence."],
      redesignDirection: "TODO: state the recommended redesign direction, including what should become more prominent, quieter, clearer, or more convincing.",
      rationale: "TODO: give an evidence-backed rationale for the readiness verdict, based only on screenshots and captured page evidence.",
      confidence: "medium",
      limitations: ["TODO: state any visual-review limits, such as missing brand context or pages not captured."]
    },
    screenshotsReviewed: manifest.screenshots.map((screenshot) => screenshot.id),
    pageReviews: report.pages.map((page) => ({
      pageId: page.pageId,
      url: page.url,
      screenshotsReviewed: Object.keys(page.screenshots),
      firstViewport: "TODO: inspect the first viewport screenshot and describe visual hierarchy, clarity, and immediate comprehension.",
      hierarchy: "TODO: inspect page hierarchy, typography, spacing, rhythm, scannability, and whether the most important content leads.",
      composition: "TODO: inspect layout balance, spatial rhythm, density, cropping, section transitions, and whether the composition feels intentional.",
      navigation: "TODO: inspect navigation clarity, orientation, information scent, and whether page-to-page movement is obvious.",
      ctaClarity: "TODO: inspect whether the primary next action is visually dominant, specific, and placed at the right decision moment.",
      messagingAndCopy: "TODO: inspect page copy for clarity, tone, specificity, audience fit, CTA wording, proof, and persuasion based on screenshots and evidence-brief signals.",
      mobile: "TODO: inspect mobile composition, cropping, density, CTA placement, and whether important content survives the small viewport.",
      trustAndProof: "TODO: inspect trust signals, proof, portfolio/service credibility, reassurance, and whether claims are visually supported.",
      visualSystemCoherence: "TODO: inspect whether type, color, spacing, card styles, borders, radii, and imagery form a coherent visual system.",
      accessibilityBasics: "TODO: inspect visible accessibility basics such as contrast, text size, tap target comfort, and readable structure.",
      styleAndTaste: "TODO: state whether the page feels dated, generic, premium, restrained, playful, utilitarian, overdesigned, or underdesigned, with evidence.",
      redesignAdvice: "TODO: state the concrete redesign advice for this page, even if the advice is to preserve the current direction with minor refinements.",
      notes: []
    })),
    visualFindings: [],
    redesignActions: [
      {
        actionId: "action_1",
        title: "TODO: concise redesign action title",
        priority: "medium",
        effort: "medium",
        confidence: "medium",
        affectedPages: report.pages.slice(0, 1).map((page) => ({ pageId: page.pageId, url: page.url, section: "first viewport" })),
        evidenceRefs: manifest.screenshots.slice(0, 1).map((screenshot) => screenshot.id),
        recommendation: "TODO: write a concrete redesign recommendation tied to visible screenshot evidence.",
        expectedImpact: "TODO: explain the expected user or business impact without claiming analytics, revenue, or user behavior.",
        acceptanceCriteria: ["TODO: write one objective acceptance criterion for the redesign action."],
        sourceFindingIds: []
      }
    ],
    strengths: [],
    risks: [],
    confidence: "medium",
    limitations: ["Template generated by the workflow. Replace TODO fields after visually inspecting screenshots."]
  };
}

function agentReviewJsonSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "AgentVisualReview",
    type: "object",
    required: ["schemaVersion", "reviewer", "reviewedAt", "auditId", "designVerdict", "screenshotsReviewed", "pageReviews", "visualFindings", "redesignActions", "strengths", "risks", "confidence", "limitations"],
    additionalProperties: false,
    properties: {
      schemaVersion: { const: "design-review-workflow.agent-visual-review.v1" },
      reviewer: { type: "string", minLength: 1 },
      reviewedAt: { type: "string", minLength: 1 },
      auditId: { type: "string", minLength: 1 },
      designVerdict: {
        type: "object",
        required: ["readiness", "styleAndTaste", "messagingAndCopy", "audienceFit", "brandFit", "strongestDesignQualities", "weakestDesignRisks", "redesignDirection", "rationale", "confidence", "limitations"],
        additionalProperties: false,
        properties: {
          readiness: { enum: ["no_major_redesign_needed", "minor_refinement_needed", "targeted_redesign_recommended", "major_redesign_recommended"] },
          styleAndTaste: { type: "string", minLength: 40 },
          messagingAndCopy: { type: "string", minLength: 40 },
          audienceFit: { type: "string", minLength: 40 },
          brandFit: { type: "string", minLength: 40 },
          strongestDesignQualities: { type: "array", minItems: 1, items: { type: "string", minLength: 20 } },
          weakestDesignRisks: { type: "array", minItems: 1, items: { type: "string", minLength: 20 } },
          redesignDirection: { type: "string", minLength: 40 },
          rationale: { type: "string", minLength: 40 },
          confidence: { enum: ["high", "medium", "low"] },
          limitations: { type: "array", items: { type: "string", minLength: 8 } }
        }
      },
      screenshotsReviewed: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
      pageReviews: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: [
            "pageId",
            "url",
            "screenshotsReviewed",
            "firstViewport",
            "hierarchy",
            "composition",
            "navigation",
            "ctaClarity",
            "messagingAndCopy",
            "mobile",
            "trustAndProof",
            "visualSystemCoherence",
            "accessibilityBasics",
            "styleAndTaste",
            "redesignAdvice",
            "notes"
          ],
          additionalProperties: false,
          properties: {
            pageId: { type: "string", minLength: 1 },
            url: { type: "string", format: "uri" },
            screenshotsReviewed: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
            firstViewport: { type: "string", minLength: 20 },
            hierarchy: { type: "string", minLength: 20 },
            composition: { type: "string", minLength: 20 },
            navigation: { type: "string", minLength: 20 },
            ctaClarity: { type: "string", minLength: 20 },
            messagingAndCopy: { type: "string", minLength: 20 },
            mobile: { type: "string", minLength: 20 },
            trustAndProof: { type: "string", minLength: 20 },
            visualSystemCoherence: { type: "string", minLength: 20 },
            accessibilityBasics: { type: "string", minLength: 20 },
            styleAndTaste: { type: "string", minLength: 20 },
            redesignAdvice: { type: "string", minLength: 20 },
            notes: { type: "array", items: { type: "string" } }
          }
        }
      },
      visualFindings: {
        type: "array",
        items: {
          type: "object",
          required: [
            "reviewId",
            "title",
            "category",
            "severity",
            "impact",
            "effort",
            "confidence",
            "pageId",
            "url",
            "evidenceRefs",
            "observation",
            "whyItMatters",
            "recommendation",
            "acceptanceCriteria",
            "sourceFindingIds"
          ],
          additionalProperties: false,
          properties: {
            reviewId: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 1 },
            category: { enum: ["visual_design", "ux", "conversion", "mobile", "brand", "trust", "content_design", "accessibility_basic", "performance_perception", "design_system", "competitor_gap"] },
            severity: { enum: ["critical", "high", "medium", "low"] },
            impact: { enum: ["high", "medium", "low"] },
            effort: { enum: ["low", "medium", "high"] },
            confidence: { enum: ["high", "medium", "low"] },
            pageId: { type: "string", minLength: 1 },
            url: { type: "string", format: "uri" },
            section: { type: "string" },
            evidenceRefs: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
            observation: { type: "string", minLength: 20 },
            whyItMatters: { type: "string", minLength: 20 },
            recommendation: { type: "string", minLength: 20 },
            acceptanceCriteria: { type: "array", minItems: 1, items: { type: "string", minLength: 8 } },
            sourceFindingIds: { type: "array", items: { type: "string" } }
          }
        }
      },
      redesignActions: {
        type: "array",
        items: {
          type: "object",
          required: ["actionId", "title", "priority", "effort", "confidence", "affectedPages", "evidenceRefs", "recommendation", "expectedImpact", "acceptanceCriteria", "sourceFindingIds"],
          additionalProperties: false,
          properties: {
            actionId: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 8 },
            priority: { enum: ["critical", "high", "medium", "low"] },
            effort: { enum: ["low", "medium", "high"] },
            confidence: { enum: ["high", "medium", "low"] },
            affectedPages: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["pageId", "url"],
                additionalProperties: false,
                properties: {
                  pageId: { type: "string", minLength: 1 },
                  url: { type: "string", format: "uri" },
                  section: { type: "string" }
                }
              }
            },
            evidenceRefs: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
            recommendation: { type: "string", minLength: 40 },
            expectedImpact: { type: "string", minLength: 30 },
            acceptanceCriteria: { type: "array", minItems: 1, items: { type: "string", minLength: 8 } },
            sourceFindingIds: { type: "array", items: { type: "string" } }
          }
        }
      },
      strengths: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
      confidence: { enum: ["high", "medium", "low"] },
      limitations: { type: "array", items: { type: "string" } }
    }
  };
}

function renderReviewPackReadme(report: AuditReport, paths: AuditPaths): string {
  return `# Agent Visual Review Pack

Target: ${report.config.url}
Audit: ${report.auditId}

This pack is for the repo-capable multimodal agent running the workflow. It intentionally does not call any model API. Inspect the screenshots and evidence yourself, then write a completed review JSON.

## Required Steps

1. Open \`review-pack-manifest.json\`.
2. Read \`evidence-brief.json\` for structured copy, CTA, proof, mobile, and visual-system signals.
3. Follow the recommended order: first viewports, issue evidence, page flows, then raw screenshots.
4. Use \`gallery/index.html\` for filtering by page, viewport, issue, screenshot kind, and source.
5. Inspect the optimized PNG sheets under \`../contact-sheets/\`.
6. Use \`agent-review-template.json\` as the starting shape.
7. Replace every TODO with concrete visual observations based on screenshots and evidence-brief signals.
8. Complete \`designVerdict\` with readiness, style/taste, messaging/copy, audience fit, brand fit, redesign direction, strengths, risks, rationale, confidence, and limitations.
9. Complete every \`pageReviews[]\` entry, including composition, CTA clarity, messaging/copy, visual-system coherence, accessibility basics, style/taste notes, and redesign advice.
10. Add at least 3 concrete \`redesignActions[]\`, or use \`designVerdict.readiness = "no_major_redesign_needed"\` with a detailed evidence-backed rationale.
11. Save your completed artifact at \`agent-runs/<agent>/visual-review.json\` or another local path.
12. Validate and import it:

\`\`\`bash
node apps/cli/dist/index.js agent-review validate --report ${paths.auditRoot} --file agent-runs/<agent>/visual-review.json
node apps/cli/dist/index.js agent-review import --report ${paths.auditRoot} --file agent-runs/<agent>/visual-review.json
node apps/cli/dist/index.js business-grade lint --report ${paths.auditRoot}
\`\`\`

## Review Rules

- Reference only screenshot IDs or screenshot paths listed in \`screenshot-manifest.json\`.
- Do not leave TODO/template text anywhere in the review artifact.
- Do not claim analytics, heatmaps, users, revenue, competitor performance, or brand rules unless they are explicitly supplied as evidence.
- Prefer grouped, root-cause issues over repeated page-level symptoms.
- Cover style/taste, hierarchy, composition, first viewport, CTA clarity, messaging/copy, trust/proof, portfolio narrative or service persuasion, bilingual consistency when visible, mobile feel, visual-system coherence, accessibility basics, and concrete redesign direction.
- Automated scans must not be treated as style/taste verdicts; business-grade style judgment comes from this completed artifact.
- If confidence is low, say why in \`limitations\`.
`;
}

async function writePagePrompts(report: AuditReport, manifest: ScreenshotManifest, promptRoot: string): Promise<string[]> {
  const output: string[] = [];
  for (const page of report.pages) {
    const screenshots = manifest.screenshots.filter((screenshot) => screenshot.pageId === page.pageId);
    const filePath = path.join(promptRoot, `${page.pageId}.md`);
    await writeText(
      filePath,
      [
        `# Visual Review Prompt: ${page.title ?? page.url}`,
        "",
        `Page ID: ${page.pageId}`,
        `URL: ${page.url}`,
        `Page type: ${page.pageType}`,
        `Importance: ${page.businessImportance}`,
        "",
        "## Screenshots To Inspect",
        "",
        ...screenshots.map((screenshot) => `- ${screenshot.id}: ${screenshot.path} (${screenshot.viewport}, ${screenshot.kind}, ${screenshot.width}x${screenshot.height})`),
        "",
        "## Required Judgment",
        "",
        "- First viewport: does the page immediately communicate what it is, who it is for, and what to do next?",
        "- Hierarchy: do typography, spacing, contrast, and layout make the important content dominant?",
        "- Composition: does the page feel intentionally arranged, balanced, and scannable?",
        "- CTA clarity: is the primary next action visually and verbally clear?",
        "- Messaging and copy: is the headline, support copy, tone, proof, and CTA wording specific, audience-fit, and persuasive?",
        "- Trust/proof: are credibility signals present, specific, and close to decision points?",
        "- Mobile composition: does the small viewport preserve the intent without awkward cropping or excessive density?",
        "- Visual-system coherence: do colors, type, spacing, components, imagery, and interaction states feel consistent?",
        "- Accessibility basics: are text size, visible contrast, structure, and tap-target comfort acceptable from the screenshots?",
        "- Style and taste: does the page feel current, credible, appropriate, overdesigned, underdesigned, generic, or distinctive?",
        "- Redesign advice: what specifically should be preserved, quieted, emphasized, removed, or redesigned?",
        "",
        "Use evidence-brief.json for objective copy, CTA, proof, mobile, and visual-system signals. Write findings only when screenshot evidence supports a defect claim. Always complete page review fields and redesign advice.",
        ""
      ].join("\n")
    );
    output.push(filePath);
  }
  return output;
}

async function renderReviewPackSurfaces(
  report: AuditReport,
  paths: AuditPaths,
  manifest: ScreenshotManifest,
  contactSheetRoot: string
): Promise<{ sheets: ReviewPackSheet[]; galleryPath: string }> {
  const browser = await chromium.launch();
  try {
    const sheets: ReviewPackSheet[] = [];
    const pageSheetRoot = path.join(contactSheetRoot, "pages");
    const issueSheetRoot = path.join(contactSheetRoot, "issues");
    const galleryRoot = path.join(paths.report, "agent-review-pack", "gallery");
    await ensureDir(pageSheetRoot);
    await ensureDir(issueSheetRoot);
    await ensureDir(galleryRoot);

    const overviewPath = path.join(contactSheetRoot, "all-pages.png");
    await renderSheet(browser, overviewPath, await renderOverviewSheetHtml(report, manifest));
    sheets.push(sheet("all-pages", "overview", "All Pages Screenshot Index", paths.report, overviewPath, manifest.screenshots.map((screenshot) => screenshot.id)));

    const firstViewportsPath = path.join(contactSheetRoot, "first-viewports.png");
    const firstViewportScreenshots = manifest.screenshots.filter((screenshot) => screenshot.displayRole === "first_viewport");
    await renderSheet(browser, firstViewportsPath, await renderFirstViewportsSheetHtml("First Viewports", report, manifest, firstViewportScreenshots));
    sheets.push(sheet("first-viewports", "first_viewports", "First Viewports", paths.report, firstViewportsPath, firstViewportScreenshots.map((screenshot) => screenshot.id)));

    for (const page of report.pages) {
      const pageScreenshots = manifest.screenshots.filter((screenshot) => screenshot.pageId === page.pageId);
      const pageFirstViewports = pageScreenshots.filter((screenshot) => screenshot.displayRole === "first_viewport");
      if (pageFirstViewports.length > 0) {
        const sheetPath = path.join(pageSheetRoot, `${page.pageId}-first-viewports.png`);
        await renderSheet(browser, sheetPath, await renderFirstViewportsSheetHtml(page.title ?? page.url, report, manifest, pageFirstViewports));
        sheets.push(sheet(`${page.pageId}-first-viewports`, "page_first_viewports", `${page.title ?? page.url} first viewports`, paths.report, sheetPath, pageFirstViewports.map((screenshot) => screenshot.id), page.pageId));
      }

      const pageFlows = pageScreenshots.filter((screenshot) => screenshot.displayRole === "full_page_flow");
      if (pageFlows.length > 0) {
        const flowPath = path.join(pageSheetRoot, `${page.pageId}-flow.png`);
        await renderSheet(browser, flowPath, await renderPageFlowSheetHtml(page.title ?? page.url, pageFlows));
        sheets.push(sheet(`${page.pageId}-flow`, "page_flow", `${page.title ?? page.url} page flow`, paths.report, flowPath, pageFlows.map((screenshot) => screenshot.id), page.pageId));
      }
    }

    for (const issue of report.groupedIssues) {
      const issueScreenshots = screenshotRefsForIssue(manifest, issue.evidenceRefs);
      if (issueScreenshots.length === 0) continue;
      const issuePath = path.join(issueSheetRoot, `${issue.issueId}.png`);
      await renderSheet(browser, issuePath, await renderIssueSheetHtml(report, manifest, issue.issueId));
      sheets.push(sheet(issue.issueId, "issue_evidence", issue.title, paths.report, issuePath, issueScreenshots.map((screenshot) => screenshot.id), undefined, issue.issueId));
    }

    await writeText(path.join(contactSheetRoot, "index.html"), await renderGalleryHtml(report, manifest, sheets, "../", "../../"));
    const galleryPath = path.join(galleryRoot, "index.html");
    await writeText(galleryPath, await renderGalleryHtml(report, manifest, sheets, "../../", "../../../"));
    return { sheets, galleryPath };
  } finally {
    await browser.close();
  }
}

async function renderSheet(browser: Awaited<ReturnType<typeof chromium.launch>>, outputPath: string, html: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
  await page.screenshot({ path: outputPath, fullPage: true });
  await page.close();
}

async function renderOverviewSheetHtml(report: AuditReport, manifest: ScreenshotManifest): Promise<string> {
  const pageRows = await Promise.all(
    report.pages.map(async (page) => {
      const screenshots = manifest.screenshots.filter((screenshot) => screenshot.pageId === page.pageId);
      const thumbs = await Promise.all(screenshots.map((screenshot) => renderThumbnailFigure(screenshot, "overview-thumb")));
      return `<article class="page-summary">
        <h2>${escapeHtml(page.title ?? page.url)}</h2>
        <p>${escapeHtml(page.pageType)} / ${escapeHtml(page.url)} / ${screenshots.length} raw screenshot(s)</p>
        <div class="thumbs">${thumbs.join("")}</div>
      </article>`;
    })
  );
  return shellHtml("All Pages Screenshot Index", `<section class="page-stack">${pageRows.join("")}</section>`);
}

async function renderFirstViewportsSheetHtml(title: string, report: AuditReport, manifest: ScreenshotManifest, screenshots: ScreenshotManifest["screenshots"]): Promise<string> {
  const rows = await Promise.all(
    report.pages
      .map((page) => ({
        page,
        screenshots: screenshots.filter((screenshot) => screenshot.pageId === page.pageId)
      }))
      .filter((row) => row.screenshots.length > 0)
      .map(async ({ page, screenshots: pageScreenshots }) => {
        const desktop = pageScreenshots.find((screenshot) => screenshot.viewport === "desktop") ?? pageScreenshots[0];
        const mobile = pageScreenshots.find((screenshot) => screenshot.viewport === "mobile");
        return `<article class="viewport-pair">
          <header><h2>${escapeHtml(page.title ?? page.url)}</h2><p>${escapeHtml(page.url)}</p></header>
          <div class="viewport-grid ${mobile ? "" : "viewport-grid--single"}">
            ${desktop ? await renderReadableFigure(desktop, "Desktop first viewport") : ""}
            ${mobile ? await renderReadableFigure(mobile, "Mobile first viewport") : ""}
          </div>
        </article>`;
      })
  );
  return shellHtml(title, `<section class="page-stack">${rows.join("")}</section>`);
}

async function renderPageFlowSheetHtml(title: string, screenshots: ScreenshotManifest["screenshots"]): Promise<string> {
  const sections = await Promise.all(
    screenshots.map(async (screenshot) => {
      const chunks = await renderFlowChunks(screenshot);
      return `<article class="flow-section">
        <h2>${escapeHtml(screenshot.viewport)} full-page flow</h2>
        <p>${escapeHtml(screenshot.id)} / ${screenshot.pixelWidth}x${screenshot.pixelHeight}</p>
        <div class="flow-chunks">${chunks}</div>
      </article>`;
    })
  );
  return shellHtml(`${title} Page Flow`, `<section class="flow-layout">${sections.join("")}</section>`);
}

async function renderIssueSheetHtml(report: AuditReport, manifest: ScreenshotManifest, issueId: string): Promise<string> {
  const issue = report.groupedIssues.find((item) => item.issueId === issueId);
  if (!issue) return shellHtml("Issue Evidence", "<p>Issue not found.</p>");
  const screenshots = screenshotRefsForIssue(manifest, issue.evidenceRefs);
  const figures = await Promise.all(
    screenshots.map((screenshot, index) => renderReadableFigure(screenshot, `${index + 1}. ${screenshot.viewport} ${screenshot.kind}`, index + 1))
  );
  const legend = screenshots
    .map((screenshot, index) => `<li><strong>${index + 1}</strong> ${escapeHtml(screenshot.pageTitle ?? screenshot.url)} / ${escapeHtml(screenshot.viewport)} / ${escapeHtml(screenshot.kind)}</li>`)
    .join("");
  return shellHtml(
    `Issue Evidence: ${issue.title}`,
    `<section class="issue-sheet">
      <aside class="issue-legend">
        <div class="severity">${escapeHtml(issue.severity)} / ${escapeHtml(issue.category)} / priority ${issue.priorityScore}</div>
        <h2>${escapeHtml(issue.title)}</h2>
        <p>${escapeHtml(issue.observation)}</p>
        <p><strong>Recommendation:</strong> ${escapeHtml(issue.recommendation)}</p>
        <h3>Evidence Legend</h3>
        <ol>${legend}</ol>
      </aside>
      <div class="issue-shots">${figures.join("")}</div>
    </section>`
  );
}

async function renderGalleryHtml(report: AuditReport, manifest: ScreenshotManifest, sheets: ReviewPackSheet[], contactSheetPrefix: string, rawScreenshotPrefix: string): Promise<string> {
  const sheetCards = sheets
    .map(
      (sheet) => `<article class="gallery-card" data-kind="sheet" data-page="${escapeAttribute(sheet.pageId ?? "")}" data-issue="${escapeAttribute(sheet.issueId ?? "")}" data-viewport="" data-source="${escapeAttribute(sheet.type)}">
        <h3>${escapeHtml(sheet.title)}</h3>
        <p>${escapeHtml(sheet.type)} / ${sheet.screenshotIds.length} screenshot(s)</p>
        <a href="${escapeAttribute(`${contactSheetPrefix}${sheet.path}`)}">Open sheet</a>
      </article>`
    )
    .join("");
  const rawCards = manifest.screenshots
    .map(
      (screenshot) => `<article class="gallery-card" data-kind="${escapeAttribute(screenshot.kind)}" data-page="${escapeAttribute(screenshot.pageId)}" data-issue="" data-viewport="${escapeAttribute(screenshot.viewport)}" data-source="raw">
        <h3>${escapeHtml(screenshot.pageTitle ?? screenshot.url)}</h3>
        <p>${escapeHtml(screenshot.viewport)} / ${escapeHtml(screenshot.kind)} / ${screenshot.pixelWidth}x${screenshot.pixelHeight}</p>
        <img src="${escapeAttribute(`${rawScreenshotPrefix}${screenshot.path}`)}" alt="${escapeAttribute(screenshot.id)}" loading="lazy" />
      </article>`
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Review Pack Gallery - ${escapeHtml(new URL(report.config.url).hostname)}</title>
  <style>
    :root { color-scheme: light; --ink:#172026; --muted:#61717b; --line:#d8e2e0; --panel:#f6faf8; --accent:#0f766e; }
    body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:#fff; }
    main { max-width:1280px; margin:0 auto; padding:28px; }
    h1 { margin:0 0 8px; font-size:30px; }
    .filters { display:flex; flex-wrap:wrap; gap:10px; margin:18px 0; padding:12px; border:1px solid var(--line); border-radius:8px; background:var(--panel); }
    select { min-height:36px; border:1px solid var(--line); border-radius:8px; padding:6px 10px; background:#fff; }
    .gallery { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }
    .gallery-card { border:1px solid var(--line); border-radius:8px; padding:12px; background:var(--panel); }
    .gallery-card[hidden] { display:none; }
    .gallery-card img { display:block; width:100%; max-height:280px; object-fit:cover; object-position:top; border:1px solid var(--line); border-radius:6px; background:#fff; }
    a { color:var(--accent); font-weight:700; }
  </style>
</head>
<body>
  <main>
    <h1>Review Pack Gallery</h1>
    <p>${escapeHtml(report.config.url)} / ${escapeHtml(report.auditId)}</p>
    <section class="filters">
      <label>Page <select data-filter="page"><option value="">All pages</option>${manifest.pages.map((page) => `<option value="${escapeAttribute(page.pageId)}">${escapeHtml(page.title ?? page.url)}</option>`).join("")}</select></label>
      <label>Viewport <select data-filter="viewport"><option value="">All viewports</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></label>
      <label>Kind <select data-filter="kind"><option value="">All kinds</option><option value="sheet">Sheets</option><option value="above_fold">Above fold</option><option value="full_page">Full page</option><option value="state">State</option></select></label>
      <label>Source <select data-filter="source"><option value="">All sources</option><option value="first_viewports">First viewports</option><option value="issue_evidence">Issue evidence</option><option value="page_flow">Page flows</option><option value="raw">Raw screenshots</option></select></label>
    </section>
    <section class="gallery">${sheetCards}${rawCards}</section>
  </main>
  <script>
    const controls = [...document.querySelectorAll('[data-filter]')];
    const cards = [...document.querySelectorAll('.gallery-card')];
    function applyFilters() {
      const active = Object.fromEntries(controls.map((control) => [control.dataset.filter, control.value]));
      for (const card of cards) {
        const visible = (!active.page || card.dataset.page === active.page) &&
          (!active.viewport || card.dataset.viewport === active.viewport) &&
          (!active.kind || card.dataset.kind === active.kind) &&
          (!active.source || card.dataset.source === active.source);
        card.hidden = !visible;
      }
    }
    controls.forEach((control) => control.addEventListener('change', applyFilters));
  </script>
</body>
</html>`;
}

async function renderThumbnailFigure(screenshot: ScreenshotManifest["screenshots"][number], className: string): Promise<string> {
  const src = await screenshotSrc(screenshot.absolutePath);
  return `<figure class="${escapeAttribute(className)}">
    <img src="${escapeAttribute(src)}" alt="${escapeAttribute(screenshot.id)}" />
    <figcaption>${escapeHtml(screenshot.viewport)} / ${escapeHtml(screenshot.kind)}<br />${escapeHtml(screenshot.id)}</figcaption>
  </figure>`;
}

async function renderReadableFigure(screenshot: ScreenshotManifest["screenshots"][number], label: string, marker?: number): Promise<string> {
  const src = await screenshotSrc(screenshot.absolutePath);
  return `<figure class="readable-shot ${screenshot.viewport === "mobile" ? "readable-shot--mobile" : ""}">
    <div class="shot-frame">
      ${marker ? `<span class="marker">${marker}</span>` : ""}
      <img src="${escapeAttribute(src)}" alt="${escapeAttribute(screenshot.id)}" />
    </div>
    <figcaption><strong>${escapeHtml(label)}</strong><br />${escapeHtml(screenshot.id)} / ${screenshot.pixelWidth}x${screenshot.pixelHeight}</figcaption>
  </figure>`;
}

async function renderFlowChunks(screenshot: ScreenshotManifest["screenshots"][number]): Promise<string> {
  const chunkHeight = screenshot.viewport === "mobile" ? 844 : 900;
  const displayWidth = screenshot.viewport === "mobile" ? 330 : 780;
  const imageChunks = await chunkScreenshot(screenshot, chunkHeight);
  const chunks: string[] = [];
  for (let index = 0; index < imageChunks.length; index += 1) {
    const chunk = imageChunks[index];
    const scale = displayWidth / Math.max(1, chunk.width);
    const displayHeight = Math.max(120, Math.round(chunk.height * scale));
    chunks.push(`<figure class="flow-chunk">
      <div class="flow-crop" style="width:${displayWidth}px;height:${displayHeight}px">
        <img src="${escapeAttribute(chunk.src)}" alt="${escapeAttribute(`${screenshot.id} chunk ${index + 1}`)}" style="width:${displayWidth}px" />
      </div>
      <figcaption>${escapeHtml(screenshot.id)} / segment ${index + 1} of ${imageChunks.length}</figcaption>
    </figure>`);
  }
  return chunks.join("");
}

async function chunkScreenshot(
  screenshot: ScreenshotManifest["screenshots"][number],
  chunkHeight: number
): Promise<Array<{ src: string; width: number; height: number }>> {
  try {
    const source = PNG.sync.read(await readFile(screenshot.absolutePath));
    const chunks: Array<{ src: string; width: number; height: number }> = [];
    const bytesPerRow = source.width * 4;
    for (let y = 0; y < source.height; y += chunkHeight) {
      const height = Math.min(chunkHeight, source.height - y);
      const chunk = new PNG({ width: source.width, height });
      for (let row = 0; row < height; row += 1) {
        source.data.copy(chunk.data, row * bytesPerRow, (y + row) * bytesPerRow, (y + row + 1) * bytesPerRow);
      }
      chunks.push({
        src: `data:image/png;base64,${PNG.sync.write(chunk).toString("base64")}`,
        width: source.width,
        height
      });
    }
    return chunks;
  } catch {
    return [{ src: await screenshotSrc(screenshot.absolutePath), width: screenshot.pixelWidth, height: screenshot.pixelHeight }];
  }
}

function shellHtml(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --ink:#172026; --muted:#61717b; --line:#d8e2e0; --panel:#f6faf8; --accent:#0f766e; --risk:#b42318; }
    body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:#fff; }
    main { padding:28px; }
    h1 { margin:0 0 18px; font-size:30px; }
    h2 { font-size:18px; margin:0 0 4px; }
    h3 { font-size:15px; }
    p { color:var(--muted); margin:0 0 10px; }
    .page-stack { display:grid; gap:22px; }
    .page-summary, .viewport-pair, .flow-section, .issue-sheet { border:1px solid var(--line); border-radius:8px; padding:16px; background:var(--panel); }
    .thumbs { display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:10px; }
    .overview-thumb { margin:0; border:1px solid var(--line); border-radius:8px; overflow:hidden; background:#fff; }
    .overview-thumb img { width:100%; height:220px; object-fit:cover; object-position:top; display:block; }
    .viewport-grid { display:grid; grid-template-columns:minmax(0, 1fr) 330px; gap:16px; align-items:start; }
    .viewport-grid--single { grid-template-columns:minmax(0, 1fr); }
    .readable-shot { margin:0; border:1px solid var(--line); border-radius:8px; overflow:hidden; background:#fff; }
    .readable-shot img { display:block; width:100%; height:auto; }
    .readable-shot--mobile { max-width:330px; }
    .shot-frame { position:relative; background:#fff; }
    .marker { position:absolute; z-index:2; top:12px; left:12px; width:34px; height:34px; border-radius:50%; display:grid; place-items:center; background:var(--risk); color:#fff; font-weight:800; border:2px solid #fff; }
    figcaption { padding:9px 11px; color:var(--muted); font-size:12px; }
    .flow-layout { display:grid; gap:18px; }
    .flow-chunks { display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:14px; align-items:start; }
    .flow-chunk { margin:0; border:1px solid var(--line); border-radius:8px; background:#fff; overflow:hidden; }
    .flow-crop { overflow:hidden; background:#fff; background-repeat:no-repeat; }
    .flow-crop img { display:block; transform-origin:top left; }
    .issue-sheet { display:grid; grid-template-columns:360px minmax(0,1fr); gap:18px; align-items:start; }
    .issue-legend { position:sticky; top:16px; }
    .severity { display:inline-block; border-radius:999px; padding:4px 10px; background:#fff0ec; color:var(--risk); font-weight:800; font-size:12px; }
    .issue-shots { display:grid; gap:14px; }
    ol { padding-left:22px; }
  </style>
</head>
<body><main><h1>${escapeHtml(title)}</h1>${body}</main></body>
</html>`;
}

function screenshotRefsForIssue(manifest: ScreenshotManifest, refs: string[]): ScreenshotManifest["screenshots"] {
  const index = new Map<string, ScreenshotManifest["screenshots"][number]>();
  for (const screenshot of manifest.screenshots) {
    index.set(screenshot.id, screenshot);
    index.set(screenshot.path, screenshot);
  }
  const seen = new Set<string>();
  return refs.flatMap((ref) => {
    const screenshot = index.get(ref);
    if (!screenshot || seen.has(screenshot.id)) return [];
    seen.add(screenshot.id);
    return [screenshot];
  });
}

function sheet(
  id: string,
  type: ReviewPackSheet["type"],
  title: string,
  reportRoot: string,
  absolutePath: string,
  screenshotIds: string[],
  pageId?: string,
  issueId?: string
): ReviewPackSheet {
  return {
    id,
    type,
    title,
    path: toPosix(path.relative(reportRoot, absolutePath)),
    absolutePath,
    screenshotIds,
    pageId,
    issueId
  };
}

function applySheetRefs(manifest: ScreenshotManifest, sheets: ReviewPackSheet[]): void {
  const byScreenshot = new Map(manifest.screenshots.map((screenshot) => [screenshot.id, screenshot]));
  for (const screenshot of manifest.screenshots) {
    screenshot.sheetRefs = [];
  }
  for (const sheet of sheets) {
    for (const screenshotId of sheet.screenshotIds) {
      const screenshot = byScreenshot.get(screenshotId);
      if (!screenshot || screenshot.sheetRefs.includes(sheet.path)) continue;
      screenshot.sheetRefs.push(sheet.path);
      if (sheet.issueId && !screenshot.groups.includes(`issue:${sheet.issueId}`)) {
        screenshot.groups.push(`issue:${sheet.issueId}`);
      }
    }
  }
}

function buildReviewPackManifest(
  report: AuditReport,
  paths: AuditPaths,
  manifest: ScreenshotManifest,
  sheets: ReviewPackSheet[],
  galleryPath: string
): ReviewPackManifest {
  const byType = (type: ReviewPackSheet["type"]) => sheets.filter((sheet) => sheet.type === type).map((sheet) => sheet.path);
  return {
    schemaVersion: "design-review-workflow.review-pack.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    gallery: {
      path: toPosix(path.relative(paths.report, galleryPath)),
      absolutePath: galleryPath
    },
    evidenceBrief: {
      path: "evidence-brief.json",
      absolutePath: path.join(paths.report, "evidence-brief.json")
    },
    recommendedReviewOrder: [
      { step: "first_viewports", title: "Review first viewports before detailed flows.", paths: byType("first_viewports") },
      { step: "issue_evidence", title: "Review grouped issue evidence sheets.", paths: byType("issue_evidence") },
      { step: "page_flows", title: "Review full page flows split into readable chunks.", paths: byType("page_flow") },
      { step: "raw_screenshots", title: "Use raw screenshots for any disputed evidence.", paths: manifest.screenshots.map((screenshot) => screenshot.path) }
    ],
    sheets,
    statistics: {
      pages: report.pages.length,
      screenshots: manifest.screenshots.length,
      firstViewportSheets: sheets.filter((sheet) => sheet.type === "first_viewports" || sheet.type === "page_first_viewports").length,
      pageFlowSheets: sheets.filter((sheet) => sheet.type === "page_flow").length,
      issueSheets: sheets.filter((sheet) => sheet.type === "issue_evidence").length
    }
  };
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

async function screenshotSrc(filePath: string): Promise<string> {
  try {
    const data = await readFile(filePath);
    return `data:image/png;base64,${data.toString("base64")}`;
  } catch {
    return pathToFileURL(filePath).href;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
