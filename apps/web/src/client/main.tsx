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

type AuditReport = {
  auditId: string;
  generatedAt: string;
  config: { url: string; mode: string; outputs?: { pdf?: boolean; html?: boolean; markdown?: boolean; json?: boolean } };
  websiteType: string;
  websiteTypeConfidence: string;
  pages: Array<{ pageId: string; url: string; pageType: string; businessImportance: string; title?: string }>;
  findings: Array<{
    findingId: string;
    title: string;
    category: string;
    severity: string;
    priorityScore: number;
    impact: string;
    effort: string;
    confidence: string;
    observation: string;
    recommendation: string;
    evidence: { url: string; section?: string; screenshotRefs: string[] };
  }>;
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
  screenshotAnnotations: Array<{ annotationId: string; label: string; annotatedScreenshot: { path: string } }>;
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
  const [activeTab, setActiveTab] = useState<"overview" | "findings" | "implementation" | "evidence" | "agent">("overview");
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
            {Object.entries(selected.scorecard.subscores).map(([key, value]) => (
              <div className="score-cell" key={key}><span>{label(key)}</span><strong>{value.score}</strong></div>
            ))}
          </div>

          <nav className="tabs" aria-label="Report sections">
            {(["overview", "findings", "implementation", "evidence", "agent"] as const).map((tab) => (
              <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
                {label(tab)}
              </button>
            ))}
          </nav>

          {activeTab === "overview" ? (
            <div className="report-grid">
              <section>
                <h3>Priority Findings</h3>
                <div className="findings">
                  {sortedFindings.slice(0, 5).map((finding) => (
                    <FindingCard finding={finding} key={finding.findingId} />
                  ))}
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
                  <FindingCard finding={finding} key={finding.findingId} />
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
            <div className="report-grid">
              <section>
                <h3>Pages</h3>
                <table>
                  <thead><tr><th>Type</th><th>Page</th><th>Importance</th></tr></thead>
                  <tbody>
                    {selected.pages.map((page) => (
                      <tr key={page.pageId}>
                        <td>{page.pageType}</td>
                        <td><a href={page.url} target="_blank" rel="noreferrer">{page.title ?? page.url}</a></td>
                        <td>{page.businessImportance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

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

              <section>
                <h3>Evidence Files</h3>
                <div className="artifact-grid">
                  {artifactLinks(selected).filter((item) => ["Evidence Index", "Evidence JSONL", "Visual System", "Route Templates", "Experience Timing", "Annotations"].includes(item.label)).map((item) => (
                    <a key={item.label} href={item.href} target="_blank" rel="noreferrer">{item.label}</a>
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

function FindingCard({ finding }: { finding: AuditReport["findings"][number] }) {
  return (
    <article className="finding">
      <div className="finding-meta">
        <span>{finding.severity}</span>
        <span>{finding.category}</span>
        <span>{finding.priorityScore}</span>
      </div>
      <h4>{finding.title}</h4>
      <p>{finding.observation}</p>
      <p><strong>Recommendation:</strong> {finding.recommendation}</p>
      <small>{finding.evidence.url} / {finding.evidence.section ?? "section unspecified"}</small>
    </article>
  );
}

function artifactLinks(report: AuditReport) {
  return [
    ["Manifest", "workflow-manifest.json"],
    ["Handoff", "handoff.json"],
    ["Validation", "validation.json"],
    ["Quality Gate", "quality-gate.json"],
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

function reportFileHref(report: AuditReport, file: string) {
  return `/projects/${siteSlug(report.config.url)}/audits/${report.auditId}/report/${file}`;
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
