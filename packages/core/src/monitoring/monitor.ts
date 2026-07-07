import { readFile } from "node:fs/promises";
import * as path from "node:path";
import yaml from "js-yaml";
import { compareAuditDirs } from "../compare/compare.js";
import { createAuditConfig, type AuditInput } from "../config/defaults.js";
import { runAudit } from "../index.js";
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
  }>;
};

export type MonitorRunResult = {
  generatedAt: string;
  runs: Array<{
    name: string;
    url: string;
    auditRoot: string;
    score: number;
    findings: number;
    comparisonPath?: string;
    scoreDelta?: number;
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
    let comparisonPath: string | undefined;
    let scoreDelta: number | undefined;
    if (before) {
      const compare = await compareAuditDirs(before.auditRoot, result.auditRoot);
      comparisonPath = compare.outputPath;
      scoreDelta = compare.result.scoreDelta;
    }
    runs.push({
      name: monitor.name,
      url: monitor.url,
      auditRoot: result.auditRoot,
      score: result.report.scorecard.overallScore,
      findings: result.report.findings.length,
      comparisonPath,
      scoreDelta
    });
  }

  const output: MonitorRunResult = { generatedAt, runs };
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
        maxPages: 1
      }
    ]
  };
}

async function latestAuditForUrl(workspaceRoot: string, url: string) {
  const index = await readProjectIndex(workspaceRoot);
  const slug = siteSlug(url);
  return index.audits.find((audit) => audit.site === slug && audit.url === url);
}
