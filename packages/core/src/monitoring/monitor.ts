import { readFile } from "node:fs/promises";
import * as path from "node:path";
import yaml from "js-yaml";
import { compareAuditDirs } from "../compare/compare.js";
import { createAuditConfig, type AuditInput } from "../config/defaults.js";
import { runAudit } from "../index.js";
import { activeSuppressedFingerprints, applySuppressionLedger } from "../review/suppressions.js";
import { configuredAuditRoot } from "../storage/audit-output.js";
import { readProjectIndex } from "../storage/index.js";
import { writeJson } from "../utils/fs.js";
import { siteSlug } from "../utils/url.js";

export type MonitorConfig = {
  monitors: Array<{
    name: string;
    url: string;
    mode?: "quick_scan" | "full_audit";
    maxPages?: number;
    competitors?: string[];
    websiteGoal?: string;
    targetAudience?: string;
    industry?: string;
    brandContext?: string;
    suppressionFile?: string;
    thresholds?: MonitorThresholds;
  }>;
};

export type MonitorThresholds = {
  minimumScore?: number;
  maxFindings?: number;
  maxHighSeverityFindings?: number;
  maxScoreDrop?: number;
};

export type MonitorRunResult = {
  generatedAt: string;
  status: "pass" | "fail";
  runs: Array<{
    name: string;
    url: string;
    status: "pass" | "fail";
    auditRoot: string;
    score: number;
    findings: number;
    rawFindings: number;
    suppressedFindings: number;
    highSeverityFindings: number;
    comparisonPath?: string;
    scoreDelta?: number;
    thresholdFailures: string[];
  }>;
};

export async function loadMonitorConfig(configPath: string): Promise<MonitorConfig> {
  const raw = await readFile(configPath, "utf8");
  const parsed = configPath.endsWith(".json") ? JSON.parse(raw) : yaml.load(raw);
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as MonitorConfig).monitors)) {
    throw new Error("Monitor config must contain a monitors array.");
  }
  return parsed as MonitorConfig;
}

export async function runMonitorConfig(configPath: string, workspaceRoot = process.cwd()): Promise<MonitorRunResult> {
  const config = await loadMonitorConfig(configPath);
  const generatedAt = new Date().toISOString();
  const runs: MonitorRunResult["runs"] = [];

  for (const monitor of config.monitors) {
    const before = await latestAuditForUrl(workspaceRoot, monitor.url);
    const auditInput: AuditInput = {
      url: monitor.url,
      mode: monitor.mode ?? "quick_scan",
      maxPages: monitor.maxPages,
      competitors: monitor.competitors,
      websiteGoal: monitor.websiteGoal,
      targetAudience: monitor.targetAudience,
      industry: monitor.industry,
      brandContext: monitor.brandContext
    };
    const result = await runAudit(createAuditConfig(auditInput), { workspaceRoot });
    let suppressedFingerprints = new Set<string>();
    if (monitor.suppressionFile) {
      const suppressionPath = path.resolve(path.dirname(configPath), monitor.suppressionFile);
      const suppression = await applySuppressionLedger(result.auditRoot, suppressionPath);
      suppressedFingerprints = activeSuppressedFingerprints(suppression.report);
    }
    const effectiveFindings = result.report.findings.filter(
      (finding) => !suppressedFingerprints.has(finding.fingerprint ?? "")
    );
    let comparisonPath: string | undefined;
    let scoreDelta: number | undefined;
    if (before) {
      const compare = await compareAuditDirs(before.auditRoot, result.auditRoot);
      comparisonPath = compare.outputPath;
      scoreDelta = compare.result.scoreDelta;
    }
    const highSeverityFindings = effectiveFindings.filter((finding) => finding.severity === "critical" || finding.severity === "high").length;
    const thresholdFailures = evaluateThresholds(monitor.thresholds, {
      score: result.report.scorecard.overallScore,
      findings: effectiveFindings.length,
      highSeverityFindings,
      scoreDelta
    });
    runs.push({
      name: monitor.name,
      url: monitor.url,
      status: thresholdFailures.length === 0 ? "pass" : "fail",
      auditRoot: result.auditRoot,
      score: result.report.scorecard.overallScore,
      findings: effectiveFindings.length,
      rawFindings: result.report.findings.length,
      suppressedFindings: suppressedFingerprints.size,
      highSeverityFindings,
      comparisonPath,
      scoreDelta,
      thresholdFailures
    });
  }

  const output: MonitorRunResult = { generatedAt, status: runs.some((run) => run.status === "fail") ? "fail" : "pass", runs };
  const outputPath = path.join(configuredAuditRoot(undefined, workspaceRoot), "monitor-runs", `${generatedAt.replace(/[:.]/g, "-")}.json`);
  await writeJson(outputPath, output);
  return output;
}

export function sampleMonitorConfig(): MonitorConfig {
  return {
    monitors: [
      {
        name: "Example",
        url: "https://example.com",
        mode: "quick_scan",
        maxPages: 1,
        thresholds: {
          minimumScore: 60,
          maxFindings: 12,
          maxHighSeverityFindings: 3,
          maxScoreDrop: 8
        }
      }
    ]
  };
}

function evaluateThresholds(
  thresholds: MonitorThresholds | undefined,
  metrics: { score: number; findings: number; highSeverityFindings: number; scoreDelta?: number }
): string[] {
  if (!thresholds) return [];
  const failures: string[] = [];
  if (typeof thresholds.minimumScore === "number" && metrics.score < thresholds.minimumScore) {
    failures.push(`score ${metrics.score} is below minimum ${thresholds.minimumScore}`);
  }
  if (typeof thresholds.maxFindings === "number" && metrics.findings > thresholds.maxFindings) {
    failures.push(`findings ${metrics.findings} exceed max ${thresholds.maxFindings}`);
  }
  if (typeof thresholds.maxHighSeverityFindings === "number" && metrics.highSeverityFindings > thresholds.maxHighSeverityFindings) {
    failures.push(`high-severity findings ${metrics.highSeverityFindings} exceed max ${thresholds.maxHighSeverityFindings}`);
  }
  if (
    typeof thresholds.maxScoreDrop === "number" &&
    typeof metrics.scoreDelta === "number" &&
    metrics.scoreDelta < 0 &&
    Math.abs(metrics.scoreDelta) > thresholds.maxScoreDrop
  ) {
    failures.push(`score dropped ${Math.abs(metrics.scoreDelta)} points, exceeding max drop ${thresholds.maxScoreDrop}`);
  }
  return failures;
}

async function latestAuditForUrl(workspaceRoot: string, url: string) {
  const index = await readProjectIndex(workspaceRoot);
  const slug = siteSlug(url);
  return index.audits.find((audit) => audit.site === slug && audit.url === url);
}
