import { access, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import type { AuditReport, RelatedWorkflowSpec } from "../schemas/audit.js";

export type RelatedWorkflowStatus = "available" | "missing" | "unreadable" | "unsupported";

export type RelatedWorkflowEntry = {
  kind: RelatedWorkflowSpec["kind"];
  label: string;
  inputPath: string;
  resolvedPath: string;
  status: RelatedWorkflowStatus;
  score?: number;
  scoreLabel?: string;
  manifestPath?: string;
  reportPath?: string;
  qualityGatePath?: string;
  qualityGateStatus?: string;
  limitations: string[];
  warnings: string[];
};

export type RelatedWorkflowsArtifact = {
  schemaVersion: "design-review-workflow.related-workflows.v1";
  auditId: string;
  generatedAt: string;
  workflows: RelatedWorkflowEntry[];
  policy: {
    mergeFindings: false;
    affectsDesignScore: false;
    note: string;
  };
};

export async function buildRelatedWorkflowsArtifact(report: AuditReport): Promise<RelatedWorkflowsArtifact> {
  const workflows: RelatedWorkflowEntry[] = [];
  for (const spec of report.config.relatedWorkflows) {
    workflows.push(await inspectRelatedWorkflow(spec));
  }
  return {
    schemaVersion: "design-review-workflow.related-workflows.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    workflows,
    policy: {
      mergeFindings: false,
      affectsDesignScore: false,
      note: "Related workflows are linked evidence only. SEO findings and scores are not merged into design findings or design scoring."
    }
  };
}

async function inspectRelatedWorkflow(spec: RelatedWorkflowSpec): Promise<RelatedWorkflowEntry> {
  const resolvedPath = path.resolve(spec.path);
  const label = spec.label ?? defaultLabel(spec.kind);
  const base: RelatedWorkflowEntry = {
    kind: spec.kind,
    label,
    inputPath: spec.path,
    resolvedPath,
    status: "missing",
    limitations: [
      "Linked SEO evidence is not merged into design findings.",
      "SEO checks were produced by the related workflow, not by design-review-workflow."
    ],
    warnings: []
  };

  if (spec.kind !== "seo") {
    return {
      ...base,
      status: "unsupported",
      warnings: [`Unsupported related workflow kind: ${spec.kind}`]
    };
  }

  const exists = await fileExists(resolvedPath);
  if (!exists) {
    return {
      ...base,
      status: "missing",
      limitations: [...base.limitations, "The related workflow path was not found. No SEO metadata was imported."]
    };
  }

  try {
    const root = (await stat(resolvedPath)).isDirectory() ? resolvedPath : path.dirname(resolvedPath);
    const manifestPath = await firstExisting(root, ["workflow-manifest.json", "report/workflow-manifest.json"]);
    const scorePath = await firstExisting(root, ["score.json", "report/score.json"]);
    const qualityGatePath = await firstExisting(root, ["quality-gate.json", "report/quality-gate.json", "validation.json", "report/validation.json"]);
    const reportPath = await firstExisting(root, ["index.html", "report/index.html", "report/hosted/index.html", "report/report.html"]);

    const manifest = manifestPath ? await readJsonRecord(manifestPath, base.warnings) : undefined;
    const scoreJson = scorePath ? await readJsonRecord(scorePath, base.warnings) : undefined;
    const qualityGate = qualityGatePath ? await readJsonRecord(qualityGatePath, base.warnings) : undefined;
    const score = extractScore(scoreJson) ?? extractScore(manifest);
    const qualityGateStatus = stringValue(qualityGate?.status) ?? stringValue(qualityGate?.result) ?? stringValue(manifest?.status);

    return {
      ...base,
      status: "available",
      score,
      scoreLabel: score === undefined ? undefined : "seo",
      manifestPath,
      reportPath,
      qualityGatePath,
      qualityGateStatus,
      warnings: base.warnings
    };
  } catch (error) {
    return {
      ...base,
      status: "unreadable",
      warnings: [error instanceof Error ? error.message : String(error)]
    };
  }
}

async function firstExisting(root: string, candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    const absolute = path.join(root, candidate);
    if (await fileExists(absolute)) return absolute;
  }
  return undefined;
}

async function readJsonRecord(filePath: string, warnings: string[]): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch (error) {
    warnings.push(`Could not read related workflow JSON ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function extractScore(value: Record<string, unknown> | undefined): number | undefined {
  if (!value) return undefined;
  const candidates = [
    value.score,
    value.overallScore,
    value.overall,
    recordValue(value.scorecard, "overallScore"),
    recordValue(value.scores, "overall"),
    recordValue(value.summary, "score"),
    recordValue(value.summary, "overallScore")
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.round(candidate);
    }
    if (typeof candidate === "string") {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) return Math.round(parsed);
    }
  }
  return undefined;
}

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function defaultLabel(kind: RelatedWorkflowSpec["kind"]): string {
  return kind === "seo" ? "SEO audit" : `${kind} audit`;
}

async function fileExists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false
  );
}
