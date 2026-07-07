import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type AuditSummary = {
  site: string;
  audit: string;
  auditId?: string;
  auditRoot?: string;
  publicBasePath?: string;
  reportPath: string;
  htmlPath: string;
  pdfPath: string;
  workflowManifestPath: string;
  handoffPath: string;
  validationPath: string;
  agentPlanPath: string;
  sourceCandidatesPath: string;
  repoAnalysisPath: string;
  patchPlanPath: string;
  benchmarkPath: string;
  standardsPath: string;
  visualSystemPath: string;
  generatedAt?: string;
  score?: number;
  findings?: number;
};

type Job = {
  id: string;
  status: "running" | "completed" | "failed";
  progress: Array<{ stage: string; message: string; current?: number; total?: number; at: string }>;
  auditRoot?: string;
  report?: AuditReport;
  error?: string;
};

type ScreenshotRef = {
  id: string;
  viewport: string;
  kind: string;
  path: string;
  width: number;
  height: number;
};

type AuditReport = {
  auditId: string;
  auditRoot?: string;
  publicBasePath?: string;
  generatedAt: string;
  config: { url: string; mode: string; outputs?: { pdf?: boolean; html?: boolean; markdown?: boolean; json?: boolean } };
  businessGradeStatus: "automated_scan" | "agent_review_pending" | "business_grade";
  websiteType: string;
  websiteTypeConfidence: string;
  pages: Array<{ pageId: string; url: string; pageType: string; businessImportance: string; title?: string; screenshots: Record<string, ScreenshotRef> }>;
  findings: Array<{
    findingId: string;
    source?: "deterministic" | "agent_visual" | "merged";
    title: string;
    category: string;
    severity: string;
    priorityScore: number;
    impact: string;
    effort: string;
    confidence: string;
    observation: string;
    recommendation: string;
    evidence: { url: string; viewport?: string; section?: string; screenshotRefs: string[] };
  }>;
  groupedIssues: Array<{
    issueId: string;
    title: string;
    category: string;
    severity: string;
    priorityScore: number;
    source: string;
    affectedPages: Array<{ pageId: string; url: string; section?: string }>;
    sourceFindingIds: string[];
    sourceReviewIds: string[];
    evidenceRefs: string[];
    observation: string;
    recommendation: string;
    acceptanceCriteria: string[];
  }>;
  agentVisualReview?: {
    reviewer: string;
    reviewedAt: string;
    auditId: string;
    designVerdict: {
      readiness: string;
      styleAndTaste: string;
      audienceFit: string;
      brandFit: string;
      strongestDesignQualities: string[];
      weakestDesignRisks: string[];
      redesignDirection: string;
      rationale: string;
      confidence: string;
      limitations: string[];
    };
    screenshotsReviewed: string[];
    pageReviews: Array<{
      pageId: string;
      url: string;
      screenshotsReviewed: string[];
      firstViewport: string;
      hierarchy: string;
      composition: string;
      navigation: string;
      ctaClarity: string;
      mobile: string;
      trustAndProof: string;
      visualSystemCoherence: string;
      accessibilityBasics: string;
      styleAndTaste: string;
      redesignAdvice: string;
      notes: string[];
    }>;
    visualFindings: Array<{
      reviewId: string;
      title: string;
      category: string;
      severity: string;
      confidence: string;
      pageId: string;
      url: string;
      evidenceRefs: string[];
      observation: string;
      recommendation: string;
    }>;
    redesignActions: Array<{
      actionId: string;
      title: string;
      priority: string;
      effort: string;
      confidence: string;
      affectedPages: Array<{ pageId: string; url: string; section?: string }>;
      evidenceRefs: string[];
      recommendation: string;
      expectedImpact: string;
      acceptanceCriteria: string[];
      sourceFindingIds: string[];
    }>;
    strengths: string[];
    risks: string[];
    confidence: string;
    limitations: string[];
  };
  quickWins: Array<{ findingId: string; title: string; recommendation: string }>;
  tickets: Array<{
    title: string;
    role: string[];
    priority: string;
    effort: string;
    sourceFindingIds: string[];
    problem: string;
    goal: string;
    scope: string[];
    acceptanceCriteria: string[];
    definitionOfDone: string[];
    evidenceRefs: string[];
  }>;
  screenshotAnnotations: Array<{ annotationId: string; label: string; sourceScreenshotId: string; annotatedScreenshot: { id?: string; path: string } }>;
  competitorBenchmarks: Array<{ competitorUrl: string; pagesReviewed: number; scorecard: { overallScore: number }; relativeWeaknesses: string[]; differentiationOpportunities: string[] }>;
  ticketExports?: Record<string, string>;
  scorecard: {
    overallScore: number;
    subscores: Record<string, { score: number; confidence: string; rationale: string }>;
  };
  redesignBriefing: Array<{ title: string; body: string }>;
};

type ReportTab = "overview" | "findings" | "implementation" | "evidence" | "agentReview" | "agent";
type EvidenceView = "pages" | "issues" | "agent" | "raw";

