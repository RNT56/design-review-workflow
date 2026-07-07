import { access, copyFile, cp } from "node:fs/promises";
import * as path from "node:path";
import { AuditReport, GroupedIssue } from "../schemas/audit.js";
import { AuditPaths } from "../storage/project.js";
import { ensureDir, writeJson, writeText } from "../utils/fs.js";
import { evaluateBusinessGradeGate } from "../review/business-grade.js";
import { writeScreenshotManifest } from "./screenshot-manifest.js";

export async function writeBusinessGradeArtifacts(report: AuditReport, paths: AuditPaths): Promise<void> {
  await writeJson(path.join(paths.report, "grouped-issues.json"), report.groupedIssues);
  await writeJson(path.join(paths.report, "business-grade-gate.json"), evaluateBusinessGradeGate(report));
  await writeScreenshotManifest(report, paths);
  await writeHostedReport(report, paths);
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

  await writeText(path.join(hostedRoot, "index.html"), renderHostedHtml(report, screenshotAssetMap, issueSheetAssetMap));
}

function renderHostedHtml(report: AuditReport, screenshotAssetMap: Map<string, string>, issueSheetAssetMap: Map<string, string>): string {
  const groupedIssues = report.groupedIssues.map((issue) => renderIssue(issue, screenshotAssetMap, issueSheetAssetMap.get(issue.issueId))).join("");
  const pageSections = report.pages
    .map((page) => {
      const screenshots = Object.values(page.screenshots)
        .map((screenshot) => renderScreenshot(screenshot.id, screenshotAssetMap.get(screenshot.id), `${screenshot.viewport} ${screenshot.kind}`))
        .join("");
      return `<section class="page"><h3>${escapeHtml(page.title ?? page.url)}</h3><p>${escapeHtml(page.pageType)} / ${escapeHtml(page.url)}</p><details><summary>Screenshots (${Object.keys(page.screenshots).length})</summary><div class="shots">${screenshots}</div></details></section>`;
    })
    .join("");
  const agentReview = report.agentVisualReview
    ? `<section><h2>Agent Visual Review</h2><p>Reviewer: ${escapeHtml(report.agentVisualReview.reviewer)} / Confidence: ${escapeHtml(report.agentVisualReview.confidence)}</p>${report.agentVisualReview.pageReviews
        .map((review) => `<article class="page"><h3>${escapeHtml(review.url)}</h3><p><strong>First viewport:</strong> ${escapeHtml(review.firstViewport)}</p><p><strong>Hierarchy:</strong> ${escapeHtml(review.hierarchy)}</p><p><strong>Mobile:</strong> ${escapeHtml(review.mobile)}</p><details><summary>Reviewed screenshots</summary><div class="shots">${review.screenshotsReviewed
          .map((ref) => renderScreenshot(ref, screenshotAssetMap.get(ref), ref))
          .join("")}</div></details></article>`)
        .join("")}</section>`
    : `<section><h2>Agent Visual Review</h2><p class="status status--warn">Not imported. This report is an automated scan, not a business-grade design review.</p></section>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Design Review - ${escapeHtml(new URL(report.config.url).hostname)}</title>
  <style>
    :root { color-scheme: light; --ink:#162027; --muted:#64727d; --line:#d8e2e0; --panel:#f6faf8; --accent:#0f766e; --warn:#9a3412; }
    body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:white; line-height:1.55; }
    main { max-width:1180px; margin:0 auto; padding:36px 22px 80px; }
    header { border-bottom:1px solid var(--line); padding-bottom:22px; margin-bottom:24px; }
    h1 { font-size:36px; margin:0 0 8px; }
    h2 { margin-top:34px; font-size:24px; }
    h3 { font-size:18px; }
    .metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin:20px 0; }
    .metric, .issue, .page { border:1px solid var(--line); border-radius:8px; padding:14px; background:var(--panel); }
    .metric strong { display:block; font-size:28px; }
    .status { display:inline-block; border-radius:999px; padding:4px 10px; background:#e8f5f1; color:var(--accent); font-weight:700; }
    .status--warn { background:#fff7ed; color:var(--warn); }
    .sheet-link { display:inline-flex; min-height:34px; align-items:center; border:1px solid var(--line); border-radius:8px; padding:6px 10px; background:white; color:var(--accent); font-weight:700; text-decoration:none; }
    details { margin-top:12px; }
    summary { cursor:pointer; color:var(--accent); font-weight:700; }
    .shots { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin-top:12px; }
    figure { margin:0; border:1px solid var(--line); border-radius:8px; overflow:hidden; background:white; }
    img { display:block; width:100%; height:auto; }
    figcaption { padding:8px 10px; color:var(--muted); font-size:12px; }
    ul { padding-left:20px; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Website Design Review</h1>
      <p>${escapeHtml(report.config.url)}</p>
      <p><span class="status ${report.businessGradeStatus === "business_grade" ? "" : "status--warn"}">${escapeHtml(report.businessGradeStatus)}</span></p>
    </header>
    <section class="metrics">
      <div class="metric"><span>Score</span><strong>${report.scorecard.overallScore}</strong></div>
      <div class="metric"><span>Grouped issues</span><strong>${report.groupedIssues.length}</strong></div>
      <div class="metric"><span>Pages</span><strong>${report.pages.length}</strong></div>
      <div class="metric"><span>Findings</span><strong>${report.findings.length}</strong></div>
    </section>
    <section><h2>Grouped Issues</h2>${groupedIssues || "<p>No grouped issues were generated.</p>"}</section>
    ${agentReview}
    <section><h2>Pages And Screenshots</h2>${pageSections}</section>
  </main>
</body>
</html>`;
}

function renderIssue(issue: GroupedIssue, screenshotAssetMap: Map<string, string>, issueSheetSrc: string | undefined): string {
  const screenshots = issue.evidenceRefs.map((ref) => renderScreenshot(ref, screenshotAssetMap.get(ref), ref)).join("");
  const issueSheetLink = issueSheetSrc ? `<p><a class="sheet-link" href="${escapeAttribute(issueSheetSrc)}">Open issue evidence sheet</a></p>` : "";
  return `<article class="issue">
    <h3>${escapeHtml(issue.title)}</h3>
    <p>${escapeHtml(issue.severity)} / ${escapeHtml(issue.category)} / priority ${issue.priorityScore}</p>
    <p><strong>Affected pages:</strong> ${issue.affectedPages.map((page) => escapeHtml(page.url)).join(", ")}</p>
    <p><strong>Observation:</strong> ${escapeHtml(issue.observation)}</p>
    <p><strong>Recommendation:</strong> ${escapeHtml(issue.recommendation)}</p>
    ${issueSheetLink}
    <ul>${issue.acceptanceCriteria.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <details><summary>Evidence screenshots (${issue.evidenceRefs.length})</summary><div class="shots">${screenshots}</div></details>
  </article>`;
}

function renderScreenshot(id: string, src: string | undefined, label: string): string {
  if (!src) return `<p>${escapeHtml(id)} (screenshot file unavailable)</p>`;
  return `<figure><img src="${escapeAttribute(src)}" alt="${escapeAttribute(label)}" loading="lazy" /><figcaption>${escapeHtml(label)}</figcaption></figure>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
