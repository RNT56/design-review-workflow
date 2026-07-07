import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { configuredAuditRoot, createAuditConfig, readProjectIndex, runAudit, validateReport, type AuditReport } from "../../../packages/core/src/index.js";

type Job = {
  id: string;
  status: "running" | "completed" | "failed";
  progress: Array<{ stage: string; message: string; current?: number; total?: number; at: string }>;
  auditRoot?: string;
  report?: AuditReport;
  error?: string;
};

const workspaceRoot = path.resolve(process.cwd());
const app = express();
const jobs = new Map<string, Job>();

app.use(express.json({ limit: "1mb" }));
app.use("/audit-reports", express.static(configuredAuditRoot(undefined, workspaceRoot)));
app.use("/projects", express.static(path.join(workspaceRoot, "projects")));

app.post("/api/audits", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const config = createAuditConfig({
      url: String(body.url ?? ""),
      mode: body.mode === "full_audit" ? "full_audit" : "quick_scan",
      maxPages: typeof body.maxPages === "number" ? body.maxPages : undefined,
      websiteGoal: stringValue(body.websiteGoal),
      targetAudience: stringValue(body.targetAudience),
      industry: stringValue(body.industry),
      brandContext: stringValue(body.brandContext),
      competitors: Array.isArray(body.competitors) ? body.competitors.map(String).filter(Boolean) : []
    });

    const job: Job = {
      id: config.auditId,
      status: "running",
      progress: [{ stage: "queued", message: "Audit queued", at: new Date().toISOString() }]
    };
    jobs.set(job.id, job);

    void runAudit(config, {
      workspaceRoot,
      onProgress: (event) => {
        job.progress.push({ ...event, at: new Date().toISOString() });
      }
    })
      .then((result) => {
        job.status = "completed";
        job.auditRoot = result.auditRoot;
        job.report = attachPublicBase(result.report, result.auditRoot);
      })
      .catch((error) => {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : String(error);
      });

    res.status(202).json({ jobId: job.id });
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
  res.json(job);
});

app.get("/api/audits", async (_req, res) => {
  res.json(await listAudits());
});

app.get("/api/audits/:site/:audit/report", async (req, res) => {
  try {
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
app.listen(port, () => {
  console.log(`Website Design Review UI: http://localhost:${port}`);
});

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
