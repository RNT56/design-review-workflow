#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { Command } from "commander";
import * as yaml from "js-yaml";
import {
  compareAuditDirs,
  analyzeDesignSourceRepo,
  createAuditConfig,
  createModelRouterFromEnv,
  defaultDesignStandardsRegistry,
  AUDIT_ROOT_ENV,
  buildReviewPack,
  evaluateBusinessGradeGate,
  exportAudit,
  fetchFigmaEvidence,
  importAgentVisualReview,
  applyAgentVisualReview,
  lintAuditReport,
  markAgentReviewPending,
  parseAgentVisualReview,
  readReportFromAuditDir,
  readProjectIndex,
  runAudit,
  runMonitorConfig,
  sampleMonitorConfig,
  validateReport,
  type AuditInput,
  type AuditExportFormat,
  type AuditExportProfile,
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
  .option("--repo <path>", "Target website source repository for read-only source candidates")
  .option("--audit-root <dir>", `Audit output root (default: ./audit-reports or ${AUDIT_ROOT_ENV})`)
  .option("--audit-name <name>", "Human-readable audit/site name used for the site folder slug")
  .option("--output <dir>", "Explicit audit output directory override")
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
  .option("--repo <path>", "Target website source repository for read-only source candidates")
  .option("--audit-root <dir>", "Audit output root")
  .option("--audit-name <name>", "Human-readable audit/site name used for the site folder slug")
  .option("--output <dir>", "Explicit audit output directory override")
  .action(async (url, options) => {
    await runFromOptions(url, { ...options, mode: "quick_scan" });
  });

program
  .command("full")
  .argument("<url>", "Website URL")
  .option("--max-pages <number>", "Maximum pages to review", parseIntValue)
  .option("--competitor <url...>", "Competitor URL(s)")
  .option("--repo <path>", "Target website source repository for read-only source candidates")
  .option("--audit-root <dir>", "Audit output root")
  .option("--audit-name <name>", "Human-readable audit/site name used for the site folder slug")
  .option("--output <dir>", "Explicit audit output directory override")
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
    console.log(`Evidence JSONL: ${path.join(auditDir, "report", "evidence.jsonl")}`);
    console.log(`Source candidates: ${path.join(auditDir, "report", "source-candidates.json")}`);
    console.log(`Repo analysis: ${path.join(auditDir, "report", "repo-analysis.json")}`);
    console.log(`Patch plan: ${path.join(auditDir, "report", "patch-plan.md")}`);
    console.log(`Design benchmark: ${path.join(auditDir, "report", "design-benchmark.json")}`);
    console.log(`Standards registry: ${path.join(auditDir, "report", "standards-registry.json")}`);
    console.log(`Suppression report: ${path.join(auditDir, "report", "suppression-report.json")}`);
    console.log(`Priority action plan: ${path.join(auditDir, "report", "priority-action-plan.md")}`);
    console.log(`Agent instructions: ${path.join(auditDir, "report", "agent-instructions")}`);
    console.log(`Quality gate: ${lint.status}`);
  });

const reviewPack = program.command("review-pack").description("Build multimodal agent visual-review packs");
reviewPack
  .command("build")
  .requiredOption("--report <auditDir>", "Audit directory")
  .action(async (options) => {
    const auditDir = String(options.report);
    const result = await buildReviewPack(auditDir);
    const lint = await lintAuditReport(auditDir, false);
    console.log(`Review pack: ${result.packRoot}`);
    console.log(`Screenshot manifest: ${result.screenshotManifest}`);
    console.log(`Template: ${result.template}`);
    console.log(`Schema: ${result.schema}`);
    console.log(`Instructions: ${result.instructions}`);
    console.log(`Static dashboard: ${path.join(auditDir, "index.html")}`);
    console.log(`Review gallery: ${path.join(result.packRoot, "gallery", "index.html")}`);
    console.log(`Quality gate: ${lint.status}`);
    console.log(`Contact sheets: ${result.contactSheets.length}`);
    for (const sheet of result.contactSheets) console.log(`- ${sheet}`);
  });

