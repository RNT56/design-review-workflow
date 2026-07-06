import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createAuditConfig, readProjectIndex, runAudit, validateReport, type AuditReport } from "../../../packages/core/src/index.js";

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
        job.report = result.report;
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
    const reportPath = path.join(workspaceRoot, "projects", req.params.site, "audits", req.params.audit, "report", "report.json");
    const report = validateReport(JSON.parse(await readFile(reportPath, "utf8")));
    res.json(report);
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
      audit: audit.auditId,
      reportPath: `/projects/${audit.site}/audits/${audit.auditId}/report/report.json`,
      htmlPath: `/projects/${audit.site}/audits/${audit.auditId}/report/report.html`,
      pdfPath: `/projects/${audit.site}/audits/${audit.auditId}/report/report.pdf`,
      workflowManifestPath: `/projects/${audit.site}/audits/${audit.auditId}/report/workflow-manifest.json`,
      handoffPath: `/projects/${audit.site}/audits/${audit.auditId}/report/handoff.json`,
      validationPath: `/projects/${audit.site}/audits/${audit.auditId}/report/validation.json`,
      agentPlanPath: `/projects/${audit.site}/audits/${audit.auditId}/report/agent-execution-plan.md`,
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
    generatedAt?: string;
    score?: number;
    findings?: number;
  }> = [];

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
        reportPath: `/projects/${site}/audits/${audit}/report/report.json`,
        htmlPath: `/projects/${site}/audits/${audit}/report/report.html`,
        pdfPath: `/projects/${site}/audits/${audit}/report/report.pdf`,
        workflowManifestPath: `/projects/${site}/audits/${audit}/report/workflow-manifest.json`,
        handoffPath: `/projects/${site}/audits/${audit}/report/handoff.json`,
        validationPath: `/projects/${site}/audits/${audit}/report/validation.json`,
        agentPlanPath: `/projects/${site}/audits/${audit}/report/agent-execution-plan.md`,
        generatedAt,
        score,
        findings
      });
    }
  }

  return audits.sort((a, b) => (b.generatedAt ?? "").localeCompare(a.generatedAt ?? ""));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
