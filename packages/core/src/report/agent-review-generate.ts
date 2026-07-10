import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import * as path from "node:path";
import { createModelRouterFromEnv, type ProviderEnv } from "../model/providers.js";
import type { LlmImageInput } from "../model/router.js";
import { AgentPageReviewSchema, AgentVisualFindingSchema, type AgentVisualReview, type AuditReport } from "../schemas/audit.js";
import { z } from "zod";
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
  pageBatchSize?: number;
  forceStaged?: boolean;
};

export type AgentReviewGenerateResult = AgentReviewImportResult & {
  generatedReviewPath: string;
  rawProviderOutputPath: string;
  provider: string;
  model: string;
  stagedPageBatches: number;
};

type ReviewPackManifestSubset = {
  gallery?: { path?: string };
  evidenceBrief?: { path?: string };
  recommendedReviewOrder?: Array<{ step: string; paths: string[] }>;
  sheets?: Array<{ type: string; path: string; screenshotIds: string[]; pageId?: string; issueId?: string }>;
};

export async function generateAgentVisualReview(auditDir: string, options: AgentReviewGenerateOptions = {}): Promise<AgentReviewGenerateResult> {
  const requestedProvider = options.provider ?? "auto";
  if (!new Set(["auto", "openai", "openrouter", "anthropic", "gemini"]).has(requestedProvider)) {
    throw new Error(`Unsupported agent-review provider "${requestedProvider}".`);
  }
  const report = await readReportFromAuditDir(auditDir);
  const allowedProviders = configuredProviderAllowlist(report);
  const router = createModelRouterFromEnv(options.env, { allowedProviders });
  if (!router.hasProviders()) {
    throw new Error("No model provider configured. Set OPENAI_API_KEY and OPENAI_MODEL, OPENROUTER_API_KEY and OPENROUTER_MODEL, ANTHROPIC_API_KEY and ANTHROPIC_MODEL, or GEMINI_API_KEY and GEMINI_MODEL.");
  }

  const paths = await createNestedAuditPaths(auditDir);
  const pack = await buildReviewPack(auditDir);
  const evidenceBriefPath = pack.evidenceBrief;
  const evidenceBrief = JSON.parse(await readFile(evidenceBriefPath, "utf8")) as EvidenceBrief;
  const schema = JSON.parse(await readFile(pack.schema, "utf8")) as unknown;
  const packManifest = JSON.parse(await readFile(path.join(pack.packRoot, "review-pack-manifest.json"), "utf8")) as ReviewPackManifestSubset;
  const images = await loadReviewImages(paths.report, packManifest, options.maxImages ?? 24);
  const staged = options.forceStaged || report.pages.length > (options.pageBatchSize ?? 4)
    ? await generateStagedPageReviews(router, requestedProvider, report, evidenceBrief, paths.report, packManifest, options.pageBatchSize ?? 4)
    : [];
  const requestInput = {
    task: "Generate a strict business-grade AgentVisualReview for this audit.",
    evidenceBrief,
    evidenceBriefPath,
    reviewPack: {
      gallery: packManifest.gallery?.path,
      recommendedReviewOrder: packManifest.recommendedReviewOrder,
      sheets: packManifest.sheets?.map((sheet) => ({ type: sheet.type, path: sheet.path, screenshotIds: sheet.screenshotIds, pageId: sheet.pageId, issueId: sheet.issueId }))
    },
    schema,
    stagedPageAnalysis: staged.map((item) => item.output)
  };

  const response = await router.generate({
    profile: report.config.modelRouter.qualityProfile === "fast" ? "vision_fast" : "vision_premium",
    schemaName: "AgentVisualReview",
    jsonSchema: schema,
    system: [
      "You are a senior website design, UX, and conversion reviewer.",
      "Inspect the supplied screenshots and evidence brief, then return exactly one JSON object matching the AgentVisualReview schema.",
      "Do not wrap the JSON in markdown. Do not leave TODO/template text. Do not claim analytics, revenue, heatmaps, users, competitor performance, or private brand rules unless explicitly supplied.",
      "Every visual finding and redesign action must cite known screenshot IDs or screenshot paths from the evidence.",
      "When staged page analysis is supplied, treat it as a draft from earlier screenshot passes: reconcile it, preserve page coverage, and return one coherent final review."
    ].join(" "),
    input: requestInput,
    images,
    provider: requestedProvider
  });

  const reviewerSlug = slug(`${response.provider}-${response.model}`);
  const runRoot = path.join(paths.agentRuns, reviewerSlug);
  await ensureDir(runRoot);
  const rawProviderOutputPath = path.join(runRoot, "visual-review.raw.json");
  await writeJson(rawProviderOutputPath, {
    provider: response.provider,
    model: response.model,
    generatedAt: new Date().toISOString(),
    requestProvenance: {
      providerSelection: requestedProvider,
      inputSha256: sha256(JSON.stringify(requestInput)),
      images: images.map((image) => ({ name: image.name, bytes: Buffer.byteLength(image.data, "base64"), sha256: sha256(Buffer.from(image.data, "base64")) }))
    },
    stagedPageAnalysis: staged.map((item) => ({ pageIds: item.pageIds, provider: item.provider, model: item.model, output: item.output })),
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
    model: response.model,
    stagedPageBatches: staged.length
  };
}

const StagedPageAnalysisSchema = z.object({
  pageReviews: z.array(AgentPageReviewSchema).min(1),
  visualFindings: z.array(AgentVisualFindingSchema).default([]),
  strengths: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([])
});

async function generateStagedPageReviews(
  router: ReturnType<typeof createModelRouterFromEnv>,
  provider: string,
  report: AuditReport,
  evidenceBrief: EvidenceBrief,
  reportRoot: string,
  manifest: ReviewPackManifestSubset,
  requestedBatchSize: number
) {
  const batchSize = Math.max(1, Math.min(6, requestedBatchSize));
  const results: Array<{ pageIds: string[]; provider: string; model: string; output: z.infer<typeof StagedPageAnalysisSchema> }> = [];
  for (let start = 0; start < report.pages.length; start += batchSize) {
    const pages = report.pages.slice(start, start + batchSize);
    const pageIds = new Set(pages.map((page) => page.pageId));
    const imagePaths = [
      "contact-sheets/first-viewports.png",
      ...(manifest.sheets ?? []).filter((sheet) => sheet.pageId && pageIds.has(sheet.pageId) && (sheet.type === "page_first_viewports" || sheet.type === "page_flow")).map((sheet) => sheet.path),
      ...(manifest.sheets ?? []).filter((sheet) => sheet.type === "issue_evidence" && sheet.screenshotIds.some((id) => pages.some((page) => Boolean(page.screenshots[id])))).map((sheet) => sheet.path)
    ];
    const batchImages = await loadImagePaths(reportRoot, imagePaths, 14);
    const response = await router.generate({
      profile: report.config.modelRouter.qualityProfile === "fast" ? "vision_fast" : "vision_premium",
      provider,
      system: [
        "Review only the supplied page batch as a senior website design and UX reviewer.",
        "Return JSON with pageReviews, visualFindings, strengths, risks, and limitations.",
        "Each pageReview must cover first viewport, hierarchy, composition, navigation, CTA clarity, messaging/copy, mobile, trust/proof, visual-system coherence, accessibility basics, style/taste, and redesign advice.",
        "Cite only known screenshot IDs and do not make analytics, revenue, user-behavior, or competitor claims."
      ].join(" "),
      input: {
        auditId: report.auditId,
        pages: evidenceBrief.pages.filter((page) => pageIds.has(page.pageId)),
        expectedPageIds: [...pageIds],
        outputContract: "StagedPageAnalysis"
      },
      images: batchImages
    });
    const output = StagedPageAnalysisSchema.parse(parseJsonObject(response.output, `staged page batch ${start / batchSize + 1}`));
    const returnedPageIds = new Set(output.pageReviews.map((review) => review.pageId));
    for (const pageId of pageIds) {
      if (!returnedPageIds.has(pageId)) throw new Error(`Staged visual review omitted page ${pageId}.`);
    }
    results.push({ pageIds: [...pageIds], provider: response.provider, model: response.model, output });
  }
  return results;
}

async function loadReviewImages(reportRoot: string, manifest: ReviewPackManifestSubset, maxImages: number): Promise<LlmImageInput[]> {
  const limit = Math.max(1, Math.min(48, maxImages));
  const buckets = [
    ["contact-sheets/first-viewports.png"],
    manifest.sheets?.filter((sheet) => sheet.type === "page_first_viewports").map((sheet) => sheet.path) ?? [],
    manifest.sheets?.filter((sheet) => sheet.type === "issue_evidence").map((sheet) => sheet.path) ?? [],
    manifest.sheets?.filter((sheet) => sheet.type === "page_flow").map((sheet) => sheet.path) ?? [],
    manifest.recommendedReviewOrder?.find((step) => step.step === "interaction_states")?.paths ?? [],
    manifest.recommendedReviewOrder?.find((step) => step.step === "raw_screenshots")?.paths ?? []
  ];
  const candidates: string[] = [];
  let depth = 0;
  while (candidates.length < limit && buckets.some((bucket) => depth < bucket.length)) {
    for (const bucket of buckets) {
      const candidate = bucket[depth];
      if (candidate) candidates.push(candidate);
      if (candidates.length >= limit) break;
    }
    depth += 1;
  }
  return loadImagePaths(reportRoot, candidates, limit);
}

async function loadImagePaths(reportRoot: string, candidates: string[], limit: number): Promise<LlmImageInput[]> {
  const seen = new Set<string>();
  const images: LlmImageInput[] = [];
  for (const relative of candidates) {
    if (!relative || seen.has(relative) || images.length >= limit) continue;
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

function configuredProviderAllowlist(report: AuditReport): string[] | undefined {
  const flags = report.config.modelRouter;
  const configured = [
    flags.allowOpenAI ? "openai" : undefined,
    flags.allowOpenRouter ? "openrouter" : undefined,
    flags.allowAnthropic ? "anthropic" : undefined,
    flags.allowGemini ? "gemini" : undefined
  ].filter((value): value is string => Boolean(value));
  return configured.length > 0 ? configured : undefined;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
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

function parseJsonObject(output: unknown, label: string): unknown {
  if (output && typeof output === "object") return output;
  if (typeof output !== "string") throw new Error(`Provider output for ${label} was not JSON.`);
  const trimmed = output.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1)) as unknown;
    throw new Error(`Provider output for ${label} could not be parsed as JSON.`);
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "provider";
}