const agentReview = program.command("agent-review").description("Import multimodal agent visual-review artifacts");
agentReview
  .command("validate")
  .requiredOption("--report <auditDir>", "Audit directory")
  .requiredOption("--file <path>", "Completed AgentVisualReview JSON")
  .option("--format <format>", "summary or json", "summary")
  .action(async (options) => {
    const report = await readReportFromAuditDir(String(options.report));
    const review = parseAgentVisualReview(JSON.parse(await readFile(String(options.file), "utf8")));
    const updated = applyAgentVisualReview(report, review);
    const gate = evaluateBusinessGradeGate(updated);
    if (options.format === "json") {
      console.log(JSON.stringify(gate, null, 2));
    } else {
      console.log(`Agent review validation: ${gate.status}`);
      console.log(`Design verdict: ${gate.summary.designVerdict}`);
      console.log(`Page reviews: ${gate.summary.pageReviews}`);
      console.log(`Redesign actions: ${gate.summary.redesignActions}`);
      console.log(`Visual findings: ${gate.summary.visualFindings}`);
      for (const warning of gate.warnings) console.log(`warning: ${warning}`);
      for (const error of gate.errors) console.log(`error: ${error}`);
    }
    if (gate.status !== "pass") {
      process.exitCode = 1;
    }
  });
agentReview
  .command("import")
  .requiredOption("--report <auditDir>", "Audit directory")
  .requiredOption("--file <path>", "Completed AgentVisualReview JSON")
  .action(async (options) => {
    const result = await importAgentVisualReview(String(options.report), String(options.file));
    console.log(`Imported visual review: ${result.canonicalReviewPath}`);
    console.log(`Reviewer run copy: ${result.reviewerRunPath}`);
    console.log(`Business-grade gate: ${result.gate.status}`);
    console.log(`Business-grade gate JSON: ${path.join(String(options.report), "report", "business-grade-gate.json")}`);
    console.log(`Hosted static report: ${path.join(String(options.report), "report", "hosted", "index.html")}`);
    if (result.gate.status !== "pass") {
      for (const error of result.gate.errors) console.log(`error: ${error}`);
      process.exitCode = 1;
    }
  });

const businessGrade = program.command("business-grade").description("Business-grade design-review gate utilities");
businessGrade
  .command("lint")
  .requiredOption("--report <auditDir>", "Audit directory")
  .option("--format <format>", "summary or json", "summary")
  .action(async (options) => {
    const auditDir = String(options.report);
    const report = await readReportFromAuditDir(auditDir);
    const gate = evaluateBusinessGradeGate(report);
    await writeJsonFile(path.join(auditDir, "report", "business-grade-gate.json"), gate);
    if (options.format === "json") {
      console.log(JSON.stringify(gate, null, 2));
    } else {
      console.log(`Business-grade gate: ${gate.status}`);
      console.log(`Status: ${gate.businessGradeStatus}`);
      console.log(`Screenshots reviewed: ${gate.summary.screenshotsReviewed}`);
      console.log(`Page reviews: ${gate.summary.pageReviews}`);
      console.log(`Redesign actions: ${gate.summary.redesignActions}`);
      console.log(`Visual findings: ${gate.summary.visualFindings}`);
      console.log(`Grouped issues: ${gate.summary.groupedIssues}`);
      for (const warning of gate.warnings) console.log(`warning: ${warning}`);
      for (const error of gate.errors) console.log(`error: ${error}`);
    }
    if (gate.status !== "pass") {
      process.exitCode = 1;
    }
  });

program
  .command("export")
  .description("Create deterministic local export packages for an audit")
  .requiredOption("--report <auditDir>", "Audit directory")
  .option("--profile <profile>", "review, full, or repo-import", "review")
  .option("--format <format>", "zip or directory", "zip")
  .option("--output <path>", "Output zip or directory path")
  .option("--include-private-paths", "Do not redact local absolute paths in text artifacts")
  .option("--overwrite", "Replace an existing export output")
  .action(async (options) => {
    const result = await exportAudit({
      auditDir: String(options.report),
      profile: String(options.profile) as AuditExportProfile,
      format: String(options.format) as AuditExportFormat,
      outputPath: stringOption(options.output),
      includePrivatePaths: options.includePrivatePaths === true,
      overwrite: options.overwrite === true
    });
    console.log(`Export profile: ${result.profile}`);
    console.log(`Export format: ${result.format}`);
    console.log(`Output: ${result.outputPath}`);
    console.log(`Files: ${result.files}`);
    console.log(`Bytes: ${result.bytes}`);
    console.log(`Manifest: ${result.manifestPath}`);
    console.log(`Checksums: ${result.checksumsPath}`);
    console.log(`Local paths redacted: ${result.localPathsRedacted ? "yes" : "no"}`);
  });

