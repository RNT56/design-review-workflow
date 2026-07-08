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
  enterpriseFixtureManifest,
  AUDIT_ROOT_ENV,
  buildReviewPack,
  evaluateBusinessGradeGate,
  exportAudit,
  fetchFigmaEvidence,
  generateAgentVisualReview,
  importAgentVisualReview,
  applyAgentVisualReview,
  lintAuditReport,
  markAgentReviewPending,
  parseAgentVisualReview,
  planAuditRetention,
  readReportFromAuditDir,
  readProjectIndex,
  runAudit,
  runMonitorConfig,
  sampleMonitorConfig,
  validateReport,
  verifyEnterpriseAudit,
  type AuditInput,
  type AuditExportFormat,
  type AuditExportProfile,
  type RelatedWorkflowSpec,
  type ProjectIndexEntry,
  type ReportLintResult,
  type ReviewMode,
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
  .option("--related-workflow <kind:path>", "Related local workflow artifact, e.g. seo:/path/to/seo-audit", collectRepeatedOption, [])
  .option("--repo <path>", "Target website source repository for read-only source candidates")
  .option("--audit-root <dir>", `Audit output root (default: ./audit-reports or ${AUDIT_ROOT_ENV})`)
  .option("--audit-name <name>", "Human-readable audit/site name used for the site folder slug")
  .option("--output <dir>", "Explicit audit output directory override")
  .option("--no-pdf", "Disable PDF output")
  .option("--no-html", "Disable HTML output")
  .option("--no-json", "Disable JSON output")
  .option("--no-markdown", "Disable Markdown output")
  .option("--no-capture-settle-scroll", "Disable pre-screenshot scroll settling for reveal/lazy content")
  .option("--no-capture-reduced-motion", "Do not request prefers-reduced-motion during capture")
  .option("--capture-scroll-passes <number>", "Viewport scroll passes before screenshots", parseIntValue)
  .option("--capture-settle-timeout <ms>", "Maximum milliseconds to wait for visual readiness", parseIntValue)
  .option("--capture-retries <number>", "Retry count for transient page capture failures", parseNonNegativeIntValue)
  .option("--no-interaction-state-capture", "Disable safe modal, menu, tab, accordion, and popover state screenshots")
  .option("--max-interaction-states <number>", "Maximum safe interaction states to capture per page", parseIntValue)
  .option("--max-interaction-states-per-viewport <number>", "Maximum safe interaction states to capture per viewport", parseIntValue)
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
  .option("--related-workflow <kind:path>", "Related local workflow artifact, e.g. seo:/path/to/seo-audit", collectRepeatedOption, [])
  .option("--audit-root <dir>", "Audit output root")
  .option("--audit-name <name>", "Human-readable audit/site name used for the site folder slug")
  .option("--output <dir>", "Explicit audit output directory override")
  .option("--no-capture-settle-scroll", "Disable pre-screenshot scroll settling for reveal/lazy content")
  .option("--no-capture-reduced-motion", "Do not request prefers-reduced-motion during capture")
  .option("--capture-scroll-passes <number>", "Viewport scroll passes before screenshots", parseIntValue)
  .option("--capture-settle-timeout <ms>", "Maximum milliseconds to wait for visual readiness", parseIntValue)
  .option("--capture-retries <number>", "Retry count for transient page capture failures", parseNonNegativeIntValue)
  .option("--no-interaction-state-capture", "Disable safe modal, menu, tab, accordion, and popover state screenshots")
  .option("--max-interaction-states <number>", "Maximum safe interaction states to capture per page", parseIntValue)
  .option("--max-interaction-states-per-viewport <number>", "Maximum safe interaction states to capture per viewport", parseIntValue)
  .action(async (url, options) => {
    await runFromOptions(url, { ...options, mode: "quick_scan" });
  });

