import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { createModelRouterFromEnv, type ProviderEnv } from "../model/providers.js";
import type { LlmImageInput } from "../model/router.js";
import type { AgentVisualReview, AuditReport } from "../schemas/audit.js";
import { readReportFromAuditDir } from "../storage/index.js";
import { createNestedAuditPaths } from "../storage/project.js";
import { ensureDir, writeJson } from "../utils/fs.js";
import { parseAgentVisualReview } from "../review/business-grade.js";
import { buildReviewPack } from "./review-pack.js";
import type { EvidenceBrief } from "./evidence-brief.js";
import { importAgentVisualReview, type AgentReviewImportResult } from "./agent-review-import.js";

export type AgentReviewGenerateOptions = {
  provider?: string;
  env?: ProviderEnv;
  maxImages?: number;
};

export type AgentReviewGenerateResult = AgentReviewImportResult & {
  generatedReviewPath: string;
  rawProviderOutputPath: string;
  provider: string;
  model: string;
};

type ReviewPackManifestSubset = {
  gallery?: { path?: string };
  evidenceBrief?: { path?: string };
  recommendedReviewOrder?: Array<{ step: string; paths: string[] }>;
  sheets?: Array<{ type: string; path: string; screenshotIds: string[] }>;
};

export async function generateAgentVisualReview(auditDir: string, options: AgentReviewGenerateOptions = {}): Promise<AgentReviewGenerateResult> {
  if (options.provider && options.provider !== "auto") {
    throw new Error(`Unsupported agent-review provider "${options.provider}". Use --provider auto.`);
  }
  const router = createModelRouterFromEnv(options.env);
  if (!router.hasProviders()) {
    throw new Error("No model provider configured. Set OPENAI_API_KEY and OPENAI_MODEL, OPENROUTER_API_KEY and OPENROUTER_MODEL, ANTHROPIC_API_KEY and ANTHROPIC_MODEL, or GEMINI_API_KEY and GEMINI_MODEL.");
  }

  const paths = await createNestedAuditPaths(auditDir);
  const report = await readReportFromAuditDir(auditDir);
  const pack = await buildReviewPack(auditDir);
  const evidenceBriefPath = pack.evidenceBrief;
  const evidenceBrief = JSON.parse(await readFile(evidenceBriefPath, "utf8")) as EvidenceBrief;
  const schema = JSON.parse(await readFile(pack.schema, "utf8")) as unknown;
  const packManifest = JSON.parse(await readFile(path.join(pack.packRoot, "review-pack-manifest.json"), "utf8")) as ReviewPackManifestSubset;
  const images = await loadReviewImages(paths.report, packManifest, options.maxImages ?? 10);

  const response = await router.generate({
    profile: "vision_premium",
    schemaName: "AgentVisualReview",
    system: [
      "You are a senior website design, UX, and conversion reviewer.",
      "Inspect the supplied screenshots and evidence brief, then return exactly one JSON object matching the AgentVisualReview schema.",
      "Do not wrap the JSON in markdown. Do not leave TODO/template text. Do not claim analytics, revenue, heatmaps, users, competitor performance, or private brand rules unless explicitly supplied.",
      "Every visual finding and redesign action must cite known screenshot IDs or screenshot paths from the evidence."
    ].join(" "),
    input: {
      task: "Generate a strict business-grade AgentVisualReview for this audit.",
      evidenceBrief,
      evidenceBriefPath,
      reviewPack: {
        gallery: packManifest.gallery?.path,
        recommendedReviewOrder: packManifest.recommendedReviewOrder,
        sheets: packManifest.sheets?.map((sheet) => ({ type: sheet.type, path: sheet.path, screenshotIds: sheet.screenshotIds }))
      },
      schema
    },
    images
  });

  const reviewerSlug = slug(`${response.provider}-${response.model}`);
  const runRoot = path.join(paths.agentRuns, reviewerSlug);
  await ensureDir(runRoot);
  const rawProviderOutputPath = path.join(runRoot, "visual-review.raw.json");
  await writeJson(rawProviderOutputPath, {
    provider: response.provider,
    model: response.model,
    generatedAt: new Date().toISOString(),
    output: response.output,
    raw: response.raw
  });

  const review = parseAgentVisualReview(parseReviewOutput(response.output, report));
  const generatedReviewPath = path.join(runRoot, "visual-review.json");
  await writeJson(generatedReviewPath, review);
  const imported = await importAgentVisualReview(auditDir, generatedReviewPath);
  return {
    ...imported,
    generatedReviewPath,
    rawProviderOutputPath,
    provider: response.provider,
    model: response.model
  };
}

async function loadReviewImages(reportRoot: string, manifest: ReviewPackManifestSubset, maxImages: number): Promise<LlmImageInput[]> {
  const candidates = [
    "contact-sheets/first-viewports.png",
    ...(manifest.recommendedReviewOrder?.flatMap((step) => step.paths) ?? []),
    ...(manifest.sheets?.filter((sheet) => sheet.type === "issue_evidence").map((sheet) => sheet.path) ?? [])
  ];
  const seen = new Set<string>();
  const images: LlmImageInput[] = [];
  for (const relative of candidates) {
    if (!relative || seen.has(relative) || images.length >= maxImages) continue;
    seen.add(relative);
    const filePath = path.join(reportRoot, relative);
    try {
      images.push({
        name: relative,
        mediaType: "image/png",
        data: (await readFile(filePath)).toString("base64"),
        detail: relative.includes("first-viewports") ? "high" : "auto"
      });
    } catch {
      // Missing derived sheets should not prevent provider generation if other images exist.
    }
  }
  if (images.length === 0) {
    throw new Error("No review-pack images were available for provider-backed visual review generation.");
  }
  return images;
}

function parseReviewOutput(output: unknown, report: AuditReport): AgentVisualReview {
  if (output && typeof output === "object" && "schemaVersion" in output) {
    return output as AgentVisualReview;
  }
  if (typeof output !== "string") {
    throw new Error("Provider output did not contain a JSON AgentVisualReview object.");
  }
  const trimmed = output.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  try {
    return JSON.parse(candidate) as AgentVisualReview;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as AgentVisualReview;
    }
    throw new Error(`Provider output could not be parsed as AgentVisualReview JSON for audit ${report.auditId}.`);
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "provider";
}