program
  .command("benchmark")
  .description("Print or refresh the design workflow benchmark for an audit")
  .requiredOption("--report <auditDir>", "Audit directory")
  .option("--format <format>", "summary or json", "summary")
  .action(async (options) => {
    const auditDir = String(options.report);
    const lint = await lintAuditReport(auditDir, false);
    const benchmarkPath = path.join(auditDir, "report", "design-benchmark.json");
    const benchmark = JSON.parse(await readFile(benchmarkPath, "utf8")) as {
      score?: { overall?: number; evidenceCompleteness?: number; actionability?: number; reportCompleteness?: number };
      gates?: Array<{ name: string; status: string }>;
    };
    if (options.format === "json") {
      console.log(JSON.stringify({ lint, benchmark }, null, 2));
    } else {
      console.log(`Design benchmark: ${benchmark.score?.overall ?? "-"} / 100`);
      console.log(`Evidence completeness: ${benchmark.score?.evidenceCompleteness ?? "-"}`);
      console.log(`Actionability: ${benchmark.score?.actionability ?? "-"}`);
      console.log(`Report completeness: ${benchmark.score?.reportCompleteness ?? "-"}`);
      console.log(`Quality gate: ${lint.status}`);
      console.log(`Benchmark JSON: ${benchmarkPath}`);
      for (const gate of benchmark.gates ?? []) {
        console.log(`- ${gate.status}: ${gate.name}`);
      }
    }
    if (lint.status === "fail") {
      process.exitCode = 1;
    }
  });

const standards = program.command("standards").description("Design-review standards registry utilities");
standards
  .command("update")
  .option("--report <auditDir>", "Audit directory to update")
  .option("--output <path>", "Output registry path")
  .action(async (options) => {
    const report = options.report ? await readReportFromAuditDir(String(options.report)) : undefined;
    const outputPath = String(options.output ?? (options.report ? path.join(String(options.report), "report", "standards-registry.json") : "design-standards-registry.json"));
    await writeJsonFile(outputPath, defaultDesignStandardsRegistry(report));
    console.log(`Standards registry: ${outputPath}`);
    if (options.report) {
      await lintAuditReport(String(options.report), false);
      console.log(`Refreshed audit bundle: ${String(options.report)}`);
    }
  });

const suppressions = program.command("suppressions").description("Non-destructive finding suppression utilities");
suppressions
  .command("init")
  .argument("[path]", "Suppression file path", "design-review-suppressions.json")
  .action(async (filePath) => {
    await writeJsonFile(String(filePath), {
      schemaVersion: "design-review-workflow.suppressions.v1",
      suppressions: [
        {
          findingId: "finding_...",
          reason: "Why this finding is accepted or intentionally deferred.",
          owner: "name-or-team",
          expiresAt: "2026-12-31"
        }
      ]
    });
    console.log(`Suppression template: ${String(filePath)}`);
  });
suppressions
  .command("apply")
  .requiredOption("--report <auditDir>", "Audit directory")
  .requiredOption("--file <path>", "Suppression JSON file")
  .action(async (options) => {
    const auditDir = String(options.report);
    const report = await readReportFromAuditDir(auditDir);
    const raw = JSON.parse(await readFile(String(options.file), "utf8")) as { suppressions?: Array<Record<string, unknown>> };
    const knownFindingIds = new Set(report.findings.map((finding) => finding.findingId));
    const suppressionsList = Array.isArray(raw.suppressions) ? raw.suppressions : [];
    const applied = suppressionsList.filter((item) => typeof item.findingId === "string" && knownFindingIds.has(item.findingId));
    const ignored = suppressionsList.filter((item) => typeof item.findingId !== "string" || !knownFindingIds.has(item.findingId));
    const outputPath = path.join(auditDir, "report", "suppression-report.json");
    await writeJsonFile(outputPath, {
      schemaVersion: "design-review-workflow.suppression-report.v1",
      auditId: report.auditId,
      generatedAt: new Date().toISOString(),
      sourceFile: path.resolve(String(options.file)),
      suppressionsApplied: applied.length,
      suppressedFindingIds: applied.map((item) => item.findingId),
      suppressions: applied,
      ignored,
      note: "Suppressions are non-destructive. Findings remain in findings.json and are marked only in this ledger."
    });
    const lint = await lintAuditReport(auditDir, false);
    console.log(`Suppression report: ${outputPath}`);
    console.log(`Applied: ${applied.length}`);
    console.log(`Ignored: ${ignored.length}`);
    console.log(`Quality gate: ${lint.status}`);
  });

