import { AuditReport } from "../schemas/audit.js";

export function renderHtmlReport(report: AuditReport): string {
  const groupedIssues = report.groupedIssues
    .slice(0, 12)
    .map(
      (issue) => `
      <article class="finding finding--issue">
        <div class="finding__meta">${escapeHtml(issue.severity)} / ${escapeHtml(issue.category)} / ${escapeHtml(issue.source)} / priority ${issue.priorityScore}</div>
        <h3>${escapeHtml(issue.title)}</h3>
        <p><strong>Affected pages:</strong> ${escapeHtml(issue.affectedPages.map((page) => page.section ? `${page.url} (${page.section})` : page.url).join(", "))}</p>
        <p><strong>Observation:</strong> ${escapeHtml(issue.observation)}</p>
        <p><strong>Recommendation:</strong> ${escapeHtml(issue.recommendation)}</p>
        <ul>${issue.acceptanceCriteria.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
    `
    )
    .join("");
  const findings = report.findings
    .map(
      (finding) => `
      <article class="finding">
        <div class="finding__meta">${escapeHtml(finding.severity)} / ${escapeHtml(finding.category)} / ${escapeHtml(finding.source)} / priority ${finding.priorityScore}</div>
        <h3>${escapeHtml(finding.title)}</h3>
        <dl>
          <dt>Page</dt><dd><a href="${escapeAttribute(finding.evidence.url)}">${escapeHtml(finding.evidence.url)}</a></dd>
          <dt>Viewport</dt><dd>${escapeHtml(finding.evidence.viewport ?? "not viewport-specific")}</dd>
          <dt>Section</dt><dd>${escapeHtml(finding.evidence.section ?? "unspecified")}</dd>
          <dt>Evidence</dt><dd>${escapeHtml(finding.evidence.screenshotRefs.join(", ") || finding.evidence.pageId)}</dd>
        </dl>
        <p><strong>Observation:</strong> ${escapeHtml(finding.observation)}</p>
        <p><strong>Why it matters:</strong> ${escapeHtml(finding.whyItMatters)}</p>
        <p><strong>Recommendation:</strong> ${escapeHtml(finding.recommendation)}</p>
        <ul>${finding.implementation.acceptanceCriteria.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </article>
    `
    )
      .join("");
  const agentReview = report.agentVisualReview
    ? `<h2>Agent Visual Review</h2>
      <p>Reviewer: ${escapeHtml(report.agentVisualReview.reviewer)}. Confidence: ${escapeHtml(report.agentVisualReview.confidence)}. Screenshots reviewed: ${report.agentVisualReview.screenshotsReviewed.length}.</p>
      ${report.agentVisualReview.pageReviews
        .map(
          (review) => `<article class="finding">
            <h3>${escapeHtml(review.url)}</h3>
            <p><strong>First viewport:</strong> ${escapeHtml(review.firstViewport)}</p>
            <p><strong>Hierarchy:</strong> ${escapeHtml(review.hierarchy)}</p>
            <p><strong>Mobile:</strong> ${escapeHtml(review.mobile)}</p>
            <p><strong>Trust/proof:</strong> ${escapeHtml(review.trustAndProof)}</p>
          </article>`
        )
        .join("")}`
    : "";
  const competitorRows = report.competitorBenchmarks
    .map(
      (competitor) =>
        `<tr><td>${escapeHtml(competitor.competitorUrl)}</td><td>${competitor.scorecard.overallScore}</td><td>${competitor.pagesReviewed}</td><td>${escapeHtml(competitor.relativeWeaknesses[0] ?? "")}</td></tr>`
    )
    .join("");
  const annotations = report.screenshotAnnotations
    .slice(0, 20)
    .map((annotation) => `<li>${escapeHtml(annotation.label)}: ${escapeHtml(annotation.annotatedScreenshot.path)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Website Design Review - ${escapeHtml(new URL(report.config.url).hostname)}</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #172026;
        --muted: #61717b;
        --line: #dbe3e7;
        --panel: #f7faf9;
        --accent: #0f766e;
        --risk: #b42318;
      }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ink);
        background: #ffffff;
        line-height: 1.55;
      }
      main {
        max-width: 1120px;
        margin: 0 auto;
        padding: 40px 24px 64px;
      }
      header {
        border-bottom: 1px solid var(--line);
        padding-bottom: 28px;
        margin-bottom: 28px;
      }
      h1, h2, h3 {
        letter-spacing: 0;
        line-height: 1.15;
      }
      h1 {
        font-size: 40px;
        margin: 0 0 12px;
      }
      h2 {
        font-size: 26px;
        margin-top: 42px;
      }
      h3 {
        font-size: 19px;
      }
      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin: 24px 0;
      }
      .metric {
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 16px;
        background: var(--panel);
      }
      .metric strong {
        display: block;
        font-size: 28px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border-bottom: 1px solid var(--line);
        padding: 10px 8px;
        text-align: left;
        vertical-align: top;
      }
      .finding {
        border-top: 1px solid var(--line);
        padding: 22px 0;
      }
      .finding--issue {
        border-left: 4px solid var(--accent);
        padding-left: 16px;
      }
      .finding__meta {
        color: var(--risk);
        font-size: 13px;
        font-weight: 700;
        text-transform: uppercase;
      }
      dl {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 6px 12px;
        margin: 14px 0;
      }
      dt {
        color: var(--muted);
      }
      dd {
        margin: 0;
      }
      .briefing {
        display: grid;
        gap: 12px;
      }
      .briefing section {
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 16px;
      }
      @media print {
        main { padding: 24px; }
        .finding { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Website Design Review</h1>
        <p>${escapeHtml(report.config.url)}</p>
        <p>Generated ${escapeHtml(report.generatedAt)}. Website type: ${escapeHtml(report.websiteType)} (${escapeHtml(report.websiteTypeConfidence)} confidence).</p>
        <p>Business-grade status: <strong>${escapeHtml(report.businessGradeStatus)}</strong>${report.businessGradeStatus === "business_grade" ? "" : " - automated output is not business-grade until a validated agent visual review is imported."}</p>
      </header>

      <section class="summary">
        <div class="metric"><span>Overall score</span><strong>${report.scorecard.overallScore}</strong></div>
        <div class="metric"><span>Validated findings</span><strong>${report.findings.length}</strong></div>
        <div class="metric"><span>Grouped issues</span><strong>${report.groupedIssues.length}</strong></div>
        <div class="metric"><span>Pages reviewed</span><strong>${report.pages.length}</strong></div>
        <div class="metric"><span>Quick wins</span><strong>${report.quickWins.length}</strong></div>
      </section>

      <h2>Grouped Issues</h2>
      ${groupedIssues || "<p>No grouped issues were generated.</p>"}

      ${agentReview}

      <h2>Scorecard</h2>
      <table>
        <thead><tr><th>Dimension</th><th>Score</th><th>Confidence</th></tr></thead>
        <tbody>
          ${Object.entries(report.scorecard.subscores)
            .map(([key, item]) => `<tr><td>${escapeHtml(label(key))}</td><td>${item.score}</td><td>${escapeHtml(item.confidence)}</td></tr>`)
            .join("")}
        </tbody>
      </table>

      <h2>Top Findings</h2>
      ${findings || "<p>No validated findings were generated by the MVP rules.</p>"}

      ${
        competitorRows
          ? `<h2>Competitor Benchmark</h2>
      <table>
        <thead><tr><th>Competitor</th><th>Score</th><th>Pages</th><th>Top Gap</th></tr></thead>
        <tbody>${competitorRows}</tbody>
      </table>`
          : ""
      }

      ${annotations ? `<h2>Screenshot Annotations</h2><ul>${annotations}</ul>` : ""}

      <h2>Redesign Briefing</h2>
      <div class="briefing">
        ${report.redesignBriefing.map((section) => `<section><h3>${escapeHtml(section.title)}</h3><p>${escapeHtml(section.body)}</p></section>`).join("")}
      </div>

      <h2>Assumptions And Limitations</h2>
      <ul>
        ${[...report.assumptions, ...report.limitations].map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>

      ${
        report.ticketExports
          ? `<h2>Ticket Export Files</h2>
      <ul>
        ${Object.entries(report.ticketExports)
          .filter(([, value]) => Boolean(value))
          .map(([key, value]) => `<li>${escapeHtml(label(key))}: ${escapeHtml(String(value))}</li>`)
          .join("")}
      </ul>`
          : ""
      }
    </main>
  </body>
</html>`;
}

function label(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
