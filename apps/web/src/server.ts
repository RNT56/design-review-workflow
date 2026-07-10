import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { assertSafeAuditTarget, configuredAuditRoot, createAuditConfig, readProjectIndex, runAudit, validateRedirectChain, validateReport, type AuditConfig, type AuditReport } from "../../../packages/core/src/index.js";

type Job = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  progress: Array<{ stage: string; message: string; current?: number; total?: number; at: string }>;
  auditRoot?: string;
  report?: AuditReport;
  error?: string;
  controller: AbortController;
};

const workspaceRoot = path.resolve(process.cwd());
const app = express();
const jobs = new Map<string, Job>();
const jobConfigs = new Map<string, AuditConfig>();
const queue: string[] = [];
const maxConcurrentJobs = clamp(Number(process.env.DESIGN_REVIEW_MAX_CONCURRENT_JOBS ?? 2), 1, 8);
const maxRetainedJobs = clamp(Number(process.env.DESIGN_REVIEW_MAX_RETAINED_JOBS ?? 200), 20, 2000);
let runningJobs = 0;
const rateWindows = new Map<string, { startedAt: number; count: number }>();

app.use(express.json({ limit: "1mb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  next();
});
app.use("/audit-reports", express.static(configuredAuditRoot(undefined, workspaceRoot), { dotfiles: "deny" }));
app.use("/projects", express.static(path.join(workspaceRoot, "projects"), { dotfiles: "deny" }));

app.post("/api/audits", async (req, res) => {
  try {
    if (!consumeRateLimit(req.ip ?? req.socket.remoteAddress ?? "unknown")) {
      res.status(429).json({ error: "Audit start rate limit exceeded. Try again shortly." });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const requestedUrl = String(body.url ?? "");
    const competitors = Array.isArray(body.competitors) ? body.competitors.map(String).filter(Boolean).slice(0, 3) : [];
    await assertSafeAuditTarget(requestedUrl);
    await validateRedirectChain(requestedUrl);
    for (const competitor of competitors) {
      await assertSafeAuditTarget(competitor);
      await validateRedirectChain(competitor);
    }
    const config = createAuditConfig({
      url: requestedUrl,
      mode: body.mode === "full_audit" ? "full_audit" : "quick_scan",
      maxPages: typeof body.maxPages === "number" ? clamp(body.maxPages, 1, 15) : undefined,
      websiteGoal: stringValue(body.websiteGoal),
      targetAudience: stringValue(body.targetAudience),
      industry: stringValue(body.industry),
      brandContext: stringValue(body.brandContext),
      competitors
    });

    const job: Job = {
      id: config.auditId,
      status: "queued",
      createdAt: new Date().toISOString(),
      controller: new AbortController(),
      progress: [{ stage: "queued", message: "Audit queued", at: new Date().toISOString() }]
    };
    jobs.set(job.id, job);
    jobConfigs.set(job.id, config);
    queue.push(job.id);
    pruneJobs();
    startQueuedJobs();

    res.status(202).json({ jobId: job.id, status: job.status });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(publicJob(job));
});

app.delete("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    res.status(409).json({ error: `Job is already ${job.status}.` });
    return;
  }
  job.status = "cancelled";
  job.progress.push({ stage: "cancelled", message: "Audit cancelled", at: new Date().toISOString() });
  job.controller.abort();
  const queueIndex = queue.indexOf(job.id);
  if (queueIndex >= 0) {
    queue.splice(queueIndex, 1);
    jobConfigs.delete(job.id);
  }
  res.status(202).json(publicJob(job));
});

app.get("/api/audits", async (_req, res) => {
  res.json(await listAudits());
});

app.get("/api/audits/:site/:audit/report", async (req, res) => {
  try {
    if (!safePathSegment(req.params.site) || !safePathSegment(req.params.audit)) {
      res.status(400).json({ error: "Invalid audit path." });
      return;
    }
    const index = await readProjectIndex(workspaceRoot);
    const entry = index.audits.find(
      (audit) => audit.site === req.params.site && (audit.auditId === req.params.audit || path.basename(audit.auditRoot) === req.params.audit)
    );
    const auditRoot =
      entry?.auditRoot ??
      (await firstExistingDirectory([
        path.join(configuredAuditRoot(undefined, workspaceRoot), req.params.site, req.params.audit),
        path.join(workspaceRoot, "projects", req.params.site, "audits", req.params.audit)
      ]));
    const reportPath = entry?.reportJson ?? path.join(auditRoot ?? "", "report", "report.json");
    const report = validateReport(JSON.parse(await readFile(reportPath, "utf8")));
    res.json(attachPublicBase(report, auditRoot ?? path.dirname(path.dirname(reportPath))));
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

const isProduction = process.env.NODE_ENV === "production";
if (isProduction) {
  app.use(express.static(path.join(workspaceRoot, "apps", "web", "dist", "client")));
  app.use((req, res, next) => {
    if (req.method !== "GET") {
      next();
      return;
    }
    res.sendFile(path.join(workspaceRoot, "apps", "web", "dist", "client", "index.html"));
  });
} else {
  const vite = await createViteServer({
    root: path.join(workspaceRoot, "apps", "web"),
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? "127.0.0.1";
if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") {
  throw new Error("The local audit UI must bind to a loopback host. Use 127.0.0.1, ::1, or localhost.");
}
app.listen(port, host, () => {
  console.log(`Website Design Review UI: http://${host}:${port}`);
});

function startQueuedJobs(): void {
  while (runningJobs < maxConcurrentJobs && queue.length > 0) {
    const id = queue.shift();
    const job = id ? jobs.get(id) : undefined;
    const config = id ? jobConfigs.get(id) : undefined;
    if (!job || !config || job.status !== "queued") continue;
    runningJobs += 1;
    job.status = "running";
    job.progress.push({ stage: "start", message: "Audit worker started", at: new Date().toISOString() });
    void runAudit(config, {
      workspaceRoot,
      signal: job.controller.signal,
      validateNavigation: async (url) => { await assertSafeAuditTarget(url); },
      onProgress: (event) => job.progress.push({ ...event, at: new Date().toISOString() })
    }).then((result) => {
      if (job.status === "cancelled") return;
      job.status = "completed";
      job.auditRoot = result.auditRoot;
      job.report = attachPublicBase(result.report, result.auditRoot);
    }).catch((error) => {
      if (job.controller.signal.aborted) {
        job.status = "cancelled";
        return;
      }
      job.status = "failed";
      job.error = error instanceof Error ? error.message : String(error);
    }).finally(() => {
      runningJobs -= 1;
      jobConfigs.delete(job.id);
      startQueuedJobs();
    });
  }
}

function publicJob(job: Job) {
  const { controller: _controller, ...publicFields } = job;
  return publicFields;
}

function consumeRateLimit(key: string): boolean {
  const now = Date.now();
  const window = rateWindows.get(key);
  if (!window || now - window.startedAt >= 60_000) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  window.count += 1;
  return window.count <= 10;
}

function pruneJobs(): void {
  if (jobs.size <= maxRetainedJobs) return;
  const finished = [...jobs.values()].filter((job) => ["completed", "failed", "cancelled"].includes(job.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const job of finished.slice(0, Math.max(0, jobs.size - maxRetainedJobs))) jobs.delete(job.id);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? Math.round(value) : minimum));
}

function safePathSegment(value: string): boolean {
  return value !== "." && value !== ".." && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
}

async function listAudits() {
  const indexed = await readProjectIndex(workspaceRoot);
  if (indexed.audits.length > 0) {
    return indexed.audits.map((audit) => ({
      site: audit.site,
      audit: path.basename(audit.auditRoot) || audit.auditId,
      auditId: audit.auditId,
      auditRoot: audit.auditRoot,
      publicBasePath: publicBaseForAuditRoot(audit.auditRoot),
      reportPath: reportPublicPath(audit.auditRoot, "report/report.json"),
      htmlPath: reportPublicPath(audit.auditRoot, "report/report.html"),
      pdfPath: reportPublicPath(audit.auditRoot, "report/report.pdf"),
      workflowManifestPath: reportPublicPath(audit.auditRoot, "report/workflow-manifest.json"),
      handoffPath: reportPublicPath(audit.auditRoot, "report/handoff.json"),
      validationPath: reportPublicPath(audit.auditRoot, "report/validation.json"),
      agentPlanPath: reportPublicPath(audit.auditRoot, "report/agent-execution-plan.md"),
      sourceCandidatesPath: reportPublicPath(audit.auditRoot, "report/source-candidates.json"),
      repoAnalysisPath: reportPublicPath(audit.auditRoot, "report/repo-analysis.json"),
      patchPlanPath: reportPublicPath(audit.auditRoot, "report/patch-plan.md"),
      benchmarkPath: reportPublicPath(audit.auditRoot, "report/design-benchmark.json"),
      standardsPath: reportPublicPath(audit.auditRoot, "report/standards-registry.json"),
      visualSystemPath: reportPublicPath(audit.auditRoot, "report/visual-system.json"),
      generatedAt: audit.generatedAt,
      score: audit.overallScore,
      findings: audit.findings
    }));
  }

  const projectsRoot = path.join(workspaceRoot, "projects");
  const sites = await readdir(projectsRoot).catch(() => []);
  const audits: Array<{
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
    auditRoot?: string;
    publicBasePath?: string;
    generatedAt?: string;
    score?: number;
    findings?: number;
  }> = [];

  const auditReportsRoot = configuredAuditRoot(undefined, workspaceRoot);
  const auditReportSites = await readdir(auditReportsRoot).catch(() => []);
  for (const site of auditReportSites) {
    const siteRoot = path.join(auditReportsRoot, site);
    if (!(await stat(siteRoot).then((value) => value.isDirectory()).catch(() => false))) {
      continue;
    }
    const entries = await readdir(siteRoot).catch(() => []);
    for (const audit of entries) {
      const auditRoot = path.join(siteRoot, audit);
      if (!(await stat(auditRoot).then((value) => value.isDirectory()).catch(() => false))) {
        continue;
      }
      const reportPath = path.join(auditRoot, "report", "report.json");
      let generatedAt: string | undefined;
      let score: number | undefined;
      let findings: number | undefined;
      try {
        const report = validateReport(JSON.parse(await readFile(reportPath, "utf8")));
        generatedAt = report.generatedAt;
        score = report.scorecard.overallScore;
        findings = report.findings.length;
      } catch {
        continue;
      }
      audits.push({
        site,
        audit,
        auditRoot,
        publicBasePath: publicBaseForAuditRoot(auditRoot),
        reportPath: reportPublicPath(auditRoot, "report/report.json"),
        htmlPath: reportPublicPath(auditRoot, "report/report.html"),
        pdfPath: reportPublicPath(auditRoot, "report/report.pdf"),
        workflowManifestPath: reportPublicPath(auditRoot, "report/workflow-manifest.json"),
        handoffPath: reportPublicPath(auditRoot, "report/handoff.json"),
        validationPath: reportPublicPath(auditRoot, "report/validation.json"),
        agentPlanPath: reportPublicPath(auditRoot, "report/agent-execution-plan.md"),
        sourceCandidatesPath: reportPublicPath(auditRoot, "report/source-candidates.json"),
        repoAnalysisPath: reportPublicPath(auditRoot, "report/repo-analysis.json"),
        patchPlanPath: reportPublicPath(auditRoot, "report/patch-plan.md"),
        benchmarkPath: reportPublicPath(auditRoot, "report/design-benchmark.json"),
        standardsPath: reportPublicPath(auditRoot, "report/standards-registry.json"),
        visualSystemPath: reportPublicPath(auditRoot, "report/visual-system.json"),
        generatedAt,
        score,
        findings
      });
    }
  }

  for (const site of sites) {
    const auditsRoot = path.join(projectsRoot, site, "audits");
    const entries = await readdir(auditsRoot).catch(() => []);
    for (const audit of entries) {
      const auditRoot = path.join(auditsRoot, audit);
      if (!(await stat(auditRoot).then((value) => value.isDirectory()).catch(() => false))) {
        continue;
      }
      const reportPath = path.join(auditRoot, "report", "report.json");
      const htmlPath = path.join(auditRoot, "report", "report.html");
      const pdfPath = path.join(auditRoot, "report", "report.pdf");
      let generatedAt: string | undefined;
      let score: number | undefined;
      let findings: number | undefined;
      try {
        const report = validateReport(JSON.parse(await readFile(reportPath, "utf8")));
        generatedAt = report.generatedAt;
        score = report.scorecard.overallScore;
        findings = report.findings.length;
      } catch {
        continue;
      }
      audits.push({
        site,
        audit,
        auditRoot,
        publicBasePath: publicBaseForAuditRoot(auditRoot),
        reportPath: `/projects/${site}/audits/${audit}/report/report.json`,
        htmlPath: `/projects/${site}/audits/${audit}/report/report.html`,
        pdfPath: `/projects/${site}/audits/${audit}/report/report.pdf`,
        workflowManifestPath: `/projects/${site}/audits/${audit}/report/workflow-manifest.json`,
        handoffPath: `/projects/${site}/audits/${audit}/report/handoff.json`,
        validationPath: `/projects/${site}/audits/${audit}/report/validation.json`,
        agentPlanPath: `/projects/${site}/audits/${audit}/report/agent-execution-plan.md`,
        sourceCandidatesPath: `/projects/${site}/audits/${audit}/report/source-candidates.json`,
        repoAnalysisPath: `/projects/${site}/audits/${audit}/report/repo-analysis.json`,
        patchPlanPath: `/projects/${site}/audits/${audit}/report/patch-plan.md`,
        benchmarkPath: `/projects/${site}/audits/${audit}/report/design-benchmark.json`,
        standardsPath: `/projects/${site}/audits/${audit}/report/standards-registry.json`,
        visualSystemPath: `/projects/${site}/audits/${audit}/report/visual-system.json`,
        generatedAt,
        score,
        findings
      });
    }
  }

  return audits.sort((a, b) => (b.generatedAt ?? "").localeCompare(a.generatedAt ?? ""));
}

function attachPublicBase(report: AuditReport, auditRoot: string): AuditReport {
  return {
    ...report,
    auditRoot,
    publicBasePath: publicBaseForAuditRoot(auditRoot)
  } as AuditReport;
}

function reportPublicPath(auditRoot: string, file: string): string {
  const base = publicBaseForAuditRoot(auditRoot);
  return base ? `${base}/${file}` : file;
}

function publicBaseForAuditRoot(auditRoot: string): string | undefined {
  const resolved = path.resolve(auditRoot);
  const auditReportsRoot = configuredAuditRoot(undefined, workspaceRoot);
  const auditReportsRelative = path.relative(auditReportsRoot, resolved);
  if (isRelativeInside(auditReportsRelative)) {
    return `/audit-reports/${toUrlPath(auditReportsRelative)}`;
  }
  const legacyRoot = path.join(workspaceRoot, "projects");
  const legacyRelative = path.relative(legacyRoot, resolved);
  if (isRelativeInside(legacyRelative)) {
    return `/projects/${toUrlPath(legacyRelative)}`;
  }
  return undefined;
}

function isRelativeInside(value: string): boolean {
  return value !== "" && !value.startsWith("..") && !path.isAbsolute(value);
}

function toUrlPath(value: string): string {
  return value.split(path.sep).map(encodeURIComponent).join("/");
}

async function firstExistingDirectory(candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (await stat(candidate).then((value) => value.isDirectory()).catch(() => false)) {
      return candidate;
    }
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
