import { createServer } from "node:http";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createAuditConfig } from "../config/defaults.js";
import { runAudit } from "../index.js";
import { lintAuditReport } from "../validation/report-lint.js";
import { enterpriseFixtureCorpus } from "./fixtures.js";

export type EnterpriseFixtureEvalResult = {
  schemaVersion: "design-review-workflow.enterprise-fixture-eval.v1";
  status: "pass" | "fail";
  generatedAt: string;
  retained: boolean;
  auditRoot?: string;
  summary: { fixtures: number; pages: number; checks: number; failures: number };
  checks: Array<{ name: string; status: "pass" | "fail"; message: string }>;
};

export async function runEnterpriseFixtureEvals(outputRoot?: string): Promise<EnterpriseFixtureEvalResult> {
  const fixtureServer = await startFixtureServer();
  const retained = Boolean(outputRoot);
  const workspaceRoot = outputRoot ? path.resolve(outputRoot) : await mkdtemp(path.join(tmpdir(), "design-review-enterprise-eval-"));
  let auditRoot: string | undefined;
  let pages = 0;
  const checks: EnterpriseFixtureEvalResult["checks"] = [];
  try {
    const base = createAuditConfig({
      url: fixtureServer.url,
      mode: "full_audit",
      maxPages: enterpriseFixtureCorpus.length,
      auditRoot: path.join(workspaceRoot, "audit-reports"),
      auditName: "enterprise-fixture-corpus",
      outputPdf: false,
      capture: { maxScrollPasses: 1, stepDelayMs: 20, settleTimeoutMs: 1200 },
      interactions: { maxStateCapturesPerPage: 4, maxStateCapturesPerViewport: 2 }
    });
    const result = await runAudit(base, { workspaceRoot });
    auditRoot = result.auditRoot;
    const report = result.report;
    pages = report.pages.length;
    const pagePaths = new Set(report.pages.map((page) => new URL(page.url).pathname));
    addCheck(checks, report.pages.length === enterpriseFixtureCorpus.length, "Fixture route coverage", `${report.pages.length}/${enterpriseFixtureCorpus.length} fixture routes captured.`);
    for (const route of fixtureRoutes()) {
      addCheck(checks, pagePaths.has(route), `Route ${route}`, pagePaths.has(route) ? "Captured." : "Missing from selected audit pages.");
    }

    const viewportCoverage = report.pages.every((page) =>
      (["desktop", "mobile"] as const).every((viewport) =>
        (["above_fold", "full_page"] as const).every((kind) =>
          Object.values(page.screenshots).some((screenshot) => screenshot.viewport === viewport && screenshot.kind === kind)
        )
      )
    );
    addCheck(checks, viewportCoverage, "Desktop/mobile screenshot coverage", viewportCoverage ? "Every page has first-viewport and full-page evidence in both viewports." : "One or more viewport captures are missing.");

    const interactionPage = report.pages.find((page) => new URL(page.url).pathname === "/interaction-heavy");
    addCheck(checks, (interactionPage?.interactionStates.length ?? 0) >= 2, "Safe interaction evidence", `${interactionPage?.interactionStates.length ?? 0} safe states captured.`);
    const unsafeState = interactionPage?.interactionStates.some((state) => /delete|purchase|login|submit/i.test(`${state.label} ${state.triggerText ?? ""}`)) ?? false;
    addCheck(checks, !unsafeState, "Interaction safety boundary", unsafeState ? "Unsafe state was activated." : "No unsafe fixture action was activated.");

    const accessibilityPage = report.pages.find((page) => new URL(page.url).pathname === "/accessibility-issues");
    const missingLabels = accessibilityPage?.text.forms.reduce((sum, form) => sum + form.missingLabelCount, 0) ?? 0;
    addCheck(checks, missingLabels > 0, "Missing-label detection", `${missingLabels} unlabeled field(s) detected.`);
    addCheck(checks, (accessibilityPage?.text.imagesMissingAlt ?? 0) > 0, "Missing-alt detection", `${accessibilityPage?.text.imagesMissingAlt ?? 0} image(s) without alt attributes detected.`);
    addCheck(checks, Object.keys(accessibilityPage?.accessibilityByViewport ?? {}).length === 2, "Responsive axe coverage", `${Object.keys(accessibilityPage?.accessibilityByViewport ?? {}).length}/2 viewport runs recorded.`);

    const performancePage = report.pages.find((page) => new URL(page.url).pathname === "/performance-heavy");
    const performanceRuns = Object.values(performancePage?.performanceByViewport ?? {});
    addCheck(checks, performanceRuns.length === 2 && performanceRuns.every((run) => run.status === "completed"), "Responsive performance coverage", `${performanceRuns.length}/2 viewport timing runs completed.`);

    const lint = await lintAuditReport(result.auditRoot, true);
    addCheck(checks, lint.status === "pass", "Pure strict report lint", `Strict read-only lint returned ${lint.status}.`);
    for (const artifact of new Set(enterpriseFixtureCorpus.flatMap((fixture) => fixture.expectedArtifacts))) {
      const exists = await access(path.join(result.auditRoot, artifact)).then(() => true, () => false);
      addCheck(checks, exists, `Artifact ${artifact}`, exists ? "Present." : "Missing.");
    }
  } catch (error) {
    checks.push({ name: "Fixture audit execution", status: "fail", message: error instanceof Error ? error.message : String(error) });
  } finally {
    await fixtureServer.close();
    if (!retained) await rm(workspaceRoot, { recursive: true, force: true });
  }

  const failures = checks.filter((item) => item.status === "fail").length;
  return {
    schemaVersion: "design-review-workflow.enterprise-fixture-eval.v1",
    status: failures === 0 ? "pass" : "fail",
    generatedAt: new Date().toISOString(),
    retained,
    auditRoot: retained ? auditRoot : undefined,
    summary: { fixtures: enterpriseFixtureCorpus.length, pages, checks: checks.length, failures },
    checks
  };
}

