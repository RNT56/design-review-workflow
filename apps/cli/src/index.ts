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
  readProjectIndex,
  runAudit,
  runMonitorConfig,
  sampleMonitorConfig,
  validateReport,
  type AuditInput
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

program
  .command("report")
  .argument("<auditDir>", "Audit directory")
  .action(async (auditDir) => {
    const reportPath = path.join(auditDir, "report", "report.json");
    const data = JSON.parse(await readFile(reportPath, "utf8"));
    const report = validateReport(data);
    console.log(`Report: ${path.join(auditDir, "report", "report.html")}`);
    console.log(`Markdown: ${path.join(auditDir, "report", "report.md")}`);
    console.log(`PDF: ${path.join(auditDir, "report", "report.pdf")}`);
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

async function runFromOptions(url: string, options: Record<string, unknown>) {
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
    onProgress: (event) => {
      const count = event.current && event.total ? ` (${event.current}/${event.total})` : "";
      console.log(`[${event.stage}] ${event.message}${count}`);
    }
  });

  console.log("");
  console.log(`Audit complete: ${result.auditRoot}`);
  if (result.outputs.html) console.log(`HTML: ${result.outputs.html}`);
  if (result.outputs.markdown) console.log(`Markdown: ${result.outputs.markdown}`);
  if (result.outputs.pdf) console.log(`PDF: ${result.outputs.pdf}`);
  if (result.outputs.json) console.log(`JSON: ${result.outputs.json}`);
  console.log(`Overall score: ${result.report.scorecard.overallScore}`);
  console.log(`Findings: ${result.report.findings.length}`);
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