program
  .command("full")
  .argument("<url>", "Website URL")
  .option("--max-pages <number>", "Maximum pages to review", parseIntValue)
  .option("--competitor <url...>", "Competitor URL(s)")
  .option("--related-workflow <kind:path>", "Related local workflow artifact, e.g. seo:/path/to/seo-audit", collectRepeatedOption, [])
  .option("--repo <path>", "Target website source repository for read-only source candidates")
  .option("--audit-root <dir>", "Audit output root")
  .option("--audit-name <name>", "Human-readable audit/site name used for the site folder slug")
  .option("--output <dir>", "Explicit audit output directory override")
  .option("--no-capture-settle-scroll", "Disable pre-screenshot scroll settling for reveal/lazy content")
  .option("--no-capture-reduced-motion", "Do not request prefers-reduced-motion during capture")
  .option("--capture-scroll-passes <number>", "Viewport scroll passes before screenshots", parseIntValue)
  .option("--capture-settle-timeout <ms>", "Maximum milliseconds to wait for visual readiness", parseIntValue)
  .option("--capture-retries <number>", "Retry count for transient page capture failures", parseNonNegativeIntValue)
  .option("--no-interaction-state-capture", "Disable safe modal, menu, tab, accordion, and popover state screenshots")
  .option("--max-interaction-states <number>", "Maximum safe interaction states to capture per page", parseIntValue)
  .option("--max-interaction-states-per-viewport <number>", "Maximum safe interaction states to capture per viewport", parseIntValue)
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
agentReview
  .command("generate")
  .description("Generate, validate, and import an AgentVisualReview with a configured multimodal provider")
  .requiredOption("--report <auditDir>", "Audit directory")
  .option("--provider <provider>", "Provider selector; currently only auto", "auto")
  .option("--max-images <number>", "Maximum review-pack images to send", parseIntValue)
  .option("--format <format>", "summary or json", "summary")
  .action(async (options) => {
    const result = await generateAgentVisualReview(String(options.report), {
      provider: String(options.provider),
      maxImages: typeof options.maxImages === "number" ? options.maxImages : undefined
    });
    if (options.format === "json") {
      console.log(JSON.stringify({
        auditId: result.auditId,
        auditRoot: result.auditRoot,
        provider: result.provider,
        model: result.model,
        generatedReviewPath: result.generatedReviewPath,
        rawProviderOutputPath: result.rawProviderOutputPath,
        canonicalReviewPath: result.canonicalReviewPath,
        gate: result.gate,
        hostedReport: path.join(String(options.report), "report", "hosted", "index.html")
      }, null, 2));
    } else {
      console.log(`Generated visual review: ${result.generatedReviewPath}`);
      console.log(`Raw provider output: ${result.rawProviderOutputPath}`);
      console.log(`Provider: ${result.provider} / ${result.model}`);
      console.log(`Imported visual review: ${result.canonicalReviewPath}`);
      console.log(`Business-grade gate: ${result.gate.status}`);
      console.log(`Hosted static report: ${path.join(String(options.report), "report", "hosted", "index.html")}`);
      for (const warning of result.gate.warnings) console.log(`warning: ${warning}`);
      for (const error of result.gate.errors) console.log(`error: ${error}`);
    }
    if (result.gate.status !== "pass") {
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
  .option("--include-sensitive-values", "Do not redact secret-looking or cookie-looking values in text artifacts")
  .option("--client-name <name>", "Optional local export branding/client name")
  .option("--prepared-by <name>", "Optional local export prepared-by label")
  .option("--brand-logo <path>", "Optional local export brand/logo path metadata")
  .option("--overwrite", "Replace an existing export output")
  .action(async (options) => {
    const result = await exportAudit({
      auditDir: String(options.report),
      profile: String(options.profile) as AuditExportProfile,
      format: String(options.format) as AuditExportFormat,
      outputPath: stringOption(options.output),
      includePrivatePaths: options.includePrivatePaths === true,
      includeSensitiveValues: options.includeSensitiveValues === true,
      overwrite: options.overwrite === true,
      clientName: stringOption(options.clientName),
      preparedBy: stringOption(options.preparedBy),
      brandLogoPath: stringOption(options.brandLogo)
    });
    console.log(`Export profile: ${result.profile}`);
    console.log(`Export format: ${result.format}`);
    console.log(`Output: ${result.outputPath}`);
    console.log(`Files: ${result.files}`);
    console.log(`Bytes: ${result.bytes}`);
    console.log(`Manifest: ${result.manifestPath}`);
    console.log(`Checksums: ${result.checksumsPath}`);
    console.log(`Local paths redacted: ${result.localPathsRedacted ? "yes" : "no"}`);
    console.log(`Sensitive values redacted: ${result.sensitiveValuesRedacted ? "yes" : "no"}`);
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

const enterprise = program.command("enterprise").description("Enterprise-local verification utilities");
enterprise
  .command("verify")
  .requiredOption("--report <auditDir>", "Audit directory")
  .option("--allow-pending", "Allow agent_review_pending business-grade state as a warning")
  .option("--baseline <auditDir>", "Optional baseline audit directory for score-drift checks")
  .option("--max-score-drop <number>", "Maximum allowed score drop when baseline is supplied", parseNonNegativeIntValue)
  .option("--format <format>", "summary or json", "summary")
  .action(async (options) => {
    const auditDir = String(options.report);
    const result = await verifyEnterpriseAudit({
      auditDir,
      allowPending: options.allowPending === true,
      baselineAuditDir: stringOption(options.baseline),
      maxScoreDrop: typeof options.maxScoreDrop === "number" ? Number(options.maxScoreDrop) : undefined
    });
    await writeJsonFile(path.join(auditDir, "report", "enterprise-verify.json"), result);
    if (options.format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Enterprise verify: ${result.status}`);
      console.log(`Pages: ${result.summary.pages}`);
      console.log(`Findings: ${result.summary.findings}`);
      console.log(`Screenshots: ${result.summary.screenshots}`);
      console.log(`Business-grade status: ${result.summary.businessGradeStatus}`);
      for (const check of result.checks) {
        console.log(`- ${check.status}: ${check.name} - ${check.message}`);
      }
      console.log(`Result JSON: ${path.join(auditDir, "report", "enterprise-verify.json")}`);
    }
    if (result.status === "fail") {
      process.exitCode = 1;
    }
  });
enterprise
  .command("retention-plan")
  .requiredOption("--report <auditDir>", "Audit directory")
  .option("--format <format>", "summary or json", "summary")
  .action(async (options) => {
    const auditDir = String(options.report);
    const result = await planAuditRetention(auditDir);
    await writeJsonFile(path.join(auditDir, "report", "retention-plan.json"), result);
    if (options.format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Retention plan: ${path.join(auditDir, "report", "retention-plan.json")}`);
      console.log(`Files: ${result.totals.files}`);
      console.log(`Bytes: ${result.totals.bytes}`);
      console.log(`Cleanup candidates: ${result.totals.cleanupCandidates}`);
      for (const group of result.groups) {
        console.log(`- ${group.name}: ${group.policy}, ${group.files} files, ${group.bytes} bytes`);
      }
    }
  });
enterprise
  .command("fixtures")
  .option("--format <format>", "summary or json", "summary")
  .action((options) => {
    const manifest = enterpriseFixtureManifest();
    if (options.format === "json") {
      console.log(JSON.stringify(manifest, null, 2));
    } else {
      console.log(`Enterprise fixture corpus: ${manifest.fixtures.length} archetypes`);
      for (const fixture of manifest.fixtures) {
        console.log(`- ${fixture.id}: ${fixture.archetype}`);
      }
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
    console.log(`Status: ${result.status}`);
    for (const run of result.runs) {
      const delta = run.scoreDelta === undefined ? "" : ` delta ${run.scoreDelta >= 0 ? "+" : ""}${run.scoreDelta}`;
      console.log(`- ${run.status}: ${run.name}: ${run.score}/100, ${run.findings} findings, ${run.highSeverityFindings} high-severity${delta}`);
      for (const failure of run.thresholdFailures) console.log(`  gate: ${failure}`);
      console.log(`  ${run.auditRoot}`);
    }
    if (result.status === "fail") {
      process.exitCode = 1;
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
  status: "ready" | "failed" | "agent_review_pending";
  auditId: string;
  url: string;
  mode: string;
  reviewMode: ReviewMode;
  auditRoot: string;
  reportRoot: string;
  score: number;
  findings: number;
  businessGradeStatus: string;
  businessGradeGate?: unknown;
  providerReview?: ProviderReviewCloseout;
  businessGradeCompletion: {
    status: "complete" | "running_agent_visual_review_required" | "not_requested";
    providerAutoImportAttempted: boolean;
    runningAgentFallbackRequired: boolean;
    requiredActions: string[];
  };
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
    evidenceBrief: string;
    evidenceIndex: string;
    evidenceJsonl: string;
    sourceCandidates: string;
    repoAnalysis: string;
    patchPlan: string;
    changedFiles: string;
    performanceAudit: string;
    accessibilityDetail: string;
    privacyTracking: string;
    resourceAudit: string;
    interactionStates: string;
    relatedWorkflows: string;
    enterpriseReadiness: string;
    learningsReadme: string;
    learningsTemplate: string;
    runRetrospective: string;
    stakeholderRecommendations: string;
    beforeAfterComparison: string;
    designBenchmark: string;
    standardsRegistry: string;
    suppressionReport: string;
    businessGradeGate: string;
    providerReview: string;
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

type ProviderReviewCloseout = {
  mode: ReviewMode;
  status: "not_requested" | "skipped_manual" | "completed" | "pending_no_provider" | "failed";
  attempted: boolean;
  retryCount: number;
  manualSignoffRecommended: boolean;
  provider?: string;
  model?: string;
  generatedReviewPath?: string;
  rawProviderOutputPath?: string;
  canonicalReviewPath?: string;
  businessGradeGateStatus?: string;
  errorCategory?: string;
  message?: string;
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
    .option("--related-workflow <kind:path>", "Related local workflow artifact, e.g. seo:/path/to/seo-audit", collectRepeatedOption, [])
    .option("--repo <path>", "Target website source repository for read-only source candidates")
    .option("--audit-root <dir>", "Audit output root")
    .option("--audit-name <name>", "Human-readable audit/site name used for the site folder slug")
    .option("--output <dir>", "Explicit audit output directory override")
    .option("--config <path>", "Optional YAML or JSON config file")
    .option("--no-capture-settle-scroll", "Disable pre-screenshot scroll settling for reveal/lazy content")
    .option("--no-capture-reduced-motion", "Do not request prefers-reduced-motion during capture")
    .option("--capture-scroll-passes <number>", "Viewport scroll passes before screenshots", parseIntValue)
    .option("--capture-settle-timeout <ms>", "Maximum milliseconds to wait for visual readiness", parseIntValue)
    .option("--capture-retries <number>", "Retry count for transient page capture failures", parseNonNegativeIntValue)
    .option("--provider-retries <number>", "Retry count for transient provider visual-review failures", parseNonNegativeIntValue)
    .option("--no-interaction-state-capture", "Disable safe modal, menu, tab, accordion, and popover state screenshots")
    .option("--max-interaction-states <number>", "Maximum safe interaction states to capture per page", parseIntValue)
    .option("--max-interaction-states-per-viewport <number>", "Maximum safe interaction states to capture per viewport", parseIntValue)
    .option("--no-pdf", "Disable PDF output")
    .option("--no-html", "Disable full HTML report output")
    .option("--no-markdown", "Disable full Markdown report output")
    .option("--no-strict", "Do not fail the command on lint warnings")
    .option("--business-grade", "Build the visual review pack and require agent visual review import before business-grade pass")
    .option("--review-mode <mode>", "Business-grade review mode: auto, manual, or hybrid", "auto")
    .option("--format <format>", "summary or json", "summary")
    .action(async (url, options) => {
      const format = options.format === "json" ? "json" : "summary";
      const reviewMode = normalizeReviewMode(String(options.reviewMode ?? "auto"));
      const result = await runFromOptions(url, { ...options, reviewMode, quiet: format === "json" });
      let businessGate: unknown | undefined;
      let providerReview: ProviderReviewCloseout | undefined;
      if (options.businessGrade) {
        const prepared = await runBusinessGradeLane(result, reviewMode, format !== "json");
        businessGate = prepared.businessGate;
        providerReview = prepared.providerReview;
      }
      const lint = await lintAuditReport(result.auditRoot, options.strict !== false);
      const closeout = closeoutFromRunResult(result, lint, businessGate, providerReview);
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

async function runBusinessGradeLane(
  result: RunAuditResult,
  reviewMode: ReviewMode,
  verbose: boolean
): Promise<{ businessGate: unknown; providerReview: ProviderReviewCloseout }> {
  const pending = await markAgentReviewPending(result.auditRoot);
  result.report = pending.report;
  result.outputs = pending.outputs;
  const packRoot = path.join(result.auditRoot, "report", "agent-review-pack");
  const packManifest = path.join(packRoot, "review-pack-manifest.json");
  if (!(await exists(packManifest))) {
    await buildReviewPack(result.auditRoot);
  }

  if (reviewMode === "manual") {
    const providerReview: ProviderReviewCloseout = {
      mode: reviewMode,
      status: "skipped_manual",
      attempted: false,
      retryCount: 0,
      manualSignoffRecommended: true,
      message: "Manual review mode selected. Provider-backed visual review was not attempted."
    };
    await writeProviderReviewArtifact(result.auditRoot, providerReview);
    printBusinessGradePack(result.auditRoot, verbose, providerReview);
    return { businessGate: pending.gate, providerReview };
  }

  const generation = await generateAgentVisualReviewWithRetry(result.auditRoot, result.report.config.retries.provider);
  if (generation.result) {
    result.report = generation.result.report;
    result.outputs = generation.result.outputs;
    const providerReview: ProviderReviewCloseout = {
      mode: reviewMode,
      status: "completed",
      attempted: true,
      retryCount: generation.retryCount,
      manualSignoffRecommended: reviewMode === "hybrid",
      provider: generation.result.provider,
      model: generation.result.model,
      generatedReviewPath: generation.result.generatedReviewPath,
      rawProviderOutputPath: generation.result.rawProviderOutputPath,
      canonicalReviewPath: generation.result.canonicalReviewPath,
      businessGradeGateStatus: generation.result.gate.status,
      message:
        reviewMode === "hybrid"
          ? "Provider-backed visual review completed. Hybrid mode records that stakeholder signoff is still recommended."
          : "Provider-backed visual review completed, validated, imported, and linted."
    };
    await writeProviderReviewArtifact(result.auditRoot, providerReview);
    printBusinessGradePack(result.auditRoot, verbose, providerReview);
    return { businessGate: generation.result.gate, providerReview };
  }

  const errorCategory = classifyProviderError(generation.error);
  const providerReview: ProviderReviewCloseout = {
    mode: reviewMode,
    status: errorCategory === "no_provider" ? "pending_no_provider" : "failed",
    attempted: errorCategory !== "no_provider",
    retryCount: generation.retryCount,
    manualSignoffRecommended: true,
    errorCategory,
    message: generation.error instanceof Error ? generation.error.message : String(generation.error ?? "Unknown provider error")
  };
  await writeProviderReviewArtifact(result.auditRoot, providerReview);
  printBusinessGradePack(result.auditRoot, verbose, providerReview);
  return { businessGate: pending.gate, providerReview };
}

async function generateAgentVisualReviewWithRetry(
  auditRoot: string,
  retries: number
): Promise<{ result?: Awaited<ReturnType<typeof generateAgentVisualReview>>; error?: unknown; retryCount: number }> {
  let retryCount = 0;
  let lastError: unknown;
  const maxAttempts = Math.max(1, retries + 1);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return {
        result: await generateAgentVisualReview(auditRoot, { provider: "auto" }),
        retryCount
      };
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts - 1 || !isRetryableProviderError(error)) break;
      retryCount += 1;
      await sleep(750);
    }
  }
  return { error: lastError, retryCount };
}

function classifyProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/no (model provider|llm provider)|no model provider configured/i.test(message)) return "no_provider";
  if (/401|403|unauthorized|forbidden|invalid api key|authentication|auth/i.test(message)) return "provider_auth";
  if (/unsupported agent-review provider|model env|api[_ -]?key.*model/i.test(message)) return "provider_config";
  if (/timeout|timed out|aborted/i.test(message)) return "provider_timeout";
  if (/fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN|socket|TLS/i.test(message)) return "provider_network";
  if (/schema|zod|parse|json|AgentVisualReview/i.test(message)) return "provider_schema";
  if (/business-grade|validation|screenshot/i.test(message)) return "provider_validation";
  if (/429|500|502|503|504|rate limit|temporarily/i.test(message)) return "provider_network";
  return "unknown";
}

function isRetryableProviderError(error: unknown): boolean {
  const category = classifyProviderError(error);
  return category === "provider_timeout" || category === "provider_network";
}

async function writeProviderReviewArtifact(auditRoot: string, providerReview: ProviderReviewCloseout): Promise<void> {
  await writeJsonFile(path.join(auditRoot, "report", "provider-review.json"), {
    schemaVersion: "design-review-workflow.provider-review.v1",
    generatedAt: new Date().toISOString(),
    ...providerReview
  });
}

function printBusinessGradePack(auditRoot: string, verbose: boolean, providerReview: ProviderReviewCloseout): void {
  if (!verbose) return;
  const packRoot = path.join(auditRoot, "report", "agent-review-pack");
  console.log("");
  console.log("Business-grade review lane complete.");
  console.log(`Review mode: ${providerReview.mode}`);
  console.log(`Provider review: ${providerReview.status}`);
  console.log(`Review pack: ${packRoot}`);
  console.log(`Review pack manifest: ${path.join(packRoot, "review-pack-manifest.json")}`);
  console.log(`Review gallery: ${path.join(packRoot, "gallery", "index.html")}`);
  console.log(`First viewports: ${path.join(auditRoot, "report", "contact-sheets", "first-viewports.png")}`);
  console.log(`Contact sheets: ${path.join(auditRoot, "report", "contact-sheets")}`);
  if (providerReview.status !== "completed") {
    console.log(`Import required: node apps/cli/dist/index.js agent-review import --report ${auditRoot} --file agent-runs/<agent>/visual-review.json`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function businessGradeCompletionCloseout(result: RunAuditResult, providerReview?: ProviderReviewCloseout): AgentCloseout["businessGradeCompletion"] {
  if (result.report.businessGradeStatus === "business_grade") {
    return {
      status: "complete",
      providerAutoImportAttempted: providerReview?.attempted === true,
      runningAgentFallbackRequired: false,
      requiredActions: []
    };
  }
  if (result.report.businessGradeStatus === "agent_review_pending") {
    return {
      status: "running_agent_visual_review_required",
      providerAutoImportAttempted: providerReview?.status === "completed" || providerReview?.attempted === true,
      runningAgentFallbackRequired: true,
      requiredActions: [
        `Inspect ${path.join(result.auditRoot, "report", "agent-review-pack", "review-pack-manifest.json")}.`,
        "Visually review the gallery, contact sheets, interaction state screenshots, and raw screenshots.",
        "Write agent-runs/<agent>/visual-review.json using report/agent-review-pack/agent-review-template.json.",
        `Run node apps/cli/dist/index.js agent-review validate --report ${result.auditRoot} --file agent-runs/<agent>/visual-review.json.`,
        `Run node apps/cli/dist/index.js agent-review import --report ${result.auditRoot} --file agent-runs/<agent>/visual-review.json.`,
        `Run node apps/cli/dist/index.js business-grade lint --report ${result.auditRoot}.`,
        "Add a concise learning note under report/learnings/ if the run exposed reusable workflow feedback."
      ]
    };
  }
  return {
    status: "not_requested",
    providerAutoImportAttempted: false,
    runningAgentFallbackRequired: false,
    requiredActions: []
  };
}

function closeoutFromRunResult(
  result: RunAuditResult,
  lint: ReportLintResult,
  businessGate?: unknown,
  providerReview?: ProviderReviewCloseout
): AgentCloseout {
  const reportRoot = path.join(result.auditRoot, "report");
  return {
    schemaVersion: "design-review-workflow.cli-closeout.v1",
    status: lint.status !== "pass" ? "failed" : (businessGate as { status?: string } | undefined)?.status === "fail" ? "agent_review_pending" : "ready",
    auditId: result.report.auditId,
    url: result.report.config.url,
    mode: result.report.config.mode,
    reviewMode: result.report.config.reviewMode,
    auditRoot: result.auditRoot,
    reportRoot,
    score: result.report.scorecard.overallScore,
    findings: result.report.findings.length,
    businessGradeStatus: result.report.businessGradeStatus,
    businessGradeGate: businessGate,
    providerReview,
    businessGradeCompletion: businessGradeCompletionCloseout(result, providerReview),
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
  const report = (await readOptionalJson(entry.reportJson)) as
    | { businessGradeStatus?: string; scorecard?: { overallScore?: number }; findings?: unknown[]; config?: { reviewMode?: string } }
    | undefined;
  const businessGradeStatus = report?.businessGradeStatus ?? "unknown";
  const technicalPass = qualityGate && (qualityGate as { status?: string }).status === "pass";
  const status = technicalPass ? (businessGradeStatus === "agent_review_pending" ? "agent_review_pending" : "ready") : "failed";
  return {
    schemaVersion: "design-review-workflow.cli-closeout.v1",
    status,
    auditId: entry.auditId,
    url: entry.url,
    mode: entry.mode,
    reviewMode: report?.config?.reviewMode ? normalizeReviewMode(report.config.reviewMode) : "manual",
    auditRoot: entry.auditRoot,
    reportRoot: path.join(entry.auditRoot, "report"),
    score: report?.scorecard?.overallScore ?? entry.overallScore,
    findings: Array.isArray(report?.findings) ? report.findings.length : entry.findings,
    businessGradeStatus,
    businessGradeCompletion: {
      status: businessGradeStatus === "business_grade" ? "complete" : businessGradeStatus === "agent_review_pending" ? "running_agent_visual_review_required" : "not_requested",
      providerAutoImportAttempted: false,
      runningAgentFallbackRequired: businessGradeStatus === "agent_review_pending",
      requiredActions:
        businessGradeStatus === "agent_review_pending"
          ? [
              "Inspect report/agent-review-pack/review-pack-manifest.json and gallery/contact sheets.",
              "Write agent-runs/<agent>/visual-review.json.",
              "Run agent-review validate, agent-review import, then business-grade lint."
            ]
          : []
    },
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
    evidenceBrief: path.join(reportRoot, "evidence-brief.json"),
    evidenceIndex: path.join(reportRoot, "evidence-index.json"),
    evidenceJsonl: path.join(reportRoot, "evidence.jsonl"),
    sourceCandidates: path.join(reportRoot, "source-candidates.json"),
    repoAnalysis: path.join(reportRoot, "repo-analysis.json"),
    patchPlan: path.join(reportRoot, "patch-plan.md"),
    changedFiles: path.join(reportRoot, "changed-files.json"),
    performanceAudit: path.join(reportRoot, "performance-audit.json"),
    accessibilityDetail: path.join(reportRoot, "accessibility-detail.json"),
    privacyTracking: path.join(reportRoot, "privacy-tracking.json"),
    resourceAudit: path.join(reportRoot, "resource-audit.json"),
    interactionStates: path.join(reportRoot, "interaction-states.json"),
    relatedWorkflows: path.join(reportRoot, "related-workflows.json"),
    enterpriseReadiness: path.join(reportRoot, "enterprise-readiness.json"),
    learningsReadme: path.join(reportRoot, "learnings", "README.md"),
    learningsTemplate: path.join(reportRoot, "learnings", "agent-learning-template.md"),
    runRetrospective: path.join(reportRoot, "learnings", "run-retrospective.json"),
    stakeholderRecommendations: path.join(reportRoot, "stakeholder-recommendations.md"),
    beforeAfterComparison: path.join(reportRoot, "before-after-comparison.md"),
    designBenchmark: path.join(reportRoot, "design-benchmark.json"),
    standardsRegistry: path.join(reportRoot, "standards-registry.json"),
    suppressionReport: path.join(reportRoot, "suppression-report.json"),
    businessGradeGate: path.join(reportRoot, "business-grade-gate.json"),
    providerReview: path.join(reportRoot, "provider-review.json"),
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
  console.log(`Review mode: ${closeout.reviewMode}`);
  if (closeout.providerReview) {
    console.log(`Provider review: ${closeout.providerReview.status}`);
    if (closeout.providerReview.errorCategory) {
      console.log(`Provider issue: ${closeout.providerReview.errorCategory} - ${closeout.providerReview.message ?? ""}`);
    }
  }
  if (closeout.status === "agent_review_pending") {
    console.log(`Business-grade gate: agent review pending`);
    console.log(`Required: running agent must complete visual review import before business-grade closeout`);
    console.log(`Review pack: ${closeout.files.reviewPack}`);
    console.log(`Review pack manifest: ${closeout.files.reviewPackManifest}`);
    console.log(`Review gallery: ${closeout.files.reviewPackGallery}`);
  }
  console.log(`Score: ${closeout.score}`);
  console.log(`Findings: ${closeout.findings}`);
  console.log(`Read: ${closeout.files.agentExecutionPlan}`);
  console.log(`Evidence brief: ${closeout.files.evidenceBrief}`);
  console.log(`Source candidates: ${closeout.files.sourceCandidates}`);
  console.log(`Design benchmark: ${closeout.files.designBenchmark}`);
  console.log(`Learnings: ${closeout.files.learningsReadme}`);
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
      primaryRun: "node apps/cli/dist/index.js run <url> --business-grade --review-mode auto --format json [--repo <target-source-repo>] [--related-workflow seo:/path/to/seo-audit] [--audit-root ./audit-reports]",
      npmRun: "npm run agent -- <url> --repo <target-source-repo> --audit-root ./audit-reports",
      lint: "node apps/cli/dist/index.js report lint <audit-dir> --strict",
      plan: "node apps/cli/dist/index.js plan build --report <audit-dir>",
      reviewPack: "node apps/cli/dist/index.js review-pack build --report <audit-dir>",
      agentReviewValidate: "node apps/cli/dist/index.js agent-review validate --report <audit-dir> --file <visual-review.json>",
      agentReviewImport: "node apps/cli/dist/index.js agent-review import --report <audit-dir> --file <visual-review.json>",
      businessGradeLint: "node apps/cli/dist/index.js business-grade lint --report <audit-dir>",
      enterpriseVerify: "node apps/cli/dist/index.js enterprise verify --report <audit-dir>",
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
      "report/performance-audit.json",
      "report/accessibility-detail.json",
      "report/privacy-tracking.json",
      "report/resource-audit.json",
      "report/interaction-states.json",
      "report/related-workflows.json",
      "report/enterprise-readiness.json",
      "report/stakeholder-recommendations.md",
      "report/before-after-comparison.md",
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
    agentCommunication: {
      mode: "quiet_execution_final_closeout",
      noIntermediateChatter: true,
      rules: [
        "Use the JSON closeout path for agent-run work.",
        "Do not send routine progress narration, command logs, raw JSON dumps, or partial findings in chat.",
        "Send interim chat only when blocked, when user approval is required, or when the user explicitly asks for status.",
        "Final chat should summarize deliverable paths, gate statuses, score/findings count, top evidence-backed findings, and limitations."
      ]
    },
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
    relatedWorkflows: mergeRelatedWorkflows(fileInput.relatedWorkflows, Array.isArray(options.relatedWorkflow) ? options.relatedWorkflow.map(String) : []),
    reviewMode: normalizeReviewMode(String(options.reviewMode ?? fileInput.reviewMode ?? "auto")),
    auditRoot: stringOption(options.auditRoot) ?? fileInput.auditRoot,
    auditName: stringOption(options.auditName) ?? fileInput.auditName,
    auditSlug: fileInput.auditSlug,
    auditRunId: fileInput.auditRunId,
    outputDir: stringOption(options.output) ?? fileInput.outputDir,
    outputPdf: options.pdf !== false,
    outputHtml: options.html !== false,
    outputJson: options.json !== false,
    outputMarkdown: options.markdown !== false,
    capture: {
      ...(fileInput.capture ?? {}),
      settleScroll:
        typeof options.captureSettleScroll === "boolean"
          ? options.captureSettleScroll
          : fileInput.capture?.settleScroll,
      reducedMotion:
        typeof options.captureReducedMotion === "boolean"
          ? options.captureReducedMotion
          : fileInput.capture?.reducedMotion,
      maxScrollPasses:
        typeof options.captureScrollPasses === "number"
          ? Number(options.captureScrollPasses)
          : fileInput.capture?.maxScrollPasses,
      settleTimeoutMs:
        typeof options.captureSettleTimeout === "number"
          ? Number(options.captureSettleTimeout)
          : fileInput.capture?.settleTimeoutMs
    },
    interactions: {
      ...(fileInput.interactions ?? {}),
      captureStates:
        typeof options.interactionStateCapture === "boolean"
          ? options.interactionStateCapture
          : fileInput.interactions?.captureStates,
      maxStateCapturesPerPage:
        typeof options.maxInteractionStates === "number"
          ? Number(options.maxInteractionStates)
          : fileInput.interactions?.maxStateCapturesPerPage,
      maxStateCapturesPerViewport:
        typeof options.maxInteractionStatesPerViewport === "number"
          ? Number(options.maxInteractionStatesPerViewport)
          : fileInput.interactions?.maxStateCapturesPerViewport
    },
    retries: {
      ...(fileInput.retries ?? {}),
      capture:
        typeof options.captureRetries === "number"
          ? Number(options.captureRetries)
          : fileInput.retries?.capture,
      provider:
        typeof options.providerRetries === "number"
          ? Number(options.providerRetries)
          : fileInput.retries?.provider
    }
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
  const capture = audit.capture && typeof audit.capture === "object" ? (audit.capture as Record<string, unknown>) : {};
  const interactions = audit.interactions && typeof audit.interactions === "object" ? (audit.interactions as Record<string, unknown>) : {};
  const retries = audit.retries && typeof audit.retries === "object" ? (audit.retries as Record<string, unknown>) : {};
  const privacy = audit.privacy && typeof audit.privacy === "object" ? (audit.privacy as Record<string, unknown>) : {};
  const retention = audit.retention && typeof audit.retention === "object" ? (audit.retention as Record<string, unknown>) : {};
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
    relatedWorkflows: parseRelatedWorkflowConfig(audit.relatedWorkflows ?? audit.related_workflows),
    reviewMode: typeof audit.reviewMode === "string" ? normalizeReviewMode(audit.reviewMode) : typeof audit.review_mode === "string" ? normalizeReviewMode(audit.review_mode) : undefined,
    auditRoot: typeof audit.auditRoot === "string" ? audit.auditRoot : typeof audit.audit_root === "string" ? audit.audit_root : undefined,
    auditName: typeof audit.auditName === "string" ? audit.auditName : typeof audit.audit_name === "string" ? audit.audit_name : undefined,
    auditSlug: typeof audit.auditSlug === "string" ? audit.auditSlug : typeof audit.audit_slug === "string" ? audit.audit_slug : undefined,
    auditRunId: typeof audit.auditRunId === "string" ? audit.auditRunId : typeof audit.audit_run_id === "string" ? audit.audit_run_id : undefined,
    outputDir: typeof audit.outputDir === "string" ? audit.outputDir : typeof audit.output === "string" ? audit.output : undefined,
    capture: {
      settleScroll: booleanOption(capture.settleScroll) ?? booleanOption(capture.settle_scroll),
      reducedMotion: booleanOption(capture.reducedMotion) ?? booleanOption(capture.reduced_motion),
      waitForImages: booleanOption(capture.waitForImages) ?? booleanOption(capture.wait_for_images),
      maxScrollPasses: numberOption(capture.maxScrollPasses) ?? numberOption(capture.max_scroll_passes),
      scrollStepRatio: numberOption(capture.scrollStepRatio) ?? numberOption(capture.scroll_step_ratio),
      stepDelayMs: numberOption(capture.stepDelayMs) ?? numberOption(capture.step_delay_ms),
      settleTimeoutMs: numberOption(capture.settleTimeoutMs) ?? numberOption(capture.settle_timeout_ms)
    },
    interactions: {
      level: numberOption(interactions.level),
      captureStates: booleanOption(interactions.captureStates) ?? booleanOption(interactions.capture_states),
      maxStateCapturesPerPage:
        numberOption(interactions.maxStateCapturesPerPage) ?? numberOption(interactions.max_state_captures_per_page),
      maxStateCapturesPerViewport:
        numberOption(interactions.maxStateCapturesPerViewport) ?? numberOption(interactions.max_state_captures_per_viewport),
      allowCheckoutStart: booleanOption(interactions.allowCheckoutStart) ?? booleanOption(interactions.allow_checkout_start),
      allowFormErrorChecks: booleanOption(interactions.allowFormErrorChecks) ?? booleanOption(interactions.allow_form_error_checks),
      allowPurchase: booleanOption(interactions.allowPurchase) ?? booleanOption(interactions.allow_purchase),
      allowLogin: booleanOption(interactions.allowLogin) ?? booleanOption(interactions.allow_login)
    },
    retries: {
      capture: numberOption(retries.capture),
      provider: numberOption(retries.provider),
      export: numberOption(retries.export)
    },
    privacy: {
      redactLocalPathsInExports: booleanOption(privacy.redactLocalPathsInExports) ?? booleanOption(privacy.redact_local_paths_in_exports),
      redactSecretsInExports: booleanOption(privacy.redactSecretsInExports) ?? booleanOption(privacy.redact_secrets_in_exports),
      redactCookiesInReports: booleanOption(privacy.redactCookiesInReports) ?? booleanOption(privacy.redact_cookies_in_reports)
    },
    retention: {
      screenshots: retention.screenshots === "plan_cleanup" ? "plan_cleanup" : retention.screenshots === "keep" ? "keep" : undefined,
      providerPayloads:
        retention.providerPayloads === "plan_cleanup"
          ? "plan_cleanup"
          : retention.provider_payloads === "plan_cleanup"
            ? "plan_cleanup"
            : retention.providerPayloads === "keep" || retention.provider_payloads === "keep"
              ? "keep"
              : undefined,
      exports: retention.exports === "plan_cleanup" ? "plan_cleanup" : retention.exports === "keep" ? "keep" : undefined,
      maxAgeDays: numberOption(retention.maxAgeDays) ?? numberOption(retention.max_age_days),
      dryRunOnly: booleanOption(retention.dryRunOnly) ?? booleanOption(retention.dry_run_only)
    }
  };
}

function normalizeMode(value: string): "quick_scan" | "full_audit" {
  if (value === "full" || value === "full_audit") return "full_audit";
  return "quick_scan";
}

function normalizeReviewMode(value: string): ReviewMode {
  if (value === "auto" || value === "manual" || value === "hybrid") return value;
  throw new Error(`Invalid review mode: ${value}. Expected auto, manual, or hybrid.`);
}

function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function mergeRelatedWorkflows(existing: RelatedWorkflowSpec[] | undefined, specs: string[]): RelatedWorkflowSpec[] {
  return [...(existing ?? []), ...specs.map(parseRelatedWorkflowSpec)];
}

function parseRelatedWorkflowConfig(value: unknown): RelatedWorkflowSpec[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error("relatedWorkflows config must be an array.");
  }
  return value.map((item) => {
    if (typeof item === "string") return parseRelatedWorkflowSpec(item);
    if (!item || typeof item !== "object") {
      throw new Error("Related workflow entries must be strings or objects.");
    }
    const record = item as Record<string, unknown>;
    if (record.kind !== "seo") {
      throw new Error(`Unsupported related workflow kind: ${String(record.kind)}. Only seo is supported.`);
    }
    if (typeof record.path !== "string" || !record.path.trim()) {
      throw new Error("Related workflow object requires a non-empty path.");
    }
    return {
      kind: "seo",
      path: record.path,
      label: typeof record.label === "string" && record.label.trim() ? record.label : undefined
    };
  });
}

function parseRelatedWorkflowSpec(value: string): RelatedWorkflowSpec {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`Invalid related workflow spec: ${value}. Expected kind:/path/to/audit.`);
  }
  const kind = value.slice(0, separator);
  const workflowPath = value.slice(separator + 1);
  if (kind !== "seo") {
    throw new Error(`Unsupported related workflow kind: ${kind}. Only seo is supported.`);
  }
  if (/^https?:\/\//i.test(workflowPath)) {
    throw new Error("Related workflow paths must be local filesystem paths for this local-first workflow.");
  }
  return {
    kind: "seo",
    path: workflowPath
  };
}

function parseIntValue(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return parsed;
}

function parseNonNegativeIntValue(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid non-negative integer: ${value}`);
  }
  return parsed;
}

function stringOption(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function booleanOption(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function numberOption(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
