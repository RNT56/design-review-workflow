#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import * as yaml from "js-yaml";
import {
  compareAuditDirs,
  createAuditConfig,
  createModelRouterFromEnv,
  fetchFigmaEvidence,
  lintAuditReport,
  readProjectIndex,
  runAudit,
  runMonitorConfig,
  sampleMonitorConfig,
  validateReport,
  type AuditInput,
  type ProjectIndexEntry,
  type ReportLintResult,
  type RunAuditResult
} from "../../../packages/core/src/index.js";

const program = new Command();

program
  .name("wdr")
  .description("Local-first agentic website design review workflow")
  .version("0.1.0");

program
  .command("audit")
  .argument("<url>", "Website URL")
  .option("--mode <mode>", "Audit mode: quick, quick_scan, full, full_audit", "quick_scan")
  .option("--max-pages <number>", "Maximum pages to review", parseIntValue)
  .option("--goal <text>", "Website goal")
  .option("--audience <text>", "Target audience")
  .option("--industry <text>", "Industry")
  .option("--brand-context <text>", "Brand context")
  .option("--competitor <url...>", "Competitor URL(s)")
  .option("--no-pdf", "Disable PDF output")
  .option("--no-html", "Disable HTML output")
  .option("--no-json", "Disable JSON output")
  .option("--no-markdown", "Disable Markdown output")
  .option("--config <path>", "Optional YAML or JSON config file")
  .action(async (url, options) => {
    await runFromOptions(url, options);
  });

configureAgentRunCommand(program.command("run").description("Primary agentic workflow: audit, validate, and emit handoff bundle"));
configureAgentRunCommand(program.command("agent-run").description("Compatibility alias for `run`"));

program
  .command("quick")
  .argument("<url>", "Website URL")
  .option("--max-pages <number>", "Maximum pages to review", parseIntValue)
  .action(async (url, options) => {
    await runFromOptions(url, { ...options, mode: "quick_scan" });
  });

program
  .command("full")
  .argument("<url>", "Website URL")
  .option("--max-pages <number>", "Maximum pages to review", parseIntValue)
  .option("--competitor <url...>", "Competitor URL(s)")
  .action(async (url, options) => {
    await runFromOptions(url, { ...options, mode: "full_audit" });
  });

program
  .command("validate")
  .argument("<reportJson>", "Path to report.json")
  .action(async (reportJson) => {
    const data = JSON.parse(await readFile(reportJson, "utf8"));
    const report = validateReport(data);
    console.log(`Valid report: ${report.auditId}`);
    console.log(`Pages: ${report.pages.length}`);
    console.log(`Findings: ${report.findings.length}`);
    console.log(`Overall score: ${report.scorecard.overallScore}`);
  });

const reportCommand = program
  .command("report")
  .description("Report utilities")
  .argument("[auditDir]", "Audit directory")
  .action(async (auditDir) => {
    if (!auditDir) {
      console.log("Use `report <auditDir>` for a summary or `report lint <auditDir> --strict` for validation.");
      return;
    }
    const reportPath = path.join(auditDir, "report", "report.json");
    const data = JSON.parse(await readFile(reportPath, "utf8"));
    const report = validateReport(data);
    console.log(`Report: ${path.join(auditDir, "report", "report.html")}`);
    console.log(`Markdown: ${path.join(auditDir, "report", "report.md")}`);
    console.log(`PDF: ${path.join(auditDir, "report", "report.pdf")}`);
    console.log(`Workflow manifest: ${path.join(auditDir, "report", "workflow-manifest.json")}`);
    console.log(`Handoff: ${path.join(auditDir, "report", "handoff.json")}`);
    console.log(`Validation: ${path.join(auditDir, "report", "validation.json")}`);
    console.log(`Overall score: ${report.scorecard.overallScore}`);
    if (report.ticketExports) {
      console.log("Ticket exports:");
      for (const [key, value] of Object.entries(report.ticketExports)) {
        console.log(`- ${key}: ${value}`);
      }
    }
    if (report.competitorBenchmarks.length > 0) {
      console.log("Competitors:");
      for (const competitor of report.competitorBenchmarks) {
        console.log(`- ${competitor.competitorUrl}: ${competitor.scorecard.overallScore}`);
      }
    }
    for (const finding of report.findings.slice(0, 5)) {
      console.log(`- [${finding.severity}] ${finding.title}`);
    }
  });

