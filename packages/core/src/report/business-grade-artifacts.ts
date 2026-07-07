import { access, copyFile, cp } from "node:fs/promises";
import * as path from "node:path";
import { AuditReport, GroupedIssue } from "../schemas/audit.js";
import { AuditPaths } from "../storage/project.js";
import { ensureDir, writeJson, writeText } from "../utils/fs.js";
import { evaluateBusinessGradeGate } from "../review/business-grade.js";
import { writeScreenshotManifest } from "./screenshot-manifest.js";
import { buildReviewPack } from "./review-pack.js";

export type BusinessGradeArtifactOptions = {
  buildReviewPack?: boolean;
  preserveReviewPackManifest?: boolean;
};

export async function writeBusinessGradeArtifacts(report: AuditReport, paths: AuditPaths, options: BusinessGradeArtifactOptions = {}): Promise<void> {
  await writeJson(path.join(paths.report, "grouped-issues.json"), report.groupedIssues);
  await writeJson(path.join(paths.report, "business-grade-gate.json"), evaluateBusinessGradeGate(report));
  if (options.buildReviewPack) {
    await buildReviewPack(paths.auditRoot);
  } else if (!options.preserveReviewPackManifest || !(await hasReviewPackManifest(paths))) {
    await writeScreenshotManifest(report, paths);
  }
  await writeAuditRootIndex(report, paths);
  await writeHostedReport(report, paths);
}

async function hasReviewPackManifest(paths: AuditPaths): Promise<boolean> {
  return access(path.join(paths.report, "agent-review-pack", "review-pack-manifest.json")).then(
    () => true,
    () => false
  );
}

async function writeAuditRootIndex(report: AuditReport, paths: AuditPaths): Promise<void> {
  const screenshotAssetMap = new Map<string, string>();
  for (const page of report.pages) {
    for (const screenshot of Object.values(page.screenshots)) {
      screenshotAssetMap.set(screenshot.id, screenshot.path);
      screenshotAssetMap.set(screenshot.path, screenshot.path);
    }
  }
  for (const annotation of report.screenshotAnnotations) {
    screenshotAssetMap.set(annotation.annotatedScreenshot.id, annotation.annotatedScreenshot.path);
    screenshotAssetMap.set(annotation.annotatedScreenshot.path, annotation.annotatedScreenshot.path);
  }

  const issueSheetAssetMap = new Map<string, string>();
  for (const issue of report.groupedIssues) {
    issueSheetAssetMap.set(issue.issueId, path.join("report", "contact-sheets", "issues", `${issue.issueId}.png`).replace(/\\/g, "/"));
  }
  const optionalArtifacts = await availableArtifacts([
    ["report/agent-visual-review.json", path.join(paths.report, "agent-visual-review.json")],
    ["export-manifest.json", path.join(paths.auditRoot, "export-manifest.json")],
    ["checksums.sha256", path.join(paths.auditRoot, "checksums.sha256")]
  ]);

  await writeText(
    path.join(paths.auditRoot, "index.html"),
    renderStaticDashboard(report, {
      reportBase: "report/",
      auditBase: "",
      contactSheetBase: "report/contact-sheets/",
      screenshotAssetMap,
      issueSheetAssetMap,
      canonicalEntrypoint: "index.html",
      hostedReport: "report/hosted/index.html",
      optionalArtifacts
    })
  );
}

async function writeHostedReport(report: AuditReport, paths: AuditPaths): Promise<void> {
  const hostedRoot = path.join(paths.report, "hosted");
  const assetRoot = path.join(hostedRoot, "assets");
  await ensureDir(assetRoot);

  const screenshotAssetMap = new Map<string, string>();
  const issueSheetAssetMap = new Map<string, string>();
  for (const page of report.pages) {
    for (const screenshot of Object.values(page.screenshots)) {
      const source = path.join(paths.auditRoot, screenshot.path);
      const targetRelative = path.join("assets", screenshot.path).replace(/\\/g, "/");
      const target = path.join(hostedRoot, targetRelative);
      await ensureDir(path.dirname(target));
      await copyFile(source, target).catch(() => undefined);
      screenshotAssetMap.set(screenshot.id, targetRelative);
      screenshotAssetMap.set(screenshot.path, targetRelative);
    }
  }
  for (const annotation of report.screenshotAnnotations) {
    const source = path.join(paths.auditRoot, annotation.annotatedScreenshot.path);
    const targetRelative = path.join("assets", annotation.annotatedScreenshot.path).replace(/\\/g, "/");
    const target = path.join(hostedRoot, targetRelative);
    await ensureDir(path.dirname(target));
    await copyFile(source, target).catch(() => undefined);
    screenshotAssetMap.set(annotation.annotatedScreenshot.id, targetRelative);
    screenshotAssetMap.set(annotation.annotatedScreenshot.path, targetRelative);
  }

  const contactSheetsRoot = path.join(paths.report, "contact-sheets");
  const hostedContactSheetsRoot = path.join(assetRoot, "contact-sheets");
  await cp(contactSheetsRoot, hostedContactSheetsRoot, { recursive: true, force: true }).catch(() => undefined);
  for (const issue of report.groupedIssues) {
    const source = path.join(contactSheetsRoot, "issues", `${issue.issueId}.png`);
    await access(source)
      .then(() => issueSheetAssetMap.set(issue.issueId, path.join("assets", "contact-sheets", "issues", `${issue.issueId}.png`).replace(/\\/g, "/")))
      .catch(() => undefined);
  }
  const optionalArtifacts = await availableArtifacts([
    ["../agent-visual-review.json", path.join(paths.report, "agent-visual-review.json")],
    ["../../export-manifest.json", path.join(paths.auditRoot, "export-manifest.json")],
    ["../../checksums.sha256", path.join(paths.auditRoot, "checksums.sha256")]
  ]);

  await writeText(
    path.join(hostedRoot, "index.html"),
    renderStaticDashboard(report, {
      reportBase: "../",
      auditBase: "../../",
      contactSheetBase: "assets/contact-sheets/",
      screenshotAssetMap,
      issueSheetAssetMap,
      canonicalEntrypoint: "../../index.html",
      hostedReport: "index.html",
      optionalArtifacts
    })
  );
}