function addCheck(checks: EnterpriseFixtureEvalResult["checks"], passed: boolean, name: string, message: string): void {
  checks.push({ name, status: passed ? "pass" : "fail", message });
}

function fixtureRoutes(): string[] {
  return ["/", "/portfolio", "/ecommerce", "/local-service", "/blog", "/docs", "/dashboard-public", "/interaction-heavy", "/performance-heavy", "/accessibility-issues"];
}

async function startFixtureServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const route = new URL(request.url ?? "/", "http://fixture.local").pathname;
    if (route === "/asset.js") {
      response.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" });
      response.end("window.fixtureAssetLoaded = true;");
      return;
    }
    if (route === "/pixel.svg") {
      response.writeHead(200, { "Content-Type": "image/svg+xml" });
      response.end('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#155e75"/></svg>');
      return;
    }
    if (!fixtureRoutes().includes(route)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(fixtureHtml(route));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not expose a TCP port.");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function fixtureHtml(route: string): string {
  const links = fixtureRoutes().filter((item) => item !== route).map((item) => `<a href="${item}">${item === "/" ? "SaaS" : item.slice(1)}</a>`).join("");
  const special = route === "/interaction-heavy"
    ? `<button aria-expanded="false" aria-controls="fixture-menu" onclick="this.setAttribute('aria-expanded','true');document.getElementById('fixture-menu').hidden=false">Open navigation menu</button><nav id="fixture-menu" hidden><a href="#details">Details</a></nav><details><summary>Read FAQ details</summary><p>Evidence-rich answer.</p></details><button onclick="document.getElementById('dialog').showModal()">Open dialog</button><dialog id="dialog"><p>Read-only dialog state.</p></dialog><button onclick="window.unsafe=true">Delete account</button>`
    : route === "/accessibility-issues"
      ? `<form><input placeholder="Email only placeholder"><button type="submit">Submit</button></form><img src="/pixel.svg"><p style="color:rgb(130,130,130);background:#888">Low contrast candidate</p>`
      : route === "/performance-heavy"
        ? `<script src="/asset.js"></script><img src="/pixel.svg" alt="Large fixture media"><div style="height:1800px">Long fixture page for render and resource timing.</div>`
        : `<img src="/pixel.svg" alt="${route} proof"><section><h2>Evidence and proof</h2><p>Clear content for this deterministic ${route} design archetype.</p></section>`;
  const title = route === "/" ? "SaaS" : route.slice(1).replace(/-/g, " ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:Arial,sans-serif;margin:0;color:#172033}header,main,footer{padding:24px}nav{display:flex;gap:12px;flex-wrap:wrap}a,button,summary{min-height:40px;padding:8px}section{padding:32px 0}dialog{max-width:420px}</style></head><body><header><nav>${links}</nav></header><main><h1>${title} fixture</h1><p>Deterministic local enterprise audit evidence for ${title}.</p>${special}</main><footer>Local fixture corpus</footer></body></html>`;
}