function App() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"quick_scan" | "full_audit">("quick_scan");
  const [maxPages, setMaxPages] = useState(6);
  const [websiteGoal, setWebsiteGoal] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<AuditSummary[]>([]);
  const [selected, setSelected] = useState<AuditReport | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");
  const [evidenceView, setEvidenceView] = useState<EvidenceView>("pages");
  const latestProgress = job?.progress[job.progress.length - 1];

  useEffect(() => {
    void refreshHistory();
  }, []);

  useEffect(() => {
    if (!jobId) return;
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/jobs/${jobId}`);
      if (response.ok) {
        const next = (await response.json()) as Job;
        setJob(next);
        if (next.report) {
          setSelected(next.report);
          setActiveTab("overview");
          setEvidenceView("pages");
          await refreshHistory();
        }
        if (next.status !== "running") {
          window.clearInterval(interval);
        }
      }
    }, 1200);
    return () => window.clearInterval(interval);
  }, [jobId]);

  const historyStats = useMemo(() => summarizeHistory(history), [history]);
  const sortedFindings = useMemo(() => selected?.findings.slice().sort((a, b) => b.priorityScore - a.priorityScore) ?? [], [selected]);
  const sortedIssues = useMemo(() => selected?.groupedIssues.slice().sort((a, b) => b.priorityScore - a.priorityScore) ?? [], [selected]);

  async function refreshHistory() {
    const response = await fetch("/api/audits");
    if (response.ok) {
      setHistory((await response.json()) as AuditSummary[]);
    }
  }

  async function startAudit(event: React.FormEvent) {
    event.preventDefault();
    setSelected(null);
    setJob(null);
    const response = await fetch("/api/audits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, mode, maxPages, websiteGoal })
    });
    const body = await response.json();
    if (!response.ok) {
      setJob({ id: "error", status: "failed", progress: [], error: body.error ?? "Unable to start audit" });
      return;
    }
    setJobId(body.jobId);
  }

  async function openHistory(item: AuditSummary) {
    const response = await fetch(`/api/audits/${item.site}/${item.audit}/report`);
    if (response.ok) {
      setSelected((await response.json()) as AuditReport);
      setActiveTab("overview");
      setEvidenceView("pages");
    }
  }

  return (
    <main className="app-shell">
      <header className="hero-bar">
        <div className="brand-block">
          <span className="eyebrow">Local-first design intelligence</span>
          <h1>Website Design Review</h1>
          <p>
            Capture real pages, inspect screenshot evidence, group design issues, and hand off a report that stays honest about
            automated versus agent-reviewed depth.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" className="quiet-button" onClick={() => void refreshHistory()}>
            Refresh audits
          </button>
        </div>
      </header>

      <section className="top-layout" aria-label="Audit cockpit">
        <form className="launch-panel" onSubmit={(event) => void startAudit(event)}>
          <div className="panel-heading">
            <span className="eyebrow">Run setup</span>
            <h2>Start a review</h2>
            <p>Public URL in, local evidence bundle out. No login areas, no external model keys.</p>
          </div>

          <label>
            URL
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" required />
          </label>

          <div className="segmented" role="group" aria-label="Audit mode">
            <button
              type="button"
              className={mode === "quick_scan" ? "active" : ""}
              onClick={() => {
                setMode("quick_scan");
                setMaxPages(6);
              }}
            >
              Quick Scan
            </button>
            <button
              type="button"
              className={mode === "full_audit" ? "active" : ""}
              onClick={() => {
                setMode("full_audit");
                setMaxPages(15);
              }}
            >
              Full Audit
            </button>
          </div>

          <div className="field-grid">
            <label>
              Max pages
              <input type="number" min={1} max={15} value={maxPages} onChange={(event) => setMaxPages(Number(event.target.value))} />
            </label>
            <label>
              Website goal
              <input value={websiteGoal} onChange={(event) => setWebsiteGoal(event.target.value)} placeholder="Optional" />
            </label>
          </div>

          <button type="submit" className="primary-button" disabled={job?.status === "running"}>
            {job?.status === "running" ? "Audit running" : "Start audit"}
          </button>

          {job ? (
            <div className={`job job--${job.status}`}>
              <div>
                <strong>{label(job.status)}</strong>
                <span>{job.error ?? latestProgress?.message ?? "Waiting for progress"}</span>
              </div>
              {latestProgress?.current && latestProgress.total ? <span className="progress-count">{latestProgress.current}/{latestProgress.total}</span> : null}
            </div>
          ) : null}
        </form>

        <aside className="library-panel">
          <div className="panel-heading library-heading">
            <div>
              <span className="eyebrow">Audit library</span>
              <h2>Project history</h2>
            </div>
            <span className="count-pill">{historyStats.total} runs</span>
          </div>

          <div className="library-metrics" aria-label="Audit history summary">
            <MetricTile label="Average score" value={historyStats.averageScore == null ? "-" : `${historyStats.averageScore}`} />
            <MetricTile label="Findings" value={`${historyStats.totalFindings}`} />
            <MetricTile label="Tracked sites" value={`${historyStats.sites}`} />
          </div>

          <HistoryScoreChart history={history} />

          <div className="history-list" aria-label="Completed audits">
            {history.length === 0 ? <p className="muted">No completed audits yet. Run the first audit to populate this cockpit.</p> : null}
            {history.map((item, index) => (
              <button
                type="button"
                className={`history-row ${selected?.auditId && selected.auditId === item.auditId ? "active" : ""}`}
                key={`${item.site}-${item.audit}-${index}`}
                onClick={() => void openHistory(item)}
              >
                <span>
                  <strong>{item.site}</strong>
                  <small>{formatRunLabel(item)}</small>
                </span>
                <strong>{item.score ?? "-"} / 100</strong>
                <small>{item.findings ?? 0} findings</small>
              </button>
            ))}
          </div>
        </aside>
      </section>

      {selected ? (
        <ReportDashboard
          report={selected}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          evidenceView={evidenceView}
          setEvidenceView={setEvidenceView}
          sortedFindings={sortedFindings}
          sortedIssues={sortedIssues}
        />
      ) : (
        <EmptyState historyStats={historyStats} />
      )}
    </main>
  );
}

function ReportDashboard({
  report,
  activeTab,
  setActiveTab,
  evidenceView,
  setEvidenceView,
  sortedFindings,
  sortedIssues
}: {
  report: AuditReport;
  activeTab: ReportTab;
  setActiveTab: (tab: ReportTab) => void;
  evidenceView: EvidenceView;
  setEvidenceView: (tab: EvidenceView) => void;
  sortedFindings: AuditReport["findings"];
  sortedIssues: AuditReport["groupedIssues"];
}) {
  const pageCount = report.pages.length;
  const screenshotCount = totalScreenshotCount(report);
  const evidenceCompleteness = evidenceCompletenessLabel(report);
  const highestSignal =
    sortedIssues[0]?.title ??
    sortedFindings[0]?.title ??
    (report.businessGradeStatus === "business_grade" ? "No priority issue was raised by the imported visual review." : "Visual review required before design-quality verdict.");

  return (
    <section className="report-shell">
      <div className="report-hero">
        <ScoreGauge score={report.scorecard.overallScore} status={report.businessGradeStatus} />

        <div className="report-title-block">
          <span className={`status-badge status-badge--${report.businessGradeStatus}`}>{businessGradeLabel(report.businessGradeStatus)}</span>
          <h2>{report.config.url}</h2>
          <p>
            {label(report.websiteType)} review, {label(report.websiteTypeConfidence)} confidence, generated {formatDate(report.generatedAt)}.
          </p>
          <div className="signal-callout">
            <span>Highest signal</span>
            <strong>{highestSignal}</strong>
          </div>
        </div>

        <div className="report-actions">
          <a href={reportFileHref(report, "report.html")} target="_blank" rel="noreferrer">HTML</a>
          {report.config.outputs?.pdf !== false ? <a href={reportFileHref(report, "report.pdf")} target="_blank" rel="noreferrer">PDF</a> : null}
          <a href={reportFileHref(report, "hosted/index.html")} target="_blank" rel="noreferrer">Hosted</a>
          <a href={reportFileHref(report, "agent-review-pack/gallery/index.html")} target="_blank" rel="noreferrer">Gallery</a>
          <a href={reportFileHref(report, "handoff.json")} target="_blank" rel="noreferrer">Handoff</a>
        </div>
      </div>

      <section className="report-metrics" aria-label="Report summary">
        <MetricTile label="Pages captured" value={`${pageCount}`} detail={`${screenshotCount} screenshots`} />
        <MetricTile label="Grouped issues" value={`${report.groupedIssues.length}`} detail={`${report.findings.length} raw findings`} />
        <MetricTile label="Evidence" value={evidenceCompleteness} detail={report.agentVisualReview ? "Agent review imported" : "Agent review pending"} />
        <MetricTile label="Tickets" value={`${report.tickets.length}`} detail="Implementation-ready items" />
      </section>

      <section className="visual-dashboard" aria-label="Report visuals">
        <ScoreBreakdownChart report={report} />
        <IssueDistribution report={report} />
        <WorkflowMap status={report.businessGradeStatus} />
      </section>

      <DesignVerdictPanel report={report} />

      <nav className="tabs" aria-label="Report sections">
        {reportTabs(report).map((tab) => (
          <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
            {label(tab)}
          </button>
        ))}
      </nav>

      {activeTab === "overview" ? (
        <div className="content-grid">
          <section>
            <SectionTitle eyebrow="Decision queue" title="Priority issues" />
            <div className="findings">
              {sortedIssues.length > 0
                ? sortedIssues.slice(0, 5).map((issue) => <IssueCard issue={issue} report={report} key={issue.issueId} />)
                : sortedFindings.slice(0, 5).map((finding) => <FindingCard report={report} finding={finding} key={finding.findingId} />)}
              {sortedIssues.length === 0 && sortedFindings.length === 0 ? <EmptyPanel title="No findings in this report" body="Automated rules found no deterministic blockers. This is not a design-quality verdict until strict multimodal visual review is imported." /> : null}
            </div>
          </section>

          <section>
            <SectionTitle eyebrow="Narrative" title="Redesign briefing" />
            <div className="briefing">
              {report.redesignBriefing.map((section) => (
                <section key={section.title}>
                  <h4>{section.title}</h4>
                  <p>{section.body}</p>
                </section>
              ))}
              {report.redesignBriefing.length === 0 ? <EmptyPanel title="No briefing available" body="Run plan build or complete a visual review to enrich the narrative." /> : null}
            </div>

            <SectionTitle eyebrow="Low effort" title="Quick wins" />
            <div className="annotation-list">
              {report.quickWins.slice(0, 6).map((finding) => (
                <span className="note-row" key={finding.findingId}>{finding.title}</span>
              ))}
              {report.quickWins.length === 0 ? <p className="muted">No quick wins were generated for this audit.</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "findings" ? (
        <section>
          <SectionTitle eyebrow="Validated findings" title="Findings" />
          <div className="findings">
            {sortedFindings.map((finding) => (
              <FindingCard report={report} finding={finding} key={finding.findingId} />
            ))}
            {sortedFindings.length === 0 ? <EmptyPanel title="No validated findings" body="Automated rules found no deterministic blockers. Business-grade design judgment still requires imported visual review." /> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "implementation" ? (
        <div className="content-grid">
          <section>
            <SectionTitle eyebrow="Delivery" title="Implementation queue" />
            <div className="queue">
              {report.tickets.map((ticket, index) => (
                <article className="queue-item" key={`${ticket.title}-${index}`}>
                  <div className="finding-meta">
                    <span>{ticket.priority}</span>
                    <span>{ticket.effort} effort</span>
                    <span>{ticket.role.join(", ")}</span>
                  </div>
                  <h4>{ticket.title}</h4>
                  <p>{ticket.goal}</p>
                  <ul>
                    {ticket.acceptanceCriteria.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                  <small>{ticket.sourceFindingIds.join(", ")}</small>
                </article>
              ))}
              {report.tickets.length === 0 ? <EmptyPanel title="No implementation tickets" body="Ticket exports appear when validated findings produce implementation-ready work." /> : null}
            </div>
          </section>

          <section>
            <SectionTitle eyebrow="Files" title="Implementation artifacts" />
            <div className="artifact-grid">
              {artifactLinks(report).filter((item) => ["Implementation Plan", "Patch Plan", "Changed Files", "Source Candidates", "Repo Analysis"].includes(item.label)).map((item) => (
                <a key={item.label} href={item.href} target="_blank" rel="noreferrer">{item.label}</a>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "evidence" ? (
        <EvidenceSection report={report} evidenceView={evidenceView} setEvidenceView={setEvidenceView} sortedIssues={sortedIssues} />
      ) : null}

      {activeTab === "agentReview" && report.agentVisualReview ? <AgentReviewSection report={report} /> : null}

      {activeTab === "agent" ? <AgentBundleSection report={report} /> : null}
    </section>
  );
}

function DesignVerdictPanel({ report }: { report: AuditReport }) {
  if (!report.agentVisualReview || report.businessGradeStatus !== "business_grade") {
    return (
      <section className="verdict-panel verdict-panel--pending">
        <SectionTitle eyebrow="Business-grade gate" title="Design verdict required" />
        <p>
          Automated rules may find deterministic blockers, but this is not a design-quality verdict and does not include
          style, taste, composition, or redesign-direction judgment.
        </p>
        <div className="finding-meta">
          <span>{report.businessGradeStatus}</span>
          <span>{totalScreenshotCount(report)} screenshots captured</span>
          <span>{report.pages.length} pages awaiting visual review</span>
        </div>
      </section>
    );
  }

  const verdict = report.agentVisualReview.designVerdict;
  return (
    <section className="verdict-panel">
      <SectionTitle eyebrow="Business-grade visual judgment" title="Design verdict" />
      <div className="verdict-grid">
        <article>
          <span className="status-badge status-badge--business_grade">{label(verdict.readiness)}</span>
          <h4>Readiness</h4>
          <p>{verdict.rationale}</p>
        </article>
        <article>
          <h4>Style and taste</h4>
          <p>{verdict.styleAndTaste}</p>
        </article>
        <article>
          <h4>Brand and audience fit</h4>
          <p>{verdict.audienceFit}</p>
          <p>{verdict.brandFit}</p>
        </article>
        <article>
          <h4>Redesign direction</h4>
          <p>{verdict.redesignDirection}</p>
        </article>
      </div>
      <div className="verdict-actions">
        {report.agentVisualReview.redesignActions.map((action) => (
          <article className="finding finding-card" key={action.actionId}>
            <div className="finding-meta">
              <span>{action.priority}</span>
              <span>{action.effort} effort</span>
              <span>{action.confidence}</span>
            </div>
            <h4>{action.title}</h4>
            <p>{action.recommendation}</p>
            <p><strong>Expected impact:</strong> {action.expectedImpact}</p>
            <ScreenshotDrawer report={report} refs={action.evidenceRefs} title="Redesign action evidence" />
          </article>
        ))}
        {report.agentVisualReview.redesignActions.length === 0 ? <p className="muted">No major redesign actions were required by the imported visual review.</p> : null}
      </div>
    </section>
  );
}

function EvidenceSection({
  report,
  evidenceView,
  setEvidenceView,
  sortedIssues
}: {
  report: AuditReport;
  evidenceView: EvidenceView;
  setEvidenceView: (tab: EvidenceView) => void;
  sortedIssues: AuditReport["groupedIssues"];
}) {
  return (
    <div>
      <section className="evidence-summary">
        <span>{report.agentVisualReview ? "Reviewed by agent" : "Agent visual review pending"}</span>
        <span>{totalScreenshotCount(report)} screenshots</span>
        <span>{report.groupedIssues.length} grouped issues</span>
        <span>{evidenceCompletenessLabel(report)}</span>
      </section>

      <div className="evidence-actions">
        <div className="segmented evidence-segmented" role="group" aria-label="Evidence view">
          <button type="button" className={evidenceView === "pages" ? "active" : ""} onClick={() => setEvidenceView("pages")}>Page Evidence</button>
          <button type="button" className={evidenceView === "issues" ? "active" : ""} onClick={() => setEvidenceView("issues")}>Issue Evidence</button>
          <button type="button" className={evidenceView === "agent" ? "active" : ""} onClick={() => setEvidenceView("agent")}>Agent Review Evidence</button>
          <button type="button" className={evidenceView === "raw" ? "active" : ""} onClick={() => setEvidenceView("raw")}>Raw Screenshots</button>
        </div>
        <div className="artifact-grid evidence-link-grid">
          {reviewPackLinks(report).map((item) => (
            <a key={item.label} href={item.href} target="_blank" rel="noreferrer">{item.label}</a>
          ))}
        </div>
      </div>

      {evidenceView === "pages" ? (
        <div className="content-grid">
          <section>
            <SectionTitle eyebrow="Captured pages" title="Page evidence" />
            <div className="page-list">
              {report.pages.map((page) => (
                <article className="page-card" key={page.pageId}>
                  <div className="finding-meta">
                    <span>{page.pageType}</span>
                    <span>{page.businessImportance}</span>
                    <span>{Object.keys(page.screenshots).length} screenshots</span>
                  </div>
                  <h4><a href={page.url} target="_blank" rel="noreferrer">{page.title ?? page.url}</a></h4>
                  <div className="evidence-sheet-links">
                    <a href={pageFirstViewportSheetHref(report, page.pageId)} target="_blank" rel="noreferrer">First viewport sheet</a>
                    <a href={pageFlowSheetHref(report, page.pageId)} target="_blank" rel="noreferrer">Page flow sheet</a>
                  </div>
                  <ScreenshotDrawer report={report} refs={Object.keys(page.screenshots)} title="Raw page screenshots" />
                </article>
              ))}
            </div>
          </section>

          <section>
            <SectionTitle eyebrow="Evidence files" title="Supporting artifacts" />
            <div className="artifact-grid">
              {artifactLinks(report).filter((item) => ["Evidence Index", "Evidence JSONL", "Visual System", "Route Templates", "Experience Timing", "Annotations"].includes(item.label)).map((item) => (
                <a key={item.label} href={item.href} target="_blank" rel="noreferrer">{item.label}</a>
              ))}
            </div>

            {report.competitorBenchmarks.length > 0 ? (
              <>
                <SectionTitle eyebrow="Reference set" title="Competitors" />
                <table>
                  <thead><tr><th>Competitor</th><th>Score</th><th>Pages</th></tr></thead>
                  <tbody>
                    {report.competitorBenchmarks.map((competitor) => (
                      <tr key={competitor.competitorUrl}>
                        <td><a href={competitor.competitorUrl} target="_blank" rel="noreferrer">{safeHost(competitor.competitorUrl)}</a></td>
                        <td>{competitor.scorecard.overallScore}</td>
                        <td>{competitor.pagesReviewed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      {evidenceView === "issues" ? (
        <section>
          <SectionTitle eyebrow="Issue proof" title="Issue evidence" />
          <div className="findings">
            {sortedIssues.length > 0 ? sortedIssues.map((issue) => <IssueCard issue={issue} report={report} key={issue.issueId} />) : <p className="muted">No grouped issues are available for this audit.</p>}
          </div>
        </section>
      ) : null}

      {evidenceView === "agent" ? (
        <section>
          <SectionTitle eyebrow="Visual review" title="Agent review evidence" />
          {report.agentVisualReview ? (
            <div className="page-list">
              <article className="review-summary">
                <div className="finding-meta">
                  <span>{report.agentVisualReview.reviewer}</span>
                  <span>{report.agentVisualReview.confidence} confidence</span>
                  <span>{report.agentVisualReview.screenshotsReviewed.length} reviewed screenshots</span>
                </div>
                <ScreenshotDrawer report={report} refs={report.agentVisualReview.screenshotsReviewed} title="Agent reviewed screenshots" />
              </article>
              {report.agentVisualReview.visualFindings.map((finding) => (
                <article className="finding finding-card" key={finding.reviewId}>
                  <div className="finding-meta">
                    <span>{finding.severity}</span>
                    <span>{finding.category}</span>
                    <span>{finding.confidence}</span>
                  </div>
                  <h4>{finding.title}</h4>
                  <p>{finding.observation}</p>
                  <p><strong>Recommendation:</strong> {finding.recommendation}</p>
                  <ScreenshotDrawer report={report} refs={finding.evidenceRefs} title="Agent finding screenshots" />
                </article>
              ))}
            </div>
          ) : (
            <EmptyPanel title="Agent visual review pending" body="Build the review pack, inspect the gallery and PNG sheets, then import a validated visual-review JSON." />
          )}
        </section>
      ) : null}

      {evidenceView === "raw" ? (
        <section>
          <SectionTitle eyebrow="Source media" title="Raw screenshots" />
          <div className="raw-shot-grid">
            {allScreenshots(report).map((screenshot) => (
              <a className="shot" key={screenshot.id} href={screenshot.href} target="_blank" rel="noreferrer">
                <img src={screenshot.href} alt={screenshot.label} loading="lazy" />
                <span>{screenshot.label}</span>
              </a>
            ))}
          </div>

          {report.screenshotAnnotations.length > 0 ? (
            <>
              <SectionTitle eyebrow="Marked evidence" title="Annotations" />
              <div className="annotation-list">
                {report.screenshotAnnotations.slice(0, 8).map((annotation) => (
                  <a key={annotation.annotationId} href={auditFileHref(report, annotation.annotatedScreenshot.path)} target="_blank" rel="noreferrer">
                    {annotation.label}
                  </a>
                ))}
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function AgentReviewSection({ report }: { report: AuditReport }) {
  if (!report.agentVisualReview) return null;
  return (
    <div className="content-grid">
      <section>
        <SectionTitle eyebrow="Imported review" title="Agent review" />
        <article className="review-summary">
          <div className="finding-meta">
            <span>{report.agentVisualReview.reviewer}</span>
            <span>{report.agentVisualReview.confidence} confidence</span>
            <span>{report.agentVisualReview.screenshotsReviewed.length} screenshots</span>
          </div>
          <p>{formatDate(report.agentVisualReview.reviewedAt)}</p>
          <p><strong>Design verdict:</strong> {label(report.agentVisualReview.designVerdict.readiness)}</p>
          <p><strong>Style and taste:</strong> {report.agentVisualReview.designVerdict.styleAndTaste}</p>
          <p><strong>Redesign direction:</strong> {report.agentVisualReview.designVerdict.redesignDirection}</p>
          <ScreenshotDrawer report={report} refs={report.agentVisualReview.screenshotsReviewed} title="Reviewed screenshots" />
        </article>
        <div className="page-list">
          {report.agentVisualReview.pageReviews.map((review) => (
            <article className="page-card" key={review.pageId}>
              <h4>{review.url}</h4>
              <p><strong>First viewport:</strong> {review.firstViewport}</p>
              <p><strong>Hierarchy:</strong> {review.hierarchy}</p>
              <p><strong>Composition:</strong> {review.composition}</p>
              <p><strong>Navigation:</strong> {review.navigation}</p>
              <p><strong>CTA clarity:</strong> {review.ctaClarity}</p>
              <p><strong>Mobile:</strong> {review.mobile}</p>
              <p><strong>Trust and proof:</strong> {review.trustAndProof}</p>
              <p><strong>Visual system:</strong> {review.visualSystemCoherence}</p>
              <p><strong>Accessibility basics:</strong> {review.accessibilityBasics}</p>
              <p><strong>Style and taste:</strong> {review.styleAndTaste}</p>
              <p><strong>Redesign advice:</strong> {review.redesignAdvice}</p>
              <ScreenshotDrawer report={report} refs={review.screenshotsReviewed} title="Page review screenshots" />
            </article>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle eyebrow="Visual calls" title="Visual findings" />
        <div className="findings">
          {report.agentVisualReview.visualFindings.map((finding) => (
            <article className="finding finding-card" key={finding.reviewId}>
              <div className="finding-meta">
                <span>{finding.severity}</span>
                <span>{finding.category}</span>
                <span>{finding.confidence}</span>
              </div>
              <h4>{finding.title}</h4>
              <p>{finding.observation}</p>
              <p><strong>Recommendation:</strong> {finding.recommendation}</p>
              <ScreenshotDrawer report={report} refs={finding.evidenceRefs} title="Agent evidence screenshots" />
            </article>
          ))}
        </div>

        <SectionTitle eyebrow="Redesign direction" title="Prioritized redesign actions" />
        <div className="findings">
          {report.agentVisualReview.redesignActions.map((action) => (
            <article className="finding finding-card" key={action.actionId}>
              <div className="finding-meta">
                <span>{action.priority}</span>
                <span>{action.effort} effort</span>
                <span>{action.confidence}</span>
              </div>
              <h4>{action.title}</h4>
              <p>{action.recommendation}</p>
              <p><strong>Expected impact:</strong> {action.expectedImpact}</p>
              <ul>{action.acceptanceCriteria.map((item) => <li key={item}>{item}</li>)}</ul>
              <ScreenshotDrawer report={report} refs={action.evidenceRefs} title="Redesign evidence screenshots" />
            </article>
          ))}
        </div>

        <SectionTitle eyebrow="Judgment context" title="Strengths and risks" />
        <div className="briefing">
          <section>
            <h4>Strengths</h4>
            <ul>{report.agentVisualReview.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section>
            <h4>Risks</h4>
            <ul>{report.agentVisualReview.risks.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          {report.agentVisualReview.limitations.length > 0 ? (
            <section>
              <h4>Limitations</h4>
              <ul>{report.agentVisualReview.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function AgentBundleSection({ report }: { report: AuditReport }) {
  return (
    <div className="content-grid">
      <section>
        <SectionTitle eyebrow="Machine handoff" title="Agent bundle" />
        <div className="artifact-grid">
          {artifactLinks(report).map((item) => (
            <a key={item.label} href={item.href} target="_blank" rel="noreferrer">{item.label}</a>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle eyebrow="Downstream" title="Exports" />
        {report.ticketExports ? (
          <div className="artifact-grid">
            {Object.entries(report.ticketExports).map(([key, value]) => (
              <a key={key} href={toProjectHref(value, report)} target="_blank" rel="noreferrer">{label(key)}</a>
            ))}
          </div>
        ) : <p>No ticket exports found.</p>}

        <SectionTitle eyebrow="Verification" title="Closeout commands" />
        <pre className="command-block">{`node apps/cli/dist/index.js report lint ${auditRootFor(report)} --strict
node apps/cli/dist/index.js review-pack build --report ${auditRootFor(report)}
node apps/cli/dist/index.js agent-review validate --report ${auditRootFor(report)} --file agent-runs/<agent>/visual-review.json
node apps/cli/dist/index.js agent-review import --report ${auditRootFor(report)} --file agent-runs/<agent>/visual-review.json
node apps/cli/dist/index.js business-grade lint --report ${auditRootFor(report)}
node apps/cli/dist/index.js benchmark --report ${auditRootFor(report)}
node apps/cli/dist/index.js plan build --report ${auditRootFor(report)}`}</pre>
      </section>
    </div>
  );
}

function IssueCard({ issue, report }: { issue: AuditReport["groupedIssues"][number]; report: AuditReport }) {
  return (
    <article className={`finding issue finding-card severity-${issue.severity.toLowerCase()}`}>
      <div className="card-topline">
        <div className="finding-meta">
          <span>{issue.severity}</span>
          <span>{issue.category}</span>
          <span>{issue.source}</span>
        </div>
        <strong className="priority-chip">{issue.priorityScore}</strong>
      </div>
      <h4>{issue.title}</h4>
      <p>{issue.observation}</p>
      <div className="recommendation-box">
        <span>Recommendation</span>
        <p>{issue.recommendation}</p>
      </div>
      <p className="affected"><strong>Affected:</strong> {issue.affectedPages.map((page) => page.section ? `${page.url} (${page.section})` : page.url).join(", ")}</p>
      <div className="evidence-sheet-links">
        <a href={issueSheetHref(report, issue.issueId)} target="_blank" rel="noreferrer">Issue evidence sheet</a>
      </div>
      <ul className="criteria-list">
        {issue.acceptanceCriteria.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
      </ul>
      <ScreenshotDrawer report={report} refs={issue.evidenceRefs} title="Issue evidence screenshots" />
    </article>
  );
}

function FindingCard({ finding, report }: { finding: AuditReport["findings"][number]; report: AuditReport }) {
  return (
    <article className={`finding finding-card severity-${finding.severity.toLowerCase()}`}>
      <div className="card-topline">
        <div className="finding-meta">
          <span>{finding.severity}</span>
          <span>{finding.category}</span>
          <span>{finding.source ?? "deterministic"}</span>
        </div>
        <strong className="priority-chip">{finding.priorityScore}</strong>
      </div>
      <h4>{finding.title}</h4>
      <p>{finding.observation}</p>
      <div className="recommendation-box">
        <span>Recommendation</span>
        <p>{finding.recommendation}</p>
      </div>
      <small>{finding.evidence.url} / {finding.evidence.viewport ?? "any viewport"} / {finding.evidence.section ?? "section unspecified"}</small>
      <ScreenshotDrawer report={report} refs={finding.evidence.screenshotRefs} title="Finding evidence screenshots" />
    </article>
  );
}

function ScreenshotDrawer({ report, refs, title }: { report: AuditReport; refs: string[]; title: string }) {
  const screenshots = screenshotRefsFor(report, refs);
  const missingRefs = missingScreenshotRefsFor(report, refs);
  return (
    <details className="screenshot-drawer">
      <summary>
        <span>{title}</span>
        <strong>{screenshots.length || refs.length}</strong>
      </summary>
      {screenshots.length > 0 ? (
        <>
          <div className="shot-grid">
            {screenshots.map((screenshot) => (
              <a className="shot" key={`${screenshot.id}-${screenshot.href}`} href={screenshot.href} target="_blank" rel="noreferrer">
                <img src={screenshot.href} alt={screenshot.label} loading="lazy" />
                <span>{screenshot.label}</span>
              </a>
            ))}
          </div>
          {missingRefs.length > 0 ? <p className="warning-text">Missing screenshot refs: {missingRefs.join(", ")}</p> : null}
        </>
      ) : (
        <p className="muted">{refs.length > 0 ? refs.join(", ") : "No screenshot reference was attached."}</p>
      )}
    </details>
  );
}

function ScoreGauge({ score, status }: { score: number; status: AuditReport["businessGradeStatus"] }) {
  return (
    <div className="score-gauge" aria-label={`Overall score ${score} of 100`}>
      <CircleMeter score={score} className={`gauge-value--${status}`} />
      <div>
        <strong>{score}</strong>
        <span>/ 100</span>
      </div>
    </div>
  );
}

function CircleMeter({ score, className = "" }: { score: number; className?: string }) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(score, 100)) / 100) * circumference;
  return (
    <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
      <circle className="gauge-track" cx="60" cy="60" r={radius} />
      <circle className={`gauge-value ${className}`.trim()} cx="60" cy="60" r={radius} strokeDasharray={circumference} strokeDashoffset={offset} />
    </svg>
  );
}

function ScoreBreakdownChart({ report }: { report: AuditReport }) {
  const entries = Object.entries(report.scorecard.subscores).sort(([, a], [, b]) => b.score - a.score);
  return (
    <article className="viz-panel subscore-panel">
      <SectionTitle eyebrow="Score shape" title="Category scoring" />
      <div className="subscore-grid">
        {entries.map(([key, value]) => (
          <div className="subscore-card" key={key}>
            <div className="subscore-ring" aria-label={`${label(key)} score ${value.score} of 100`}>
              <CircleMeter score={value.score} className={`subscore-value subscore-value--${scoreBand(value.score)}`} />
              <strong>{value.score}</strong>
            </div>
            <div className="subscore-copy">
              <span>{label(key)}</span>
              <small>{label(value.confidence)} confidence</small>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function IssueDistribution({ report }: { report: AuditReport }) {
  const issueSource = report.groupedIssues.length > 0 ? report.groupedIssues : report.findings;
  const severity = ["critical", "high", "medium", "low"].map((key) => ({
    key,
    count: issueSource.filter((item) => item.severity.toLowerCase() === key).length
  }));
  const maxSeverity = Math.max(1, ...severity.map((item) => item.count));
  const categories = topCounts(issueSource.map((item) => item.category), 5);
  const maxCategory = Math.max(1, ...categories.map((item) => item.count));

  return (
    <article className="viz-panel">
      <SectionTitle eyebrow="Issue load" title="Distribution" />
      <div className="mini-bars">
        {severity.map((item) => (
          <div className="mini-bar" key={item.key}>
            <span style={{ height: `${Math.max(8, (item.count / maxSeverity) * 100)}%` }} />
            <strong>{item.count}</strong>
            <small>{label(item.key)}</small>
          </div>
        ))}
      </div>
      <div className="category-bars">
        {categories.length > 0 ? categories.map((item) => (
          <div className="category-row" key={item.key}>
            <span>{label(item.key)}</span>
            <div><i style={{ width: `${Math.max(6, (item.count / maxCategory) * 100)}%` }} /></div>
            <strong>{item.count}</strong>
          </div>
        )) : <p className="muted">No category distribution is available yet.</p>}
      </div>
    </article>
  );
}

function WorkflowMap({ status }: { status: AuditReport["businessGradeStatus"] }) {
  const steps = [
    ["Capture", "Rendered pages"],
    ["Review Pack", "Screenshots"],
    ["Agent Review", status === "business_grade" ? "Imported" : "Pending"],
    ["Business Gate", status === "business_grade" ? "Pass" : "Held"]
  ];
  return (
    <article className="viz-panel workflow-panel">
      <SectionTitle eyebrow="Gate path" title="Workflow state" />
      <div className="workflow-map">
        {steps.map(([title, body], index) => (
          <React.Fragment key={title}>
            <div className={`workflow-node ${index < 2 || status === "business_grade" ? "complete" : "pending"}`}>
              <strong>{title}</strong>
              <span>{body}</span>
            </div>
            {index < steps.length - 1 ? <span className="workflow-arrow" aria-hidden="true" /> : null}
          </React.Fragment>
        ))}
      </div>
    </article>
  );
}

function HistoryScoreChart({ history }: { history: AuditSummary[] }) {
  const visible = history.slice(0, 10);
  if (visible.length === 0) {
    return (
      <div className="history-chart empty">
        <span>No score trend yet</span>
      </div>
    );
  }
  return (
    <div className="history-chart" aria-label="Recent audit scores">
      {visible.map((item, index) => (
        <span
          key={`${item.site}-${item.audit}-${index}`}
          title={`${item.site}: ${item.score ?? 0}`}
          style={{ height: `${Math.max(8, Math.min(item.score ?? 0, 100))}%` }}
        />
      ))}
    </div>
  );
}

function EmptyState({ historyStats }: { historyStats: ReturnType<typeof summarizeHistory> }) {
  return (
    <section className="empty-dashboard">
      <div>
        <span className="eyebrow">Ready state</span>
        <h2>Run or open an audit to load the design cockpit.</h2>
        <p>
          The interface is optimized for evidence review: score shape, issue distribution, screenshot drawers, review-pack links,
          and agent handoff files stay in one place.
        </p>
      </div>
      <div className="empty-diagram" aria-hidden="true">
        <span>Capture</span>
        <i />
        <span>Evidence</span>
        <i />
        <span>Review</span>
        <i />
        <span>Handoff</span>
      </div>
      <div className="empty-metrics">
        <MetricTile label="Stored runs" value={`${historyStats.total}`} />
        <MetricTile label="Tracked sites" value={`${historyStats.sites}`} />
        <MetricTile label="Average score" value={historyStats.averageScore == null ? "-" : `${historyStats.averageScore}`} />
      </div>
    </section>
  );
}

function MetricTile({ label: labelText, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="metric-tile">
      <span>{labelText}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="section-title">
      <span className="eyebrow">{eyebrow}</span>
      <h3>{title}</h3>
    </div>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <article className="empty-panel">
      <h4>{title}</h4>
      <p>{body}</p>
    </article>
  );
}

function artifactLinks(report: AuditReport) {
  return [
    ["Manifest", "workflow-manifest.json"],
    ["Handoff", "handoff.json"],
    ["Validation", "validation.json"],
    ["Quality Gate", "quality-gate.json"],
    ["Business Gate", "business-grade-gate.json"],
    ["Grouped Issues", "grouped-issues.json"],
    ["Screenshot Manifest", "screenshot-manifest.json"],
    ["Hosted Report", "hosted/index.html"],
    ["Review Pack", "agent-review-pack/README.md"],
    ["Review Pack Manifest", "agent-review-pack/review-pack-manifest.json"],
    ["Review Gallery", "agent-review-pack/gallery/index.html"],
    ["First Viewports", "contact-sheets/first-viewports.png"],
    ["All Pages Sheet", "contact-sheets/all-pages.png"],
    ["Agent Visual Review", "agent-visual-review.json"],
    ["HTML Report", "report.html"],
    ["Markdown Report", "report.md"],
    ["JSON Report", "report.json"],
    ["Agent Plan", "agent-execution-plan.md"],
    ["Implementation Plan", "implementation-plan.json"],
    ["Patch Plan", "patch-plan.md"],
    ["Changed Files", "changed-files.json"],
    ["Source Candidates", "source-candidates.json"],
    ["Repo Analysis", "repo-analysis.json"],
    ["Evidence Index", "evidence-index.json"],
    ["Evidence JSONL", "evidence.jsonl"],
    ["Visual System", "visual-system.json"],
    ["Route Templates", "route-templates.json"],
    ["Experience Timing", "experience-timing.json"],
    ["Design Benchmark", "design-benchmark.json"],
    ["Standards", "standards-registry.json"],
    ["Suppressions", "suppression-report.json"]
  ].map(([labelText, file]) => ({ label: labelText, href: reportFileHref(report, file) }));
}

function reviewPackLinks(report: AuditReport) {
  return [
    ["Review Gallery", "agent-review-pack/gallery/index.html"],
    ["Review Pack Manifest", "agent-review-pack/review-pack-manifest.json"],
    ["First Viewports", "contact-sheets/first-viewports.png"],
    ["All Pages Index", "contact-sheets/all-pages.png"]
  ].map(([labelText, file]) => ({ label: labelText, href: reportFileHref(report, file) }));
}

function reportTabs(report: AuditReport): ReportTab[] {
  const tabs: ReportTab[] = ["overview", "findings", "implementation", "evidence"];
  if (report.agentVisualReview) tabs.push("agentReview");
  tabs.push("agent");
  return tabs;
}

function screenshotRefsFor(report: AuditReport, refs: string[]) {
  const index = screenshotIndex(report);
  const seen = new Set<string>();
  return refs.flatMap((ref) => {
    const screenshot = index.get(ref);
    if (!screenshot || seen.has(`${screenshot.id}:${screenshot.href}`)) return [];
    seen.add(`${screenshot.id}:${screenshot.href}`);
    return [screenshot];
  });
}

function missingScreenshotRefsFor(report: AuditReport, refs: string[]) {
  const index = screenshotIndex(report);
  return refs.filter((ref) => !index.has(ref));
}

function allScreenshots(report: AuditReport) {
  return report.pages.flatMap((page) =>
    Object.values(page.screenshots).map((screenshot) => ({
      id: screenshot.id,
      href: auditFileHref(report, screenshot.path),
      label: `${page.title ?? page.url} / ${screenshot.viewport} / ${screenshot.kind} / ${screenshot.width}x${screenshot.height}`
    }))
  );
}

function screenshotIndex(report: AuditReport) {
  const index = new Map<string, { id: string; href: string; label: string }>();
  for (const page of report.pages) {
    for (const screenshot of Object.values(page.screenshots)) {
      const href = auditFileHref(report, screenshot.path);
      const labelText = `${page.title ?? page.url} / ${screenshot.viewport} / ${screenshot.kind}`;
      index.set(screenshot.id, { id: screenshot.id, href, label: labelText });
      index.set(screenshot.path, { id: screenshot.id, href, label: labelText });
    }
  }
  for (const annotation of report.screenshotAnnotations) {
    const href = auditFileHref(report, annotation.annotatedScreenshot.path);
    const id = annotation.annotatedScreenshot.id ?? annotation.annotationId;
    index.set(id, { id, href, label: annotation.label });
    index.set(annotation.annotatedScreenshot.path, { id, href, label: annotation.label });
  }
  return index;
}

function reportFileHref(report: AuditReport, file: string) {
  return `${auditBaseHref(report)}/report/${file}`;
}

function issueSheetHref(report: AuditReport, issueId: string) {
  return reportFileHref(report, `contact-sheets/issues/${issueId}.png`);
}

function pageFirstViewportSheetHref(report: AuditReport, pageId: string) {
  return reportFileHref(report, `contact-sheets/pages/${pageId}-first-viewports.png`);
}

function pageFlowSheetHref(report: AuditReport, pageId: string) {
  return reportFileHref(report, `contact-sheets/pages/${pageId}-flow.png`);
}

function totalScreenshotCount(report: AuditReport) {
  return report.pages.reduce((count, page) => count + Object.keys(page.screenshots).length, 0);
}

function evidenceCompletenessLabel(report: AuditReport) {
  const missing = [
    ...report.findings.flatMap((finding) => missingScreenshotRefsFor(report, finding.evidence.screenshotRefs)),
    ...report.groupedIssues.flatMap((issue) => missingScreenshotRefsFor(report, issue.evidenceRefs)),
    ...(report.agentVisualReview?.visualFindings.flatMap((finding) => missingScreenshotRefsFor(report, finding.evidenceRefs)) ?? [])
  ];
  return missing.length === 0 ? "Evidence complete" : `${new Set(missing).size} missing refs`;
}

function auditFileHref(report: AuditReport, file: string) {
  return `${auditBaseHref(report)}/${file}`;
}

function auditRootFor(report: AuditReport) {
  return report.auditRoot ?? `audit-reports/${siteSlug(report.config.url)}/${report.auditId}`;
}

function auditBaseHref(report: AuditReport) {
  return report.publicBasePath ?? `/projects/${siteSlug(report.config.url)}/audits/${report.auditId}`;
}

function summarizeHistory(history: AuditSummary[]) {
  const scored = history.filter((item) => typeof item.score === "number");
  const averageScore = scored.length > 0 ? Math.round(scored.reduce((sum, item) => sum + (item.score ?? 0), 0) / scored.length) : null;
  return {
    total: history.length,
    sites: new Set(history.map((item) => item.site)).size,
    totalFindings: history.reduce((sum, item) => sum + (item.findings ?? 0), 0),
    averageScore
  };
}

function topCounts(values: string[], limit: number) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function scoreBand(score: number) {
  if (score >= 85) return "strong";
  if (score >= 70) return "mixed";
  return "risk";
}

function formatRunLabel(item: AuditSummary) {
  const date = item.generatedAt ? formatDate(item.generatedAt) : item.audit;
  return item.auditId ? `${date} / ${item.auditId}` : date;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function businessGradeLabel(status: AuditReport["businessGradeStatus"]) {
  if (status === "business_grade") return "Business grade passed";
  if (status === "agent_review_pending") return "Agent review pending";
  return "Automated scan";
}

function label(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function siteSlug(url: string) {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function toProjectHref(value: string, report: AuditReport) {
  const publicMarker = `${auditBaseHref(report)}/`;
  const publicIndex = value.indexOf(publicMarker);
  if (publicIndex >= 0) {
    return value.slice(publicIndex);
  }
  if (report.auditRoot) {
    const normalizedValue = value.replace(/\\/g, "/");
    const normalizedRoot = report.auditRoot.replace(/\\/g, "/");
    const rootIndex = normalizedValue.indexOf(`${normalizedRoot}/`);
    if (rootIndex >= 0) {
      return `${auditBaseHref(report)}/${normalizedValue.slice(rootIndex + normalizedRoot.length + 1)}`;
    }
  }
  return value;
}

createRoot(document.getElementById("root")!).render(<App />);