reportCommand
  .command("lint")
  .argument("<auditDir>", "Audit directory")
  .option("--strict", "Fail on warnings")
  .option("--format <format>", "summary or json", "summary")
  .action(async (auditDir, options) => {
    const result = await lintAuditReport(auditDir, Boolean(options.strict));
    if (options.format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Report lint: ${result.status}`);
      console.log(`Findings: ${result.summary.findings}`);
      console.log(`Pages: ${result.summary.pages}`);
      console.log(`Screenshots: ${result.summary.screenshots}`);
      for (const warning of result.warnings) console.log(`warning: ${warning}`);
      for (const error of result.errors) console.log(`error: ${error}`);
    }
    if (result.status === "fail") {
      process.exitCode = 1;
    }
  });

const plan = program.command("plan").description("Agent remediation handoff utilities");
plan
  .command("build")
  .requiredOption("--report <auditDir>", "Audit directory")
  .action(async (options) => {
    const auditDir = String(options.report);
    const lint = await lintAuditReport(auditDir, false);
    console.log(`Workflow manifest: ${path.join(auditDir, "report", "workflow-manifest.json")}`);
    console.log(`Handoff JSON: ${path.join(auditDir, "report", "handoff.json")}`);
    console.log(`Agent execution plan: ${path.join(auditDir, "report", "agent-execution-plan.md")}`);
    console.log(`Implementation plan: ${path.join(auditDir, "report", "implementation-plan.json")}`);
    console.log(`Evidence index: ${path.join(auditDir, "report", "evidence-index.json")}`);
    console.log(`Priority action plan: ${path.join(auditDir, "report", "priority-action-plan.md")}`);
    console.log(`Agent instructions: ${path.join(auditDir, "report", "agent-instructions")}`);
    console.log(`Quality gate: ${lint.status}`);
  });

program
  .command("latest")
  .argument("[siteOrUrl]", "Optional site slug or URL")
  .description("Print the latest indexed audit and agent handoff paths")
  .option("--format <format>", "summary or json", "summary")
  .action(async (siteOrUrl, options) => {
    const index = await readProjectIndex(process.cwd());
    const entry = selectLatestAudit(index.audits, siteOrUrl ? String(siteOrUrl) : undefined);
    if (!entry) {
      console.error(siteOrUrl ? `No audit found for ${siteOrUrl}` : "No audits found.");
      process.exitCode = 1;
      return;
    }
    const closeout = await closeoutFromIndexEntry(entry);
    if (options.format === "json") {
      console.log(JSON.stringify(closeout, null, 2));
    } else {
      printCloseout(closeout);
    }
  });

program
  .command("workflow")
  .description("Print the repository-level agent workflow contract")
  .option("--format <format>", "summary or json", "summary")
  .action((options) => {
    const contract = repositoryWorkflowContract();
    if (options.format === "json") {
      console.log(JSON.stringify(contract, null, 2));
    } else {
      console.log("Agentic Website Design Review Workflow");
      console.log(`Source of truth: ${contract.sourceOfTruth}`);
      console.log(`One-command run: ${contract.commands.oneCommandRun}`);
      console.log(`Primary CLI: ${contract.commands.primaryRun}`);
      console.log("Required closeout files:");
      for (const file of contract.requiredCloseoutFiles) console.log(`- ${file}`);
    }
  });

program
  .command("doctor")
  .description("Check runtime, build output, browser availability, and safety defaults")
  .action(async () => {
    const checks: Array<[string, boolean, string]> = [];
    checks.push(["Node runtime", Number(process.versions.node.split(".")[0]) >= 24, process.version]);
    checks.push(["Dependencies installed", await exists(path.join(process.cwd(), "node_modules")), "node_modules"]);
    checks.push(["Built CLI", await exists(path.join(process.cwd(), "apps", "cli", "dist", "index.js")), "apps/cli/dist/index.js"]);
    checks.push(["AGENTS source of truth", await exists(path.join(process.cwd(), "AGENTS.md")), "AGENTS.md"]);
    checks.push(["Agent runbook", await exists(path.join(process.cwd(), "AGENT-RUNBOOK.md")), "AGENT-RUNBOOK.md"]);
    checks.push(["Agent runner script", await exists(path.join(process.cwd(), "scripts", "agent-run.sh")), "scripts/agent-run.sh"]);
    checks.push(["CI workflow", await exists(path.join(process.cwd(), ".github", "workflows", "ci.yml")), ".github/workflows/ci.yml"]);
    checks.push(["Generated output ignored", await gitignoreContains("projects/*/audits/"), ".gitignore"]);
    checks.push(["Latest audit pointers ignored", await gitignoreContains("projects/*/latest-audit.json") && await gitignoreContains("projects/latest-audit.json"), ".gitignore"]);
    try {
      const playwright = await import("playwright");
      checks.push(["Playwright chromium", Boolean(playwright.chromium.executablePath()), playwright.chromium.executablePath()]);
    } catch (error) {
      checks.push(["Playwright chromium", false, error instanceof Error ? error.message : String(error)]);
    }

    for (const [name, ok, detail] of checks) {
      console.log(`${ok ? "pass" : "fail"} ${name}: ${detail}`);
    }
    if (checks.some(([, ok]) => !ok)) {
      process.exitCode = 1;
    }
  });

program
  .command("compare")
  .argument("<beforeAuditDir>", "Previous audit directory")
  .argument("<afterAuditDir>", "New audit directory")
  .action(async (beforeAuditDir, afterAuditDir) => {
    const { result, outputPath } = await compareAuditDirs(beforeAuditDir, afterAuditDir);
    console.log(`Score delta: ${result.scoreDelta >= 0 ? "+" : ""}${result.scoreDelta}`);
    console.log(`Resolved findings: ${result.resolvedFindings.length}`);
    console.log(`New findings: ${result.newFindings.length}`);
    console.log(`Persistent findings: ${result.persistentFindings.length}`);
    console.log(`Screenshot diffs: ${result.screenshotDiffs.filter((diff) => diff.status === "completed").length}`);
    console.log(`Comparison JSON: ${outputPath}`);
    for (const finding of result.newFindings.slice(0, 5)) {
      console.log(`- [new ${finding.severity}] ${finding.title}`);
    }
  });

program
  .command("history")
  .description("List indexed local audits")
  .option("--site <slug>", "Filter by site slug")
  .action(async (options) => {
    const index = await readProjectIndex(process.cwd());
    const audits = options.site ? index.audits.filter((audit) => audit.site === options.site) : index.audits;
    for (const audit of audits.slice(0, 50)) {
      console.log(`${audit.generatedAt} ${audit.site} ${audit.overallScore}/100 ${audit.findings} findings ${audit.auditRoot}`);
    }
  });

const providers = program.command("providers").description("Inspect configured model providers");
providers
  .command("status")
  .action(() => {
    const router = createModelRouterFromEnv();
    console.log(router.hasProviders() ? "Model providers configured." : "No model providers configured. Set provider API key and model env vars.");
    console.log("Expected env pairs: OPENAI_API_KEY+OPENAI_MODEL, OPENROUTER_API_KEY+OPENROUTER_MODEL, ANTHROPIC_API_KEY+ANTHROPIC_MODEL, GEMINI_API_KEY+GEMINI_MODEL");
  });

const figma = program.command("figma").description("Read-only Figma evidence utilities");
figma
  .command("fetch")
  .argument("<fileKeyOrUrl>", "Figma file key or URL")
  .option("--node <id...>", "Optional Figma node ID(s)")
  .action(async (fileKeyOrUrl, options) => {
    const evidence = await fetchFigmaEvidence({
      fileKeyOrUrl,
      nodeIds: Array.isArray(options.node) ? options.node.map(String) : []
    });
    console.log(`Figma evidence stored: ${evidence.root}`);
    console.log(`Summary: ${evidence.summaryPath}`);
  });

const monitor = program.command("monitor").description("Local monitoring utilities");
monitor
  .command("init")
  .argument("[path]", "Path to write monitor config", "monitor.yaml")
  .action(async (filePath) => {
    await writeFile(filePath, yaml.dump(sampleMonitorConfig()), "utf8");
    console.log(`Wrote ${filePath}`);
  });
monitor
  .command("run")
  .argument("<config>", "Monitor YAML/JSON config")
  .action(async (configPath) => {
    const result = await runMonitorConfig(configPath, process.cwd());
    console.log(`Monitor run: ${result.generatedAt}`);
    for (const run of result.runs) {
      const delta = run.scoreDelta === undefined ? "" : ` delta ${run.scoreDelta >= 0 ? "+" : ""}${run.scoreDelta}`;
      console.log(`- ${run.name}: ${run.score}/100, ${run.findings} findings${delta}`);
      console.log(`  ${run.auditRoot}`);
    }
  });
monitor
  .command("status")
  .action(async () => {
    const index = await readProjectIndex(process.cwd());
    console.log(`Indexed audits: ${index.audits.length}`);
    for (const audit of index.audits.slice(0, 10)) {
      console.log(`- ${audit.site}: ${audit.generatedAt} ${audit.overallScore}/100`);
    }
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

type AgentCloseout = {
  schemaVersion: "design-review-workflow.cli-closeout.v1";
  status: "ready" | "failed";
  auditId: string;
  url: string;
  mode: string;
  auditRoot: string;
  reportRoot: string;
  score: number;
  findings: number;
  qualityGate: unknown;
  files: {
    workflowManifest: string;
    handoff: string;
    validation: string;
    qualityGate: string;
    reportHtml: string;
    reportMarkdown: string;
    reportJson: string;
    reportPdf?: string;
    agentExecutionPlan: string;
    implementationPlan: string;
    evidenceIndex: string;
    agentInstructions: string;
  };
};

function configureAgentRunCommand(command: Command): void {
  command
    .argument("<url>", "Website URL")
    .option("--mode <mode>", "Audit mode: quick, quick_scan, full, full_audit", "quick_scan")
    .option("--max-pages <number>", "Maximum pages to review", parseIntValue)
    .option("--goal <text>", "Website goal")
    .option("--audience <text>", "Target audience")
    .option("--industry <text>", "Industry")
    .option("--brand-context <text>", "Brand context")
    .option("--competitor <url...>", "Competitor URL(s)")
    .option("--config <path>", "Optional YAML or JSON config file")
    .option("--no-pdf", "Disable PDF output")
    .option("--no-html", "Disable full HTML report output")
    .option("--no-markdown", "Disable full Markdown report output")
    .option("--no-strict", "Do not fail the command on lint warnings")
    .option("--format <format>", "summary or json", "summary")
    .action(async (url, options) => {
      const format = options.format === "json" ? "json" : "summary";
      const result = await runFromOptions(url, { ...options, quiet: format === "json" });
      const lint = await lintAuditReport(result.auditRoot, options.strict !== false);
      const closeout = closeoutFromRunResult(result, lint);
      if (format === "json") {
        console.log(JSON.stringify(closeout, null, 2));
      } else {
        console.log("");
        printCloseout(closeout);
      }
      if (lint.status !== "pass") {
        process.exitCode = 1;
      }
    });
}

function closeoutFromRunResult(result: RunAuditResult, lint: ReportLintResult): AgentCloseout {
  const reportRoot = path.join(result.auditRoot, "report");
  return {
    schemaVersion: "design-review-workflow.cli-closeout.v1",
    status: lint.status === "pass" ? "ready" : "failed",
    auditId: result.report.auditId,
    url: result.report.config.url,
    mode: result.report.config.mode,
    auditRoot: result.auditRoot,
    reportRoot,
    score: result.report.scorecard.overallScore,
    findings: result.report.findings.length,
    qualityGate: {
      status: lint.status,
      strict: lint.strict,
      checkedAt: lint.checkedAt,
      errors: lint.errors,
      warnings: lint.warnings
    },
    files: closeoutFiles(result.auditRoot, result.outputs.pdf)
  };
}

async function closeoutFromIndexEntry(entry: ProjectIndexEntry): Promise<AgentCloseout> {
  const qualityGatePath = entry.qualityGateJson ?? path.join(entry.auditRoot, "report", "quality-gate.json");
  const qualityGate = await readOptionalJson(qualityGatePath);
  return {
    schemaVersion: "design-review-workflow.cli-closeout.v1",
    status: qualityGate && (qualityGate as { status?: string }).status === "pass" ? "ready" : "failed",
    auditId: entry.auditId,
    url: entry.url,
    mode: entry.mode,
    auditRoot: entry.auditRoot,
    reportRoot: path.join(entry.auditRoot, "report"),
    score: entry.overallScore,
    findings: entry.findings,
    qualityGate: qualityGate ?? { status: "unknown", path: qualityGatePath },
    files: closeoutFiles(entry.auditRoot, entry.reportPdf)
  };
}

function closeoutFiles(auditRoot: string, pdfPath?: string) {
  const reportRoot = path.join(auditRoot, "report");
  return {
    workflowManifest: path.join(reportRoot, "workflow-manifest.json"),
    handoff: path.join(reportRoot, "handoff.json"),
    validation: path.join(reportRoot, "validation.json"),
    qualityGate: path.join(reportRoot, "quality-gate.json"),
    reportHtml: path.join(reportRoot, "report.html"),
    reportMarkdown: path.join(reportRoot, "report.md"),
    reportJson: path.join(reportRoot, "report.json"),
    reportPdf: pdfPath,
    agentExecutionPlan: path.join(reportRoot, "agent-execution-plan.md"),
    implementationPlan: path.join(reportRoot, "implementation-plan.json"),
    evidenceIndex: path.join(reportRoot, "evidence-index.json"),
    agentInstructions: path.join(reportRoot, "agent-instructions")
  };
}

function printCloseout(closeout: AgentCloseout): void {
  console.log(`Status: ${closeout.status}`);
  console.log(`Audit root: ${closeout.auditRoot}`);
  console.log(`Agent bundle: ${closeout.reportRoot}`);
  console.log(`Workflow manifest: ${closeout.files.workflowManifest}`);
  console.log(`Handoff: ${closeout.files.handoff}`);
  console.log(`Validation: ${closeout.files.validation}`);
  console.log(`Quality gate: ${(closeout.qualityGate as { status?: string }).status ?? "unknown"}`);
  console.log(`Score: ${closeout.score}`);
  console.log(`Findings: ${closeout.findings}`);
  console.log(`Read: ${closeout.files.agentExecutionPlan}`);
}

function selectLatestAudit(audits: ProjectIndexEntry[], siteOrUrl?: string): ProjectIndexEntry | undefined {
  if (!siteOrUrl) return audits[0];
  const key = slugFromSiteOrUrl(siteOrUrl);
  const normalizedUrl = normalizeUrlForMatch(siteOrUrl);
  return audits.find((audit) => audit.site === key || audit.url === normalizedUrl || normalizeUrlForMatch(audit.url) === normalizedUrl);
}

function repositoryWorkflowContract() {
  return {
    schemaVersion: "design-review-workflow.repository-contract.v1",
    sourceOfTruth: "AGENTS.md",
    runbook: "AGENT-RUNBOOK.md",
    commands: {
      oneCommandRun: "bash scripts/agent-run.sh <url>",
      primaryRun: "node apps/cli/dist/index.js run <url>",
      npmRun: "npm run agent -- <url>",
      lint: "node apps/cli/dist/index.js report lint <audit-dir> --strict",
      plan: "node apps/cli/dist/index.js plan build --report <audit-dir>",
      latest: "node apps/cli/dist/index.js latest [site-or-url]"
    },
    requiredCloseoutFiles: [
      "report/workflow-manifest.json",
      "report/handoff.json",
      "report/validation.json",
      "report/quality-gate.json",
      "report/agent-execution-plan.md",
      "report/implementation-plan.json",
      "report/evidence-index.json",
      "report/agent-instructions/"
    ],
    safetyRules: [
      "No login, admin, account, payment, or checkout completion areas.",
      "No purchases or personal data submission.",
      "No invented evidence.",
      "No external publishing or ticket writes without explicit human approval."
    ]
  };
}

async function runFromOptions(url: string, options: Record<string, unknown>) {
  const quiet = options.quiet === true;
  const fileInput = options.config ? await readConfigFile(String(options.config)) : {};
  const mode = normalizeMode(String(options.mode ?? "quick_scan"));
  const input: AuditInput = {
    ...fileInput,
    url,
    mode,
    maxPages: typeof options.maxPages === "number" ? Number(options.maxPages) : undefined,
    websiteGoal: stringOption(options.goal),
    targetAudience: stringOption(options.audience),
    industry: stringOption(options.industry),
    brandContext: stringOption(options.brandContext),
    competitors: Array.isArray(options.competitor) ? options.competitor.map(String) : undefined,
    outputPdf: options.pdf !== false,
    outputHtml: options.html !== false,
    outputJson: options.json !== false,
    outputMarkdown: options.markdown !== false
  };

  const config = createAuditConfig(input);
  const result = await runAudit(config, {
    onProgress: quiet
      ? undefined
      : (event) => {
          const count = event.current && event.total ? ` (${event.current}/${event.total})` : "";
          console.log(`[${event.stage}] ${event.message}${count}`);
        }
  });

  if (!quiet) {
    console.log("");
    console.log(`Audit complete: ${result.auditRoot}`);
    if (result.outputs.html) console.log(`HTML: ${result.outputs.html}`);
    if (result.outputs.markdown) console.log(`Markdown: ${result.outputs.markdown}`);
    if (result.outputs.pdf) console.log(`PDF: ${result.outputs.pdf}`);
    if (result.outputs.json) console.log(`JSON: ${result.outputs.json}`);
    console.log(`Workflow manifest: ${path.join(result.auditRoot, "report", "workflow-manifest.json")}`);
    console.log(`Handoff: ${path.join(result.auditRoot, "report", "handoff.json")}`);
    console.log(`Validation: ${path.join(result.auditRoot, "report", "validation.json")}`);
    console.log(`Overall score: ${result.report.scorecard.overallScore}`);
    console.log(`Findings: ${result.report.findings.length}`);
  }
  return result;
}

async function readConfigFile(filePath: string): Promise<Partial<AuditInput>> {
  const raw = await readFile(filePath, "utf8");
  const parsed = filePath.endsWith(".json") ? JSON.parse(raw) : yaml.load(raw);
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  const value = parsed as Record<string, unknown>;
  const audit = value.audit && typeof value.audit === "object" ? (value.audit as Record<string, unknown>) : value;
  return {
    mode: normalizeMode(String(audit.mode ?? "quick_scan")),
    url: typeof audit.url === "string" ? audit.url : undefined,
    maxPages: typeof audit.max_pages === "number" ? audit.max_pages : typeof audit.maxPages === "number" ? audit.maxPages : undefined,
    language: typeof audit.language === "string" ? audit.language : undefined
  };
}

function normalizeMode(value: string): "quick_scan" | "full_audit" {
  if (value === "full" || value === "full_audit") return "full_audit";
  return "quick_scan";
}

function parseIntValue(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return parsed;
}

function stringOption(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

async function exists(filePath: string): Promise<boolean> {
  return import("node:fs/promises").then(({ access }) => access(filePath).then(
    () => true,
    () => false
  ));
}

async function gitignoreContains(pattern: string): Promise<boolean> {
  return readFile(path.join(process.cwd(), ".gitignore"), "utf8").then(
    (content) => content.includes(pattern),
    () => false
  );
}

async function readOptionalJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function normalizeUrlForMatch(value: string): string {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).toString();
  } catch {
    return value;
  }
}

function slugFromSiteOrUrl(value: string): string {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname
      .replace(/^www\./, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  } catch {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
