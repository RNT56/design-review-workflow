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
            <p><strong>Composition:</strong> ${escapeHtml(review.composition)}</p>
            <p><strong>CTA clarity:</strong> ${escapeHtml(review.ctaClarity)}</p>
            <p><strong>Mobile:</strong> ${escapeHtml(review.mobile)}</p>
            <p><strong>Trust/proof:</strong> ${escapeHtml(review.trustAndProof)}</p>
            <p><strong>Visual system:</strong> ${escapeHtml(review.visualSystemCoherence)}</p>
            <p><strong>Accessibility basics:</strong> ${escapeHtml(review.accessibilityBasics)}</p>
            <p><strong>Style/taste:</strong> ${escapeHtml(review.styleAndTaste)}</p>
            <p><strong>Redesign advice:</strong> ${escapeHtml(review.redesignAdvice)}</p>
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
  const scoreCards = Object.entries(report.scorecard.subscores)
    .sort(([, a], [, b]) => b.score - a.score)
    .map(([key, item]) => {
      const score = clampScore(item.score);
      const dimension = label(key);
      return `<article class="score-card">
        <span class="score-ring score-ring--${scoreBand(score)}" style="--score:${score}" aria-label="${escapeAttribute(`${dimension} score ${score} of 100`)}"><strong>${score}</strong></span>
        <div>
          <h3>${escapeHtml(dimension)}</h3>
          <p>${escapeHtml(item.confidence)} confidence</p>
        </div>
      </article>`;
    })
    .join("");
  const designVerdict = renderDesignVerdict(report);

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
      .scorecard-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin: 18px 0 28px;
      }
      .score-card {
        display: grid;
        grid-template-columns: 84px 1fr;
        gap: 14px;
        align-items: center;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 16px;
        background: var(--panel);
      }
      .score-card h3 {
        margin: 0 0 6px;
        font-size: 17px;
      }
      .score-card p {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        font-weight: 700;
      }
      .score-ring {
        --ring: var(--accent);
        position: relative;
        width: 78px;
        height: 78px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        background: conic-gradient(var(--ring) calc(var(--score) * 1%), #e8edf1 0);
      }
      .score-ring::after {
        content: "";
        position: absolute;
        inset: 10px;
        border-radius: inherit;
        background: #ffffff;
      }
      .score-ring strong {
        position: relative;
        z-index: 1;
        font-size: 22px;
      }
      .score-ring--strong {
        --ring: #15803d;
      }
      .score-ring--mixed {
        --ring: #b45309;
      }
      .score-ring--risk {
        --ring: #b42318;
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
      .verdict-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 12px;
        margin: 18px 0;
      }
      .verdict-card {
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 16px;
        background: var(--panel);
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

      ${designVerdict}

      <h2>Grouped Issues</h2>
      ${groupedIssues || "<p>No grouped deterministic issues were generated. Business-grade design judgment still requires imported strict visual review.</p>"}

      ${agentReview}

      <h2>Scorecard</h2>
      <section class="scorecard-grid" aria-label="Category scorecard">
        ${scoreCards}
      </section>

      <h2>Top Findings</h2>
      ${findings || "<p>Automated rules found no deterministic blockers; this is not a design-quality verdict until strict multimodal visual review is imported.</p>"}

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

function renderDesignVerdict(report: AuditReport): string {
  if (!report.agentVisualReview || report.businessGradeStatus !== "business_grade") {
    return `<section class="verdict-card">
      <h2>Design Verdict</h2>
      <p><strong>Visual review required.</strong> Automated rules may find deterministic blockers, but this is not a design-quality verdict and does not include style/taste judgment.</p>
      <p>A repo-capable multimodal agent must inspect screenshots, complete the visual review JSON, import it, and pass the business-grade gate.</p>
    </section>`;
  }
  const verdict = report.agentVisualReview.designVerdict;
  const actions = report.agentVisualReview.redesignActions
    .map(
      (action) => `<article class="verdict-card">
        <h3>${escapeHtml(action.title)}</h3>
        <p>${escapeHtml(action.priority)} / ${escapeHtml(action.effort)} effort / ${escapeHtml(action.confidence)} confidence</p>
        <p><strong>Recommendation:</strong> ${escapeHtml(action.recommendation)}</p>
        <p><strong>Expected impact:</strong> ${escapeHtml(action.expectedImpact)}</p>
        <p><strong>Evidence:</strong> ${escapeHtml(action.evidenceRefs.join(", "))}</p>
      </article>`
    )
    .join("");
  return `<section>
    <h2>Design Verdict</h2>
    <div class="verdict-grid">
      <article class="verdict-card"><h3>Readiness</h3><p>${escapeHtml(label(verdict.readiness))}</p><p>${escapeHtml(verdict.rationale)}</p></article>
      <article class="verdict-card"><h3>Style And Taste</h3><p>${escapeHtml(verdict.styleAndTaste)}</p></article>
      <article class="verdict-card"><h3>Audience Fit</h3><p>${escapeHtml(verdict.audienceFit)}</p></article>
      <article class="verdict-card"><h3>Brand Fit</h3><p>${escapeHtml(verdict.brandFit)}</p></article>
      <article class="verdict-card"><h3>Redesign Direction</h3><p>${escapeHtml(verdict.redesignDirection)}</p></article>
    </div>
    <h3>Prioritized Redesign Actions</h3>
    <div class="verdict-grid">${actions || "<p>No major redesign actions were required by the imported visual review.</p>"}</div>
  </section>`;
}

function label(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
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