async function availableArtifacts(entries: Array<[string, string]>): Promise<Set<string>> {
  const available = new Set<string>();
  await Promise.all(
    entries.map(async ([href, absolutePath]) => {
      await access(absolutePath)
        .then(() => available.add(href))
        .catch(() => undefined);
    })
  );
  return available;
}

type DashboardRenderOptions = {
  reportBase: string;
  auditBase: string;
  contactSheetBase: string;
  screenshotAssetMap: Map<string, string>;
  issueSheetAssetMap: Map<string, string>;
  canonicalEntrypoint: string;
  hostedReport: string;
  optionalArtifacts: Set<string>;
};

function renderStaticDashboard(report: AuditReport, options: DashboardRenderOptions): string {
  const hostname = new URL(report.config.url).hostname;
  const groupedIssues = report.groupedIssues.map((issue, index) => renderIssue(issue, index + 1, options)).join("");
  const designVerdict = renderDesignVerdict(report, options);
  const pageSections = report.pages.map((page, index) => renderPageEvidence(page, index + 1, options)).join("");
  const agentReview = renderAgentReview(report, options);
  const scoreCards = Object.entries(report.scorecard.subscores)
    .sort(([, a], [, b]) => b.score - a.score)
    .map(([key, item]) => renderScoreCard(label(key), item.score, item.confidence))
    .join("");
  const artifacts = renderArtifactLinks(options);
  const screenshotStats = screenshotStatsFor(report);
  const screenshotCount = screenshotStats.total;
  const reviewedScreenshotCount = report.agentVisualReview?.screenshotsReviewed.length ?? 0;
  const reviewedPageCount = report.agentVisualReview?.pageReviews.length ?? 0;
  const topAction = report.agentVisualReview?.redesignActions[0];
  const firstViewportSheet = `${options.contactSheetBase}first-viewports.png`;
  const allPagesSheet = `${options.contactSheetBase}all-pages.png`;
  const galleryHref = `${options.reportBase}agent-review-pack/gallery/index.html`;
  const reportStatusClass = report.businessGradeStatus === "business_grade" ? "status-pill--pass" : "status-pill--warn";
  const qualityLine =
    report.businessGradeStatus === "business_grade"
      ? "Imported visual judgment is present. The report can make design-quality statements."
      : "Automated evidence is present. Visual judgment is still blocked until agent review import.";
  const topActionText = topAction
    ? `${topAction.title}: ${topAction.recommendation}`
    : "No imported redesign action yet. Generate and import a strict visual review to unlock business-grade recommendations.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Website Design Review - ${escapeHtml(hostname)}</title>
  <style>
    :root { color-scheme: light; --ink:#17212b; --muted:#667684; --quiet:#8b98a5; --line:#d9e2ea; --line-strong:#b9c7d4; --paper:#fbfcfd; --surface:#ffffff; --surface-soft:#f2f6f8; --nav:#111a23; --blue:#255edb; --teal:#087f7a; --green:#16803c; --amber:#b45c16; --red:#b42318; --shadow:0 22px 70px rgba(23,33,43,.09); }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:var(--paper); line-height:1.55; }
    a { color:var(--blue); }
    .report-shell { display:grid; grid-template-columns:260px minmax(0,1fr); min-height:100vh; }
    .report-rail { position:sticky; top:0; height:100vh; padding:28px 20px; background:var(--nav); color:white; overflow:auto; }
    .report-rail p { color:#b8c2cc; }
    .rail-brand { display:grid; gap:10px; margin-bottom:28px; }
    .rail-mark { width:42px; height:42px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.18); border-radius:8px; background:rgba(255,255,255,.08); font-weight:900; }
    .rail-nav { display:grid; gap:6px; margin-top:20px; }
    .rail-nav a { color:#d8e1eb; text-decoration:none; padding:8px 10px; border-radius:8px; }
    .rail-nav a:hover { background:rgba(255,255,255,.08); color:white; }
    main { max-width:1280px; width:100%; margin:0 auto; padding:32px 28px 80px; }
    .hero { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(330px,.8fr); gap:18px; align-items:stretch; margin-bottom:18px; }
    .hero-copy, .score-panel, .report-section, .decision-card, .issue, .page, .score-card, .review-card, .artifact-panel { border:1px solid var(--line); border-radius:8px; background:var(--surface); box-shadow:var(--shadow); }
    .hero-copy { padding:28px; display:grid; align-content:space-between; gap:22px; min-height:330px; }
    .score-panel { padding:22px; display:grid; align-content:space-between; gap:18px; }
    h1, h2, h3 { letter-spacing:0; line-height:1.15; }
    h1 { font-size:44px; margin:0 0 12px; max-width:780px; }
    h2 { margin:0 0 14px; font-size:25px; }
    h3 { font-size:18px; margin:0 0 8px; }
    p { color:var(--muted); margin-top:0; }
    .eyebrow { margin:0 0 10px; color:var(--teal); font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; }
    .url-line { color:var(--ink); font-weight:800; overflow-wrap:anywhere; }
    .meta-line { display:flex; flex-wrap:wrap; gap:8px; margin-top:18px; }
    .status-pill, .meta-chip, .priority-chip { display:inline-flex; min-height:30px; align-items:center; border-radius:999px; padding:5px 10px; font-size:12px; font-weight:850; border:1px solid var(--line); background:white; color:var(--ink); }
    .status-pill--pass { border-color:#b8dfc5; background:#ebf8ef; color:var(--green); }
    .status-pill--warn { border-color:#f1cf9d; background:#fff7e8; color:var(--amber); }
    .priority-chip--critical, .priority-chip--high { background:#fff0ed; border-color:#f1b8af; color:var(--red); }
    .priority-chip--medium { background:#fff7e8; border-color:#f1cf9d; color:var(--amber); }
    .priority-chip--low { background:#edf7f2; border-color:#c5e6d2; color:var(--green); }
    .score-hero { display:flex; gap:18px; align-items:center; }
    .score-ring { --ring:var(--blue); --score:0; position:relative; width:108px; height:108px; display:grid; place-items:center; border-radius:999px; background:conic-gradient(var(--ring) calc(var(--score) * 1%), #e3e9ef 0); flex:0 0 auto; }
    .score-ring:after { content:""; position:absolute; inset:12px; border-radius:inherit; background:white; box-shadow:inset 0 0 0 1px var(--line); }
    .score-ring strong { position:relative; z-index:1; font-size:30px; }
    .score-ring--strong { --ring:var(--green); }
    .score-ring--mixed { --ring:var(--amber); }
    .score-ring--risk { --ring:var(--red); }
    .metric-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
    .metric { border-top:1px solid var(--line); padding-top:10px; }
    .metric span { display:block; color:var(--quiet); font-size:12px; font-weight:800; text-transform:uppercase; }
    .metric strong { display:block; color:var(--ink); font-size:24px; }
    .decision-grid { display:grid; grid-template-columns:1.05fr .95fr; gap:18px; margin:18px 0; align-items:start; }
    .decision-card { padding:22px; }
    .decision-card--evidence { overflow:hidden; padding:0; }
    .decision-card__body { padding:20px; }
    .evidence-frame { border-bottom:1px solid var(--line); background:var(--surface-soft); }
    .evidence-frame img { width:100%; max-height:360px; object-fit:contain; background:#eef3f6; }
    .section-header { display:flex; justify-content:space-between; gap:16px; align-items:end; margin:34px 0 12px; }
    .section-header p { max-width:720px; margin-bottom:0; }
    .report-section { padding:22px; margin-bottom:18px; }
    .verdict-layout { display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:18px; }
    .verdict-copy { display:grid; gap:14px; }
    .verdict-copy article, .side-panel, .action-card, .issue, .page, .review-card { border:1px solid var(--line); border-radius:8px; background:white; padding:16px; }
    .side-panel { display:grid; gap:14px; align-content:start; background:var(--surface-soft); }
    .list-clean { margin:0; padding-left:18px; color:var(--muted); }
    .list-clean li + li { margin-top:8px; }
    .action-list { display:grid; gap:12px; }
    .action-card__meta, .issue__meta { display:flex; flex-wrap:wrap; gap:8px; margin:8px 0 12px; }
    .score-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(245px,1fr)); gap:12px; }
    .score-card { display:grid; grid-template-columns:72px minmax(0,1fr); gap:12px; align-items:center; padding:14px; box-shadow:none; }
    .score-card .score-ring { width:68px; height:68px; }
    .score-card .score-ring strong { font-size:20px; }
    .score-card .score-ring:after { inset:8px; }
    .score-bar { height:8px; border-radius:999px; background:#e3e9ef; overflow:hidden; margin-top:10px; }
    .score-bar span { display:block; height:100%; width:calc(var(--score) * 1%); background:var(--ring); border-radius:inherit; }
    .issue-list, .page-list, .review-list { display:grid; gap:14px; }
    .issue__header, .page__header, .review-card__header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
    .link-row, .artifact-grid { display:flex; flex-wrap:wrap; gap:8px; }
    .sheet-link { display:inline-flex; min-height:34px; align-items:center; border:1px solid var(--line); border-radius:8px; padding:6px 10px; background:white; color:var(--blue); font-weight:850; text-decoration:none; }
    .sheet-link:hover { border-color:var(--line-strong); background:#f7fafc; }
    .sheet-link--pending { color:#667384; background:#f7f9fb; font-weight:700; }
    details { margin-top:12px; border-top:1px solid var(--line); padding-top:12px; }
    summary { cursor:pointer; color:var(--blue); font-weight:850; }
    .shots { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:12px; margin-top:12px; }
    figure { margin:0; border:1px solid var(--line); border-radius:8px; overflow:hidden; background:white; }
    img { display:block; width:100%; max-height:360px; object-fit:cover; object-position:top; }
    figcaption { padding:8px 10px; color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
    .review-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:10px; }
    .review-note { border-left:3px solid var(--teal); padding:8px 10px; background:var(--surface-soft); border-radius:0 8px 8px 0; }
    .artifact-panel { padding:18px; box-shadow:none; }
    .artifact-grid { margin-top:12px; }
    code { white-space:pre-wrap; overflow-wrap:anywhere; }
    .muted { color:var(--muted); }
    .empty-state { border:1px dashed var(--line-strong); border-radius:8px; padding:18px; color:var(--muted); background:var(--surface-soft); }
    @media (max-width:1040px) { .report-shell { grid-template-columns:1fr; } .report-rail { position:relative; height:auto; } .rail-nav { grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); } .hero, .decision-grid, .verdict-layout { grid-template-columns:1fr; } }
    @media (max-width:700px) { main { padding:16px; } h1 { font-size:34px; } .hero-copy, .score-panel, .report-section, .decision-card { padding:18px; } .issue__header, .page__header, .review-card__header, .score-card { display:grid; grid-template-columns:1fr; } .metric-grid { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <div class="report-shell">
    <aside class="report-rail" aria-label="Report navigation">
      <div class="rail-brand">
        <div class="rail-mark">DR</div>
        <div>
          <strong>Website Design Review</strong>
          <p>${escapeHtml(hostname)}</p>
        </div>
      </div>
      <span class="status-pill ${reportStatusClass}">${escapeHtml(businessGradeLabel(report.businessGradeStatus))}</span>
      <nav class="rail-nav">
        <a href="#overview">Overview</a>
        <a href="#verdict">Design Verdict</a>
        <a href="#actions">Redesign Actions</a>
        <a href="#scores">Scores</a>
        <a href="#issues">Issues</a>
        <a href="#evidence">Evidence</a>
        <a href="#handoff">Agent Handoff</a>
      </nav>
    </aside>
    <main>
      <section class="hero" id="overview">
        <div class="hero-copy">
          <div>
            <p class="eyebrow">Business-grade Website Design Review</p>
            <h1>${escapeHtml(hostname)}</h1>
            <p class="url-line">${escapeHtml(report.config.url)}</p>
            <p>${escapeHtml(qualityLine)}</p>
          </div>
          <div class="meta-line">
            <span class="status-pill ${reportStatusClass}">${escapeHtml(businessGradeLabel(report.businessGradeStatus))}</span>
            <span class="meta-chip">${escapeHtml(report.websiteType)} site</span>
            <span class="meta-chip">${escapeHtml(report.websiteTypeConfidence)} type confidence</span>
            <span class="meta-chip">Generated ${escapeHtml(formatDate(report.generatedAt))}</span>
          </div>
        </div>
        <div class="score-panel">
          <div class="score-hero">
            ${renderScoreRing(report.scorecard.overallScore)}
            <div>
              <h2>Overall Score</h2>
              <p>${escapeHtml(scoreContext(report))}</p>
            </div>
          </div>
          <div class="metric-grid">
            ${renderMetric("Pages", String(report.pages.length))}
            ${renderMetric("Raw captures", String(screenshotCount))}
            ${renderMetric("Visual reviewed", `${reviewedScreenshotCount}/${screenshotCount}`)}
            ${renderMetric("Grouped Issues", String(report.groupedIssues.length))}
          </div>
        </div>
      </section>

      <section class="decision-grid">
        <article class="decision-card">
          <p class="eyebrow">Top Decision Signal</p>
          <h2>${escapeHtml(report.agentVisualReview ? label(report.agentVisualReview.designVerdict.readiness) : "Visual Review Required")}</h2>
          <p>${escapeHtml(report.agentVisualReview?.designVerdict.redesignDirection ?? "Automated rules have packaged the evidence, but a multimodal agent must inspect screenshots before this audit can make style, taste, or redesign claims.")}</p>
          <p><strong>Highest-priority action:</strong> ${escapeHtml(topActionText)}</p>
        </article>
        <article class="decision-card decision-card--evidence">
          <div class="evidence-frame">
            <a href="${escapeAttribute(firstViewportSheet)}"><img src="${escapeAttribute(firstViewportSheet)}" alt="First viewport contact sheet" loading="eager" /></a>
          </div>
          <div class="decision-card__body">
            <h2>Evidence Preview</h2>
            <p>This preview shows ${formatCount(screenshotStats.firstViewport, "first-viewport capture")}. The audit captured ${formatCount(screenshotCount, "raw screenshot")}: ${captureSummary(screenshotStats)}.</p>
            <div class="link-row">
              ${renderLink(firstViewportSheet, "Open first viewports")}
              ${renderLink(allPagesSheet, "Open all screenshot index")}
              ${renderLink(galleryHref, "Open review gallery")}
            </div>
          </div>
        </article>
      </section>

      ${designVerdict}

      <section class="report-section" id="actions">
        <div class="section-header">
          <div>
            <p class="eyebrow">Prioritized redesign work</p>
            <h2>Actions</h2>
          </div>
          <p>${report.agentVisualReview ? `${report.agentVisualReview.redesignActions.length} action(s) imported from visual review.` : "Pending until visual review import."}</p>
        </div>
        ${renderRedesignActions(report, options)}
      </section>

      <section class="report-section" id="scores">
        <div class="section-header">
          <div>
            <p class="eyebrow">Scorecard</p>
            <h2>Category Scoring</h2>
          </div>
          <p>Scores are capped until strict visual review is imported. Rings show category health; confidence remains separate from score.</p>
        </div>
        <div class="score-grid">${scoreCards}</div>
      </section>

      <section class="report-section" id="issues">
        <div class="section-header">
          <div>
            <p class="eyebrow">Root-cause issue groups</p>
            <h2>Grouped Issues</h2>
          </div>
          <p>${report.groupedIssues.length} grouped issue(s), ${report.findings.length} source finding(s).</p>
        </div>
        <div class="issue-list">${groupedIssues || '<div class="empty-state">Automated rules found no deterministic blockers. This is not a design-quality verdict until strict multimodal visual review is imported.</div>'}</div>
      </section>

      ${agentReview}

      <section class="report-section" id="evidence">
        <div class="section-header">
          <div>
            <p class="eyebrow">Captured visual evidence</p>
            <h2>Pages And Screenshots</h2>
          </div>
          <p>${reviewedPageCount}/${report.pages.length} page(s) reviewed by the imported visual artifact.</p>
        </div>
        <div class="page-list">${pageSections}</div>
      </section>

      <section class="artifact-panel" id="handoff">
        <div class="section-header">
          <div>
            <p class="eyebrow">Agent handoff</p>
            <h2>Files And Commands</h2>
          </div>
          <p>The static dashboard is the primary deliverable. The local app is optional convenience tooling.</p>
        </div>
        <details>
          <summary>Show generated files and agent commands</summary>
          <div class="artifact-grid">${artifacts}</div>
          <p><strong>Business-grade import:</strong> <code>node apps/cli/dist/index.js agent-review import --report &lt;audit-dir&gt; --file agent-runs/&lt;agent&gt;/visual-review.json && node apps/cli/dist/index.js business-grade lint --report &lt;audit-dir&gt;</code></p>
          <p><strong>Refresh review pack:</strong> <code>node apps/cli/dist/index.js review-pack build --report &lt;audit-dir&gt;</code></p>
        </details>
      </section>
    </main>
  </div>
</body>
</html>`;
}

function renderDesignVerdict(report: AuditReport, options: DashboardRenderOptions): string {
  if (!report.agentVisualReview || report.businessGradeStatus !== "business_grade") {
    return `<section class="report-section" id="verdict">
      <div class="section-header">
        <div>
          <p class="eyebrow">Design verdict</p>
          <h2>Visual Review Required</h2>
        </div>
        <span class="status-pill status-pill--warn">Blocked</span>
      </div>
      <div class="empty-state">
        <p><strong>Automated rules found deterministic signals only.</strong> This report cannot provide a style/taste verdict or redesign opinion until the running multimodal agent reviews screenshots and imports a strict artifact.</p>
        <p>Inspect the review gallery/contact sheets, write <code>agent-runs/&lt;agent&gt;/visual-review.json</code>, validate it, import it, and pass <code>business-grade lint</code>.</p>
      </div>
    </section>`;
  }
  const verdict = report.agentVisualReview.designVerdict;
  return `<section class="report-section" id="verdict">
      <div class="section-header">
        <div>
          <p class="eyebrow">Design Verdict</p>
          <h2>Design Verdict</h2>
        </div>
      <span class="status-pill status-pill--pass">${escapeHtml(label(verdict.readiness))} / ${escapeHtml(verdict.confidence)} confidence</span>
      </div>
      <div class="verdict-layout">
        <div class="verdict-copy">
        <article>
          <h3>Readiness</h3>
          <p>${escapeHtml(label(verdict.readiness))}</p>
        </article>
        <article>
          <h3>Readiness Rationale</h3>
          <p>${escapeHtml(verdict.rationale)}</p>
        </article>
        <article>
          <h3>Style And Taste</h3>
          <p>${escapeHtml(verdict.styleAndTaste)}</p>
        </article>
        <article>
          <h3>Messaging And Copy</h3>
          <p>${escapeHtml(verdict.messagingAndCopy)}</p>
        </article>
        <article>
          <h3>Redesign Direction</h3>
          <p>${escapeHtml(verdict.redesignDirection)}</p>
        </article>
        <article>
          <h3>Audience And Brand Fit</h3>
          <p><strong>Audience:</strong> ${escapeHtml(verdict.audienceFit)}</p>
          <p><strong>Brand:</strong> ${escapeHtml(verdict.brandFit)}</p>
        </article>
      </div>
      <aside class="side-panel">
        <div>
          <h3>Strongest Qualities</h3>
          ${renderTextList(verdict.strongestDesignQualities)}
        </div>
        <div>
          <h3>Weakest Risks</h3>
          ${renderTextList(verdict.weakestDesignRisks)}
        </div>
        <div>
          <h3>Limitations</h3>
          ${renderTextList(verdict.limitations)}
        </div>
      </aside>
    </div>
  </section>`;
}

function renderRedesignActions(report: AuditReport, options: DashboardRenderOptions): string {
  const actions = report.agentVisualReview?.redesignActions ?? [];
  if (actions.length === 0) {
    return `<div class="empty-state">No imported redesign actions yet. Automated reports may contain deterministic findings, but design recommendations require visual review.</div>`;
  }
  return `<div class="action-list">${actions
    .map((action, index) => {
      const screenshots = action.evidenceRefs.map((ref) => renderScreenshot(ref, options.screenshotAssetMap.get(ref), ref)).join("");
      return `<article class="action-card">
        <div class="issue__header">
          <div>
            <p class="eyebrow">Action ${index + 1}</p>
            <h3>${escapeHtml(action.title)}</h3>
          </div>
          <span class="priority-chip priority-chip--${escapeAttribute(action.priority)}">${escapeHtml(action.priority)} priority</span>
        </div>
        <div class="action-card__meta">
          <span class="meta-chip">${escapeHtml(action.effort)} effort</span>
          <span class="meta-chip">${escapeHtml(action.confidence)} confidence</span>
          <span class="meta-chip">${action.affectedPages.length} affected page(s)</span>
        </div>
        <p><strong>Recommendation:</strong> ${escapeHtml(action.recommendation)}</p>
        <p><strong>Expected impact:</strong> ${escapeHtml(action.expectedImpact)}</p>
        <details><summary>Acceptance criteria</summary>${renderTextList(action.acceptanceCriteria)}</details>
        <details><summary>Evidence screenshots (${action.evidenceRefs.length})</summary><div class="shots">${screenshots}</div></details>
      </article>`;
    })
    .join("")}</div>`;
}

function renderIssue(issue: GroupedIssue, index: number, options: DashboardRenderOptions): string {
  const screenshots = issue.evidenceRefs.map((ref) => renderScreenshot(ref, options.screenshotAssetMap.get(ref), ref)).join("");
  const issueSheetSrc = options.issueSheetAssetMap.get(issue.issueId);
  const issueSheetLink = issueSheetSrc ? `<p><a class="sheet-link" href="${escapeAttribute(issueSheetSrc)}">Open issue evidence sheet</a></p>` : "";
  return `<article class="issue">
    <div class="issue__header"><div><p class="eyebrow">Issue ${index}</p><h3>${escapeHtml(issue.title)}</h3>
    <div class="issue__meta"><span class="priority-chip priority-chip--${escapeAttribute(issue.severity)}">${escapeHtml(issue.severity)}</span><span class="meta-chip">${escapeHtml(issue.category)}</span><span class="meta-chip">priority ${issue.priorityScore}</span></div></div>${issueSheetLink}</div>
    <p><strong>Affected pages:</strong> ${issue.affectedPages.map((page) => escapeHtml(page.url)).join(", ")}</p>
    <p><strong>Observation:</strong> ${escapeHtml(issue.observation)}</p>
    <p><strong>Recommendation:</strong> ${escapeHtml(issue.recommendation)}</p>
    ${renderTextList(issue.acceptanceCriteria)}
    <details><summary>Evidence screenshots (${issue.evidenceRefs.length})</summary><div class="shots">${screenshots}</div></details>
  </article>`;
}

function renderAgentReview(report: AuditReport, options: DashboardRenderOptions): string {
  if (!report.agentVisualReview) {
    return `<section class="report-section" id="agent-review">
      <div class="section-header">
        <div>
          <p class="eyebrow">Multimodal review lane</p>
          <h2>Agent Visual Review</h2>
        </div>
        <span class="status-pill status-pill--warn">Not imported</span>
      </div>
      <div class="empty-state">This audit is still in automated or pending mode. A running multimodal agent must inspect the screenshot pack and import a strict visual review before business-grade claims are allowed.</div>
    </section>`;
  }

  return `<section class="report-section" id="agent-review">
    <div class="section-header">
      <div>
        <p class="eyebrow">Multimodal review lane</p>
        <h2>Agent Visual Review</h2>
      </div>
      <p>Reviewer: ${escapeHtml(report.agentVisualReview.reviewer)} / ${escapeHtml(report.agentVisualReview.confidence)} confidence</p>
    </div>
    <div class="review-list">${report.agentVisualReview.pageReviews
      .map((review, index) => {
        const screenshots = review.screenshotsReviewed.map((ref) => renderScreenshot(ref, options.screenshotAssetMap.get(ref), ref)).join("");
        return `<article class="review-card">
          <div class="review-card__header">
            <div>
              <p class="eyebrow">Page review ${index + 1}</p>
              <h3>${escapeHtml(review.url)}</h3>
            </div>
            <span class="meta-chip">${review.screenshotsReviewed.length} screenshots reviewed</span>
          </div>
          <div class="review-grid">
            ${renderReviewNote("First viewport", review.firstViewport)}
            ${renderReviewNote("Hierarchy", review.hierarchy)}
            ${renderReviewNote("Composition", review.composition)}
            ${renderReviewNote("CTA clarity", review.ctaClarity)}
            ${renderReviewNote("Messaging/copy", review.messagingAndCopy)}
            ${renderReviewNote("Mobile feel", review.mobile)}
            ${renderReviewNote("Trust/proof", review.trustAndProof)}
            ${renderReviewNote("Visual system", review.visualSystemCoherence)}
            ${renderReviewNote("Accessibility basics", review.accessibilityBasics)}
            ${renderReviewNote("Style/taste", review.styleAndTaste)}
            ${renderReviewNote("Redesign advice", review.redesignAdvice)}
          </div>
          <details><summary>Reviewed screenshots</summary><div class="shots">${screenshots}</div></details>
        </article>`;
      })
      .join("")}</div>
  </section>`;
}

function renderPageEvidence(page: AuditReport["pages"][number], index: number, options: DashboardRenderOptions): string {
  const screenshots = Object.values(page.screenshots)
    .map((screenshot) => renderScreenshot(screenshot.id, options.screenshotAssetMap.get(screenshot.id), `${screenshot.viewport} ${screenshot.kind}`))
    .join("");
  const firstViewport = `${options.contactSheetBase}pages/${page.pageId}-first-viewports.png`;
  const flow = `${options.contactSheetBase}pages/${page.pageId}-flow.png`;
  return `<article class="page">
    <div class="page__header">
      <div>
        <p class="eyebrow">Captured page ${index}</p>
        <h3>${escapeHtml(page.title ?? page.url)}</h3>
        <p>${escapeHtml(page.pageType)} / ${escapeHtml(page.businessImportance)} / <a href="${escapeAttribute(page.url)}">${escapeHtml(page.url)}</a></p>
      </div>
      <div class="link-row">
        ${renderLink(firstViewport, "First viewport sheet")}
        ${renderLink(flow, "Page flow sheet")}
      </div>
    </div>
    <details><summary>Raw screenshots (${Object.keys(page.screenshots).length})</summary><div class="shots">${screenshots}</div></details>
  </article>`;
}

function renderArtifactLinks(options: DashboardRenderOptions): string {
  return [
    { href: options.canonicalEntrypoint, text: "Canonical index" },
    { href: options.hostedReport, text: "Static hosted report" },
    { href: `${options.reportBase}report.html`, text: "Full HTML report" },
    { href: `${options.reportBase}report.md`, text: "Markdown report" },
    { href: `${options.reportBase}report.json`, text: "Report JSON" },
    { href: `${options.reportBase}workflow-manifest.json`, text: "Workflow manifest" },
    { href: `${options.reportBase}handoff.json`, text: "Agent handoff JSON" },
    { href: `${options.reportBase}agent-execution-plan.md`, text: "Agent execution plan" },
    { href: `${options.reportBase}evidence-brief.json`, text: "Evidence brief" },
    { href: `${options.reportBase}grouped-issues.json`, text: "Grouped issues JSON" },
    { href: `${options.reportBase}business-grade-gate.json`, text: "Business-grade gate" },
    { href: `${options.reportBase}validation.json`, text: "Validation JSON" },
    { href: `${options.reportBase}quality-gate.json`, text: "Quality gate" },
    { href: `${options.reportBase}screenshot-manifest.json`, text: "Screenshot manifest" },
    { href: `${options.reportBase}implementation-plan.json`, text: "Implementation plan" },
    { href: `${options.reportBase}source-candidates.json`, text: "Source candidates" },
    { href: `${options.reportBase}patch-plan.md`, text: "Patch plan" },
    { href: `${options.reportBase}agent-review-pack/review-pack-manifest.json`, text: "Review pack manifest" },
    { href: `${options.reportBase}agent-review-pack/gallery/index.html`, text: "Review gallery" },
    { href: `${options.contactSheetBase}first-viewports.png`, text: "First viewports sheet" },
    { href: `${options.contactSheetBase}all-pages.png`, text: "All pages sheet" },
    { href: `${options.reportBase}agent-visual-review.json`, text: "Imported agent visual review", optional: true },
    { href: `${options.auditBase}export-manifest.json`, text: "Export manifest", optional: true },
    { href: `${options.auditBase}checksums.sha256`, text: "Checksums", optional: true }
  ]
    .map((artifact) => (artifact.optional && !options.optionalArtifacts.has(artifact.href) ? renderPendingLink(artifact.text) : renderLink(artifact.href, artifact.text)))
    .join("");
}

function renderScreenshot(id: string, src: string | undefined, label: string): string {
  if (!src) return `<p>${escapeHtml(id)} (screenshot file unavailable)</p>`;
  return `<figure><img src="${escapeAttribute(src)}" alt="${escapeAttribute(label)}" loading="lazy" /><figcaption>${escapeHtml(label)}</figcaption></figure>`;
}

function renderScoreCard(name: string, scoreInput: number, confidence: string): string {
  const score = clampScore(scoreInput);
  return `<article class="score-card">${renderScoreRing(score)}<div><h3>${escapeHtml(name)}</h3><p>${escapeHtml(confidence)} confidence</p><div class="score-bar" style="--score:${score}; --ring:var(--${scoreBand(score) === "strong" ? "green" : scoreBand(score) === "mixed" ? "amber" : "red"})"><span></span></div></div></article>`;
}

function renderScoreRing(scoreInput: number): string {
  const score = clampScore(scoreInput);
  return `<span class="score-ring score-ring--${scoreBand(score)}" style="--score:${score}" aria-label="Score ${score} of 100"><strong>${score}</strong></span>`;
}

function renderLink(href: string, text: string): string {
  return `<a class="sheet-link" href="${escapeAttribute(href)}">${escapeHtml(text)}</a>`;
}

function renderPendingLink(text: string): string {
  return `<span class="sheet-link sheet-link--pending">${escapeHtml(text)} pending</span>`;
}

function renderMetric(labelText: string, value: string): string {
  return `<div class="metric"><span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderTextList(items: string[]): string {
  if (items.length === 0) return `<p class="muted">No entries supplied.</p>`;
  return `<ul class="list-clean">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderReviewNote(title: string, body: string): string {
  return `<div class="review-note"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></div>`;
}

function scoreContext(report: AuditReport): string {
  if (report.businessGradeStatus === "business_grade") {
    return `${report.groupedIssues.length} grouped issue(s), ${report.findings.length} finding(s), and imported visual review are reflected in this score.`;
  }
  if (report.businessGradeStatus === "agent_review_pending") {
    return "Review pack exists, but score remains capped until a strict visual review is imported.";
  }
  return "Automated signal score only. Subjective design quality is intentionally withheld.";
}

function screenshotStatsFor(report: AuditReport): { total: number; firstViewport: number; fullPage: number; state: number } {
  const stats = { total: 0, firstViewport: 0, fullPage: 0, state: 0 };
  for (const page of report.pages) {
    for (const screenshot of Object.values(page.screenshots)) {
      stats.total += 1;
      if (screenshot.kind === "above_fold") stats.firstViewport += 1;
      else if (screenshot.kind === "full_page") stats.fullPage += 1;
      else if (screenshot.kind === "state") stats.state += 1;
    }
  }
  return stats;
}

function captureSummary(stats: { firstViewport: number; fullPage: number; state: number }): string {
  return `${formatCount(stats.firstViewport, "first viewport")}, ${formatCount(stats.fullPage, "full-page flow")}, and ${formatCount(stats.state, "state capture")}`;
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function label(value: string): string {
  return value.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (char) => char.toUpperCase());
}

function businessGradeLabel(value: string): string {
  if (value === "business_grade") return "Quality gate passed";
  if (value === "agent_review_pending") return "Agent review pending";
  return "Automated scan";
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreBand(score: number): "strong" | "mixed" | "risk" {
  if (score >= 85) return "strong";
  if (score >= 70) return "mixed";
  return "risk";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