program
  .command("latest")
  .argument("[siteOrUrl]", "Optional site slug or URL")
  .description("Print the latest indexed audit and agent handoff paths")
  .option("--format <format>", "summary or json", "summary")
  .option("--audit-root <dir>", "Audit output root to inspect")
  .action(async (siteOrUrl, options) => {
    const index = await readProjectIndex(process.cwd(), stringOption(options.auditRoot));
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
    checks.push(["Architecture docs", await exists(path.join(process.cwd(), "docs", "architecture.md")), "docs/architecture.md"]);
    checks.push(["Agent compatibility docs", await exists(path.join(process.cwd(), "docs", "agent-compatibility.md")), "docs/agent-compatibility.md"]);
    checks.push(["Agent runner script", await exists(path.join(process.cwd(), "scripts", "agent-run.sh")), "scripts/agent-run.sh"]);
    checks.push(["CI workflow", await exists(path.join(process.cwd(), ".github", "workflows", "ci.yml")), ".github/workflows/ci.yml"]);
    checks.push(["Audit report root ignored", await gitignoreContains("audit-reports/"), ".gitignore"]);
    checks.push(["Legacy generated output ignored", await gitignoreContains("projects/*/audits/"), ".gitignore"]);
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
  .option("--audit-root <dir>", "Audit output root to inspect")
  .action(async (options) => {
    const index = await readProjectIndex(process.cwd(), stringOption(options.auditRoot));
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
  .option("--audit-root <dir>", "Audit output root to inspect")
  .action(async (options) => {
    const index = await readProjectIndex(process.cwd(), stringOption(options.auditRoot));
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
  status: "ready" | "failed" | "agent_review_required";
  auditId: string;
  url: string;
  mode: string;
  auditRoot: string;
  reportRoot: string;
  score: number;
  findings: number;
  businessGradeStatus: string;
  businessGradeGate?: unknown;
  qualityGate: unknown;
  files: {
    auditIndex: string;
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
    evidenceJsonl: string;
    sourceCandidates: string;
    repoAnalysis: string;
    patchPlan: string;
    changedFiles: string;
    designBenchmark: string;
    standardsRegistry: string;
    suppressionReport: string;
    businessGradeGate: string;
    groupedIssues: string;
    screenshotManifest: string;
    reviewPack: string;
    reviewPackManifest: string;
    reviewPackGallery: string;
    agentVisualReview: string;
    hostedReport: string;
    contactSheets: string;
    firstViewportSheet: string;
    pageContactSheets: string;
    issueContactSheets: string;
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
    .option("--repo <path>", "Target website source repository for read-only source candidates")
    .option("--audit-root <dir>", "Audit output root")
    .option("--audit-name <name>", "Human-readable audit/site name used for the site folder slug")
    .option("--output <dir>", "Explicit audit output directory override")
    .option("--config <path>", "Optional YAML or JSON config file")
    .option("--no-pdf", "Disable PDF output")
    .option("--no-html", "Disable full HTML report output")
    .option("--no-markdown", "Disable full Markdown report output")
    .option("--no-strict", "Do not fail the command on lint warnings")
    .option("--business-grade", "Build the visual review pack and require agent visual review import before business-grade pass")
    .option("--format <format>", "summary or json", "summary")
    .action(async (url, options) => {
      const format = options.format === "json" ? "json" : "summary";
      const result = await runFromOptions(url, { ...options, quiet: format === "json" });
      let businessGate: unknown | undefined;
      if (options.businessGrade) {
        const pending = await markAgentReviewPending(result.auditRoot);
        result.report = pending.report;
        result.outputs = pending.outputs;
        const packRoot = path.join(result.auditRoot, "report", "agent-review-pack");
        const packManifest = path.join(packRoot, "review-pack-manifest.json");
        if (!(await exists(packManifest))) {
          await buildReviewPack(result.auditRoot);
        }
        businessGate = pending.gate;
        if (format !== "json") {
          console.log("");
          console.log("Business-grade review pack ready.");
          console.log(`Review pack: ${packRoot}`);
          console.log(`Review pack manifest: ${packManifest}`);
          console.log(`Review gallery: ${path.join(packRoot, "gallery", "index.html")}`);
          console.log(`First viewports: ${path.join(result.auditRoot, "report", "contact-sheets", "first-viewports.png")}`);
          console.log(`Contact sheets: ${path.join(result.auditRoot, "report", "contact-sheets")}`);
          console.log(`Import required: node apps/cli/dist/index.js agent-review import --report ${result.auditRoot} --file agent-runs/<agent>/visual-review.json`);
        }
      }
      const lint = await lintAuditReport(result.auditRoot, options.strict !== false);
      const closeout = closeoutFromRunResult(result, lint, businessGate);
      if (format === "json") {
        console.log(JSON.stringify(closeout, null, 2));
      } else {
        console.log("");
        printCloseout(closeout);
      }
      if (options.businessGrade && (businessGate as { status?: string } | undefined)?.status !== "pass") {
        process.exitCode = 2;
      } else if (lint.status !== "pass") {
        process.exitCode = 1;
      }
    });
}

function closeoutFromRunResult(result: RunAuditResult, lint: ReportLintResult, businessGate?: unknown): AgentCloseout {
  const reportRoot = path.join(result.auditRoot, "report");
  return {
    schemaVersion: "design-review-workflow.cli-closeout.v1",
    status: lint.status !== "pass" ? "failed" : (businessGate as { status?: string } | undefined)?.status === "fail" ? "agent_review_required" : "ready",
    auditId: result.report.auditId,
    url: result.report.config.url,
    mode: result.report.config.mode,
    auditRoot: result.auditRoot,
    reportRoot,
    score: result.report.scorecard.overallScore,
    findings: result.report.findings.length,
    businessGradeStatus: result.report.businessGradeStatus,
    businessGradeGate: businessGate,
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
  const report = (await readOptionalJson(entry.reportJson)) as { businessGradeStatus?: string; scorecard?: { overallScore?: number }; findings?: unknown[] } | undefined;
  const businessGradeStatus = report?.businessGradeStatus ?? "unknown";
  const technicalPass = qualityGate && (qualityGate as { status?: string }).status === "pass";
  const status = technicalPass ? (businessGradeStatus === "agent_review_pending" ? "agent_review_required" : "ready") : "failed";
  return {
    schemaVersion: "design-review-workflow.cli-closeout.v1",
    status,
    auditId: entry.auditId,
    url: entry.url,
    mode: entry.mode,
    auditRoot: entry.auditRoot,
    reportRoot: path.join(entry.auditRoot, "report"),
    score: report?.scorecard?.overallScore ?? entry.overallScore,
    findings: Array.isArray(report?.findings) ? report.findings.length : entry.findings,
    businessGradeStatus,
    qualityGate: qualityGate ?? { status: "unknown", path: qualityGatePath },
    files: closeoutFiles(entry.auditRoot, entry.reportPdf)
  };
}

function closeoutFiles(auditRoot: string, pdfPath?: string) {
  const reportRoot = path.join(auditRoot, "report");
  return {
    auditIndex: path.join(auditRoot, "index.html"),
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
    evidenceJsonl: path.join(reportRoot, "evidence.jsonl"),
    sourceCandidates: path.join(reportRoot, "source-candidates.json"),
    repoAnalysis: path.join(reportRoot, "repo-analysis.json"),
    patchPlan: path.join(reportRoot, "patch-plan.md"),
    changedFiles: path.join(reportRoot, "changed-files.json"),
    designBenchmark: path.join(reportRoot, "design-benchmark.json"),
    standardsRegistry: path.join(reportRoot, "standards-registry.json"),
    suppressionReport: path.join(reportRoot, "suppression-report.json"),
    businessGradeGate: path.join(reportRoot, "business-grade-gate.json"),
    groupedIssues: path.join(reportRoot, "grouped-issues.json"),
    screenshotManifest: path.join(reportRoot, "screenshot-manifest.json"),
    reviewPack: path.join(reportRoot, "agent-review-pack"),
    reviewPackManifest: path.join(reportRoot, "agent-review-pack", "review-pack-manifest.json"),
    reviewPackGallery: path.join(reportRoot, "agent-review-pack", "gallery", "index.html"),
    agentVisualReview: path.join(reportRoot, "agent-visual-review.json"),
    hostedReport: path.join(reportRoot, "hosted", "index.html"),
    contactSheets: path.join(reportRoot, "contact-sheets"),
    firstViewportSheet: path.join(reportRoot, "contact-sheets", "first-viewports.png"),
    pageContactSheets: path.join(reportRoot, "contact-sheets", "pages"),
    issueContactSheets: path.join(reportRoot, "contact-sheets", "issues"),
    agentInstructions: path.join(reportRoot, "agent-instructions")
  };
}

function printCloseout(closeout: AgentCloseout): void {
  console.log(`Status: ${closeout.status}`);
  console.log(`Audit root: ${closeout.auditRoot}`);
  console.log(`Static dashboard: ${closeout.files.auditIndex}`);
  console.log(`Agent bundle: ${closeout.reportRoot}`);
  console.log(`Workflow manifest: ${closeout.files.workflowManifest}`);
  console.log(`Handoff: ${closeout.files.handoff}`);
  console.log(`Validation: ${closeout.files.validation}`);
  console.log(`Quality gate: ${(closeout.qualityGate as { status?: string }).status ?? "unknown"}`);
  console.log(`Business-grade status: ${closeout.businessGradeStatus}`);
  if (closeout.status === "agent_review_required") {
    console.log(`Business-grade gate: agent review required`);
    console.log(`Review pack: ${closeout.files.reviewPack}`);
    console.log(`Review pack manifest: ${closeout.files.reviewPackManifest}`);
    console.log(`Review gallery: ${closeout.files.reviewPackGallery}`);
  }
  console.log(`Score: ${closeout.score}`);
  console.log(`Findings: ${closeout.findings}`);
  console.log(`Read: ${closeout.files.agentExecutionPlan}`);
  console.log(`Source candidates: ${closeout.files.sourceCandidates}`);
  console.log(`Design benchmark: ${closeout.files.designBenchmark}`);
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
      primaryRun: "node apps/cli/dist/index.js run <url> [--repo <target-source-repo>] [--audit-root ./audit-reports]",
      npmRun: "npm run agent -- <url> --repo <target-source-repo> --audit-root ./audit-reports",
      lint: "node apps/cli/dist/index.js report lint <audit-dir> --strict",
      plan: "node apps/cli/dist/index.js plan build --report <audit-dir>",
      reviewPack: "node apps/cli/dist/index.js review-pack build --report <audit-dir>",
      agentReviewValidate: "node apps/cli/dist/index.js agent-review validate --report <audit-dir> --file <visual-review.json>",
      agentReviewImport: "node apps/cli/dist/index.js agent-review import --report <audit-dir> --file <visual-review.json>",
      businessGradeLint: "node apps/cli/dist/index.js business-grade lint --report <audit-dir>",
      exportReview: "node apps/cli/dist/index.js export --report <audit-dir> --profile review",
      exportFull: "node apps/cli/dist/index.js export --report <audit-dir> --profile full",
      exportRepoImport: "node apps/cli/dist/index.js export --report <audit-dir> --profile repo-import",
      benchmark: "node apps/cli/dist/index.js benchmark --report <audit-dir>",
      standards: "node apps/cli/dist/index.js standards update --report <audit-dir>",
      suppressions: "node apps/cli/dist/index.js suppressions init [file] && node apps/cli/dist/index.js suppressions apply --report <audit-dir> --file <file>",
      latest: "node apps/cli/dist/index.js latest [site-or-url]"
    },
    requiredCloseoutFiles: [
      "index.html",
      "report/workflow-manifest.json",
      "report/handoff.json",
      "report/validation.json",
      "report/quality-gate.json",
      "report/business-grade-gate.json",
      "report/grouped-issues.json",
      "report/screenshot-manifest.json",
      "report/agent-execution-plan.md",
      "report/implementation-plan.json",
      "report/evidence-index.json",
      "report/evidence.jsonl",
      "report/source-candidates.json",
      "report/repo-analysis.json",
      "report/patch-plan.md",
      "report/changed-files.json",
      "report/design-benchmark.json",
      "report/standards-registry.json",
      "report/suppression-report.json",
      "report/route-templates.json",
      "report/visual-system.json",
      "report/experience-timing.json",
      "report/hosted/index.html",
      "report/agent-review-pack/",
      "report/agent-review-pack/review-pack-manifest.json",
      "report/agent-review-pack/gallery/index.html",
      "report/contact-sheets/first-viewports.png",
      "report/contact-sheets/pages/*.png",
      "report/contact-sheets/issues/*.png",
      "report/agent-instructions/",
      "export-manifest.json after export",
      "checksums.sha256 after export",
      "exports/*.zip after export"
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
    maxPages: typeof options.maxPages === "number" ? Number(options.maxPages) : fileInput.maxPages,
    websiteGoal: stringOption(options.goal) ?? fileInput.websiteGoal,
    targetAudience: stringOption(options.audience) ?? fileInput.targetAudience,
    industry: stringOption(options.industry) ?? fileInput.industry,
    brandContext: stringOption(options.brandContext) ?? fileInput.brandContext,
    competitors: Array.isArray(options.competitor) ? options.competitor.map(String) : fileInput.competitors,
    auditRoot: stringOption(options.auditRoot) ?? fileInput.auditRoot,
    auditName: stringOption(options.auditName) ?? fileInput.auditName,
    auditSlug: fileInput.auditSlug,
    auditRunId: fileInput.auditRunId,
    outputDir: stringOption(options.output) ?? fileInput.outputDir,
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

  if (typeof options.repo === "string" && options.repo.trim()) {
    if (!quiet) {
      console.log(`[source] Analyzing target source repo: ${options.repo}`);
    }
    const analysis = await analyzeDesignSourceRepo(result.auditRoot, options.repo);
    if (!quiet) {
      console.log(`[source] Source candidates mapped from ${analysis.filesScanned} files`);
    }
  }

  if (!quiet) {
    console.log("");
    console.log(`Audit complete: ${result.auditRoot}`);
    console.log(`Static dashboard: ${path.join(result.auditRoot, "index.html")}`);
    console.log(`Review gallery: ${path.join(result.auditRoot, "report", "agent-review-pack", "gallery", "index.html")}`);
    console.log(`First viewports: ${path.join(result.auditRoot, "report", "contact-sheets", "first-viewports.png")}`);
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
    language: typeof audit.language === "string" ? audit.language : undefined,
    websiteGoal: typeof audit.websiteGoal === "string" ? audit.websiteGoal : typeof audit.goal === "string" ? audit.goal : undefined,
    targetAudience: typeof audit.targetAudience === "string" ? audit.targetAudience : typeof audit.audience === "string" ? audit.audience : undefined,
    industry: typeof audit.industry === "string" ? audit.industry : undefined,
    brandContext: typeof audit.brandContext === "string" ? audit.brandContext : typeof audit.brand_context === "string" ? audit.brand_context : undefined,
    competitors: Array.isArray(audit.competitors) ? audit.competitors.map(String) : undefined,
    auditRoot: typeof audit.auditRoot === "string" ? audit.auditRoot : typeof audit.audit_root === "string" ? audit.audit_root : undefined,
    auditName: typeof audit.auditName === "string" ? audit.auditName : typeof audit.audit_name === "string" ? audit.audit_name : undefined,
    auditSlug: typeof audit.auditSlug === "string" ? audit.auditSlug : typeof audit.audit_slug === "string" ? audit.audit_slug : undefined,
    auditRunId: typeof audit.auditRunId === "string" ? audit.auditRunId : typeof audit.audit_run_id === "string" ? audit.audit_run_id : undefined,
    outputDir: typeof audit.outputDir === "string" ? audit.outputDir : typeof audit.output === "string" ? audit.output : undefined
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

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
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
