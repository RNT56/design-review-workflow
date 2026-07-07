import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type AuditSummary = {
  site: string;
  audit: string;
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
    screenshotsReviewed: string[];
    pageReviews: Array<{
      pageId: string;
      url: string;
      screenshotsReviewed: string[];
      firstViewport: string;
      hierarchy: string;
      navigation: string;
      mobile: string;
      trustAndProof: string;
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

function App() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"quick_scan" | "full_audit">("quick_scan");
  const [maxPages, setMaxPages] = useState(6);
  const [websiteGoal, setWebsiteGoal] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<AuditSummary[]>([]);
  const [selected, setSelected] = useState<AuditReport | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "findings" | "implementation" | "evidence" | "agentReview" | "agent">("overview");
  const [evidenceView, setEvidenceView] = useState<"pages" | "issues" | "agent" | "raw">("pages");
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
    <main className="shell">
      <section className="toolbar">
        <div>
          <h1>Website Design Review</h1>
          <p>Local evidence capture, structured findings, scorecard, and reports.</p>
        </div>
        <button type="button" onClick={() => void refreshHistory()}>Refresh</button>
      </section>

      <section className="workspace">
        <form className="audit-form" onSubmit={(event) => void startAudit(event)}>
          <label>
            URL
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" required />
          </label>

          <div className="segmented" role="group" aria-label="Audit mode">
            <button type="button" className={mode === "quick_scan" ? "active" : ""} onClick={() => { setMode("quick_scan"); setMaxPages(6); }}>Quick Scan</button>
            <button type="button" className={mode === "full_audit" ? "active" : ""} onClick={() => { setMode("full_audit"); setMaxPages(15); }}>Full Audit</button>
          </div>

          <label>
            Max pages
            <input type="number" min={1} max={15} value={maxPages} onChange={(event) => setMaxPages(Number(event.target.value))} />
          </label>

          <label>
            Website goal
            <input value={websiteGoal} onChange={(event) => setWebsiteGoal(event.target.value)} placeholder="Optional" />
          </label>

          <button type="submit" className="primary" disabled={job?.status === "running"}>Start Audit</button>

          {job && (
            <div className={`job job--${job.status}`}>
              <strong>{job.status}</strong>
              <span>{job.error ?? latestProgress?.message ?? "Waiting for progress"}</span>
              {latestProgress?.current && latestProgress.total ? <span>{latestProgress.current}/{latestProgress.total}</span> : null}
            </div>
          )}
        </form>

        <aside className="history">
          <h2>Project History</h2>
          {history.length === 0 ? <p>No completed audits yet.</p> : null}
          {history.map((item) => (
            <button type="button" className="history-row" key={`${item.site}-${item.audit}`} onClick={() => void openHistory(item)}>
              <span>{item.site}</span>
              <strong>{item.score ?? "-"} / 100</strong>
              <small>{item.findings ?? 0} findings</small>
            </button>
          ))}
        </aside>
      </section>

      {selected ? (
        <section className="report">
          <div className="report-header">
            <div>
              <h2>{selected.config.url}</h2>
              <p>{selected.websiteType} / {selected.websiteTypeConfidence} confidence / {selected.generatedAt}</p>
              <span className={`status-badge status-badge--${selected.businessGradeStatus}`}>{label(selected.businessGradeStatus)}</span>
            </div>
            <div className="exports">
              <a href={`/projects/${siteSlug(selected.config.url)}/audits/${selected.auditId}/report/report.html`} target="_blank" rel="noreferrer">HTML</a>
              {selected.config.outputs?.pdf !== false ? <a href={`/projects/${siteSlug(selected.config.url)}/audits/${selected.auditId}/report/report.pdf`} target="_blank" rel="noreferrer">PDF</a> : null}
              <a href={`/projects/${siteSlug(selected.config.url)}/audits/${selected.auditId}/report/report.json`} target="_blank" rel="noreferrer">JSON</a>
              <a href={`/projects/${siteSlug(selected.config.url)}/audits/${selected.auditId}/report/handoff.json`} target="_blank" rel="noreferrer">Handoff</a>
              <a href={`/projects/${siteSlug(selected.config.url)}/audits/${selected.auditId}/report/workflow-manifest.json`} target="_blank" rel="noreferrer">Manifest</a>
              <a href={`/projects/${siteSlug(selected.config.url)}/audits/${selected.auditId}/report/agent-execution-plan.md`} target="_blank" rel="noreferrer">Plan</a>
            </div>
          </div>

          <div className="score-strip">
            <div className="score-main"><span>Overall</span><strong>{selected.scorecard.overallScore}</strong></div>
            <div className="score-cell"><span>Business Grade</span><strong>{selected.businessGradeStatus === "business_grade" ? "Pass" : "No"}</strong></div>
            {Object.entries(selected.scorecard.subscores).map(([key, value]) => (
              <div className="score-cell" key={key}><span>{label(key)}</span><strong>{value.score}</strong></div>
            ))}
          </div>

          <nav className="tabs" aria-label="Report sections">
            {reportTabs(selected).map((tab) => (
              <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
                {label(tab)}
              </button>
            ))}
          </nav>

          {activeTab === "overview" ? (
            <div className="report-grid">
              <section>
                <h3>Priority Issues</h3>
                <div className="findings">
                  {sortedIssues.length > 0
                    ? sortedIssues.slice(0, 5).map((issue) => <IssueCard issue={issue} report={selected} key={issue.issueId} />)
                    : sortedFindings.slice(0, 5).map((finding) => <FindingCard report={selected} finding={finding} key={finding.findingId} />)}
                </div>
              </section>

              <section>
                <h3>Redesign Briefing</h3>
                <div className="briefing">
                  {selected.redesignBriefing.map((section) => (
                    <section key={section.title}>
                      <h4>{section.title}</h4>
                      <p>{section.body}</p>
                    </section>
                  ))}
                </div>

                <h3>Quick Wins</h3>
                <div className="annotation-list">
                  {selected.quickWins.slice(0, 6).map((finding) => (
                    <span className="note-row" key={finding.findingId}>{finding.title}</span>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "findings" ? (
            <section>
              <h3>Findings</h3>
              <div className="findings">
                {sortedFindings.map((finding) => (
                  <FindingCard report={selected} finding={finding} key={finding.findingId} />
                ))}
              </div>
            </section>
          ) : null}

          {activeTab === "implementation" ? (
            <div className="report-grid">
              <section>
                <h3>Implementation Queue</h3>
                <div className="queue">
                  {selected.tickets.map((ticket, index) => (
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
                </div>
              </section>

              <section>
                <h3>Implementation Files</h3>
                <div className="artifact-grid">
                  {artifactLinks(selected).filter((item) => ["Implementation Plan", "Patch Plan", "Changed Files", "Source Candidates", "Repo Analysis"].includes(item.label)).map((item) => (
                    <a key={item.label} href={item.href} target="_blank" rel="noreferrer">{item.label}</a>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "evidence" ? (
            <div>
              <section className="evidence-summary">
                <span>{selected.agentVisualReview ? "Reviewed by agent" : "Agent visual review pending"}</span>
                <span>{totalScreenshotCount(selected)} screenshots</span>
                <span>{selected.groupedIssues.length} grouped issues</span>
                <span>{evidenceCompletenessLabel(selected)}</span>
              </section>

              <div className="evidence-actions">
                <div className="segmented evidence-segmented" role="group" aria-label="Evidence view">
                  <button type="button" className={evidenceView === "pages" ? "active" : ""} onClick={() => setEvidenceView("pages")}>Page Evidence</button>
                  <button type="button" className={evidenceView === "issues" ? "active" : ""} onClick={() => setEvidenceView("issues")}>Issue Evidence</button>
                  <button type="button" className={evidenceView === "agent" ? "active" : ""} onClick={() => setEvidenceView("agent")}>Agent Review Evidence</button>
                  <button type="button" className={evidenceView === "raw" ? "active" : ""} onClick={() => setEvidenceView("raw")}>Raw Screenshots</button>
                </div>
                <div className="artifact-grid evidence-link-grid">
                  {reviewPackLinks(selected).map((item) => (
                    <a key={item.label} href={item.href} target="_blank" rel="noreferrer">{item.label}</a>
                  ))}
                </div>
              </div>

              {evidenceView === "pages" ? (
                <div className="report-grid">
                  <section>
                    <h3>Page Evidence</h3>
                    <div className="page-list">
                      {selected.pages.map((page) => (
                        <article className="page-card" key={page.pageId}>
                          <div className="finding-meta">
                            <span>{page.pageType}</span>
                            <span>{page.businessImportance}</span>
                            <span>{Object.keys(page.screenshots).length} screenshots</span>
                          </div>
                          <h4><a href={page.url} target="_blank" rel="noreferrer">{page.title ?? page.url}</a></h4>
                          <div className="evidence-sheet-links">
                            <a href={pageFirstViewportSheetHref(selected, page.pageId)} target="_blank" rel="noreferrer">First viewport sheet</a>
                            <a href={pageFlowSheetHref(selected, page.pageId)} target="_blank" rel="noreferrer">Page flow sheet</a>
                          </div>
                          <ScreenshotDrawer report={selected} refs={Object.keys(page.screenshots)} title="Raw page screenshots" />
                        </article>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3>Evidence Files</h3>
                    <div className="artifact-grid">
                      {artifactLinks(selected).filter((item) => ["Evidence Index", "Evidence JSONL", "Visual System", "Route Templates", "Experience Timing", "Annotations"].includes(item.label)).map((item) => (
                        <a key={item.label} href={item.href} target="_blank" rel="noreferrer">{item.label}</a>
                      ))}
                    </div>

                    {selected.competitorBenchmarks.length > 0 ? (
                      <>
                        <h3>Competitors</h3>
                        <table>
                          <thead><tr><th>Competitor</th><th>Score</th><th>Pages</th></tr></thead>
                          <tbody>
                            {selected.competitorBenchmarks.map((competitor) => (
                              <tr key={competitor.competitorUrl}>
                                <td><a href={competitor.competitorUrl} target="_blank" rel="noreferrer">{new URL(competitor.competitorUrl).hostname}</a></td>
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
                  <h3>Issue Evidence</h3>
                  <div className="findings">
                    {sortedIssues.length > 0 ? sortedIssues.map((issue) => <IssueCard issue={issue} report={selected} key={issue.issueId} />) : <p className="muted">No grouped issues are available for this audit.</p>}
                  </div>
                </section>
              ) : null}

              {evidenceView === "agent" ? (
                <section>
                  <h3>Agent Review Evidence</h3>
                  {selected.agentVisualReview ? (
                    <div className="page-list">
                      <article className="review-summary">
                        <div className="finding-meta">
                          <span>{selected.agentVisualReview.reviewer}</span>
                          <span>{selected.agentVisualReview.confidence} confidence</span>
                          <span>{selected.agentVisualReview.screenshotsReviewed.length} reviewed screenshots</span>
                        </div>
                        <ScreenshotDrawer report={selected} refs={selected.agentVisualReview.screenshotsReviewed} title="Agent reviewed screenshots" />
                      </article>
                      {selected.agentVisualReview.visualFindings.map((finding) => (
                        <article className="finding" key={finding.reviewId}>
                          <div className="finding-meta">
                            <span>{finding.severity}</span>
                            <span>{finding.category}</span>
                            <span>{finding.confidence}</span>
                          </div>
                          <h4>{finding.title}</h4>
                          <p>{finding.observation}</p>
                          <p><strong>Recommendation:</strong> {finding.recommendation}</p>
                          <ScreenshotDrawer report={selected} refs={finding.evidenceRefs} title="Agent finding screenshots" />
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">Agent visual review has not been imported. Build the review pack, inspect the gallery and PNG sheets, then import a validated visual-review JSON.</p>
                  )}
                </section>
              ) : null}

              {evidenceView === "raw" ? (
                <section>
                  <h3>Raw Screenshots</h3>
                  <div className="raw-shot-grid">
                    {allScreenshots(selected).map((screenshot) => (
                      <a className="shot" key={screenshot.id} href={screenshot.href} target="_blank" rel="noreferrer">
                        <img src={screenshot.href} alt={screenshot.label} loading="lazy" />
                        <span>{screenshot.label}</span>
                      </a>
                    ))}
                  </div>

                  {selected.screenshotAnnotations.length > 0 ? (
                    <>
                      <h3>Annotations</h3>
                      <div className="annotation-list">
                        {selected.screenshotAnnotations.slice(0, 8).map((annotation) => (
                          <a key={annotation.annotationId} href={`/projects/${siteSlug(selected.config.url)}/audits/${selected.auditId}/${annotation.annotatedScreenshot.path}`} target="_blank" rel="noreferrer">
                            {annotation.label}
                          </a>
                        ))}
                      </div>
                    </>
                  ) : null}
                </section>
              ) : null}
            </div>
          ) : null}

          {activeTab === "agentReview" && selected.agentVisualReview ? (
            <div className="report-grid">
              <section>
                <h3>Agent Review</h3>
                <article className="review-summary">
                  <div className="finding-meta">
                    <span>{selected.agentVisualReview.reviewer}</span>
                    <span>{selected.agentVisualReview.confidence} confidence</span>
                    <span>{selected.agentVisualReview.screenshotsReviewed.length} screenshots</span>
                  </div>
                  <p>{selected.agentVisualReview.reviewedAt}</p>
                  <ScreenshotDrawer report={selected} refs={selected.agentVisualReview.screenshotsReviewed} title="Reviewed screenshots" />
                </article>
                <div className="page-list">
                  {selected.agentVisualReview.pageReviews.map((review) => (
                    <article className="page-card" key={review.pageId}>
                      <h4>{review.url}</h4>
                      <p><strong>First viewport:</strong> {review.firstViewport}</p>
                      <p><strong>Hierarchy:</strong> {review.hierarchy}</p>
                      <p><strong>Navigation:</strong> {review.navigation}</p>
                      <p><strong>Mobile:</strong> {review.mobile}</p>
                      <p><strong>Trust and proof:</strong> {review.trustAndProof}</p>
                      <ScreenshotDrawer report={selected} refs={review.screenshotsReviewed} title="Page review screenshots" />
                    </article>
                  ))}
                </div>
              </section>

              <section>
                <h3>Visual Findings</h3>
                <div className="findings">
                  {selected.agentVisualReview.visualFindings.map((finding) => (
                    <article className="finding" key={finding.reviewId}>
                      <div className="finding-meta">
                        <span>{finding.severity}</span>
                        <span>{finding.category}</span>
                        <span>{finding.confidence}</span>
                      </div>
                      <h4>{finding.title}</h4>
                      <p>{finding.observation}</p>
                      <p><strong>Recommendation:</strong> {finding.recommendation}</p>
                      <ScreenshotDrawer report={selected} refs={finding.evidenceRefs} title="Agent evidence screenshots" />
                    </article>
                  ))}
                </div>

                <h3>Strengths And Risks</h3>
                <div className="briefing">
                  <section>
                    <h4>Strengths</h4>
                    <ul>{selected.agentVisualReview.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
                  </section>
                  <section>
                    <h4>Risks</h4>
                    <ul>{selected.agentVisualReview.risks.map((item) => <li key={item}>{item}</li>)}</ul>
                  </section>
                  {selected.agentVisualReview.limitations.length > 0 ? (
                    <section>
                      <h4>Limitations</h4>
                      <ul>{selected.agentVisualReview.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
                    </section>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}

          {activeTab === "agent" ? (
            <div className="report-grid">
              <section>
                <h3>Agent Bundle</h3>
                <div className="artifact-grid">
                  {artifactLinks(selected).map((item) => (
                    <a key={item.label} href={item.href} target="_blank" rel="noreferrer">{item.label}</a>
                  ))}
                </div>
              </section>

              <section>
                <h3>Exports</h3>
                {selected.ticketExports ? (
                  <div className="artifact-grid">
                    {Object.entries(selected.ticketExports).map(([key, value]) => (
                      <a key={key} href={toProjectHref(value, selected)} target="_blank" rel="noreferrer">{label(key)}</a>
                    ))}
                  </div>
                ) : <p>No ticket exports found.</p>}

                <h3>Closeout Commands</h3>
                <pre className="command-block">{`node apps/cli/dist/index.js report lint ${auditRootFor(selected)} --strict
node apps/cli/dist/index.js review-pack build --report ${auditRootFor(selected)}
node apps/cli/dist/index.js agent-review import --report ${auditRootFor(selected)} --file agent-runs/<agent>/visual-review.json
node apps/cli/dist/index.js business-grade lint --report ${auditRootFor(selected)}
node apps/cli/dist/index.js benchmark --report ${auditRootFor(selected)}
node apps/cli/dist/index.js plan build --report ${auditRootFor(selected)}`}</pre>
              </section>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function IssueCard({ issue, report }: { issue: AuditReport["groupedIssues"][number]; report: AuditReport }) {
  return (
    <article className="finding issue">
      <div className="finding-meta">
        <span>{issue.severity}</span>
        <span>{issue.category}</span>
        <span>{issue.source}</span>
        <span>{issue.priorityScore}</span>
      </div>
      <h4>{issue.title}</h4>
      <p>{issue.observation}</p>
      <p><strong>Recommendation:</strong> {issue.recommendation}</p>
      <p><strong>Affected:</strong> {issue.affectedPages.map((page) => page.section ? `${page.url} (${page.section})` : page.url).join(", ")}</p>
      <div className="evidence-sheet-links">
        <a href={issueSheetHref(report, issue.issueId)} target="_blank" rel="noreferrer">Issue evidence sheet</a>
      </div>
      <ul>
        {issue.acceptanceCriteria.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
      </ul>
      <ScreenshotDrawer report={report} refs={issue.evidenceRefs} title="Issue evidence screenshots" />
    </article>
  );
}

function FindingCard({ finding, report }: { finding: AuditReport["findings"][number]; report: AuditReport }) {
  return (
    <article className="finding">
      <div className="finding-meta">
        <span>{finding.severity}</span>
        <span>{finding.category}</span>
        <span>{finding.source ?? "deterministic"}</span>
        <span>{finding.priorityScore}</span>
      </div>
      <h4>{finding.title}</h4>
      <p>{finding.observation}</p>
      <p><strong>Recommendation:</strong> {finding.recommendation}</p>
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
      <summary>{title} ({screenshots.length || refs.length})</summary>
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

function reportTabs(report: AuditReport): Array<"overview" | "findings" | "implementation" | "evidence" | "agentReview" | "agent"> {
  const tabs: Array<"overview" | "findings" | "implementation" | "evidence" | "agentReview" | "agent"> = ["overview", "findings", "implementation", "evidence"];
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
  return `/projects/${siteSlug(report.config.url)}/audits/${report.auditId}/report/${file}`;
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
  return `/projects/${siteSlug(report.config.url)}/audits/${report.auditId}/${file}`;
}

function auditRootFor(report: AuditReport) {
  return `projects/${siteSlug(report.config.url)}/audits/${report.auditId}`;
}

function label(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function siteSlug(url: string) {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function toProjectHref(value: string, report: AuditReport) {
  const marker = `/projects/${siteSlug(report.config.url)}/audits/${report.auditId}/`;
  const index = value.indexOf(marker);
  if (index >= 0) {
    return value.slice(index);
  }
  return value;
}

createRoot(document.getElementById("root")!).render(<App />);
