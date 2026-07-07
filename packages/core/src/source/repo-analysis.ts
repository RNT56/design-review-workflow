import { readdir, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { AuditReport, Finding } from "../schemas/audit.js";
import { readReportFromAuditDir } from "../storage/index.js";
import { createNestedAuditPaths } from "../storage/project.js";
import { writeJson, writeText } from "../utils/fs.js";
import { lintAuditReport } from "../validation/report-lint.js";

type SourceFileKind = "route" | "component" | "style" | "content" | "config" | "test" | "unknown";
type CandidateConfidence = "high" | "medium" | "low";

type SourceFile = {
  absolutePath: string;
  relativePath: string;
  kind: SourceFileKind;
  sizeBytes: number;
  content: string;
};

type SourceFileSummary = {
  path: string;
  kind: SourceFileKind;
  sizeBytes: number;
};

export type SourceCandidate = {
  path: string;
  kind: SourceFileKind;
  confidence: CandidateConfidence;
  reason: string;
  score: number;
};

export type DesignRepoAnalysis = {
  schemaVersion: "design-review-workflow.repo-analysis.v1";
  auditId: string;
  status: "completed";
  sourceRepo: string;
  generatedAt: string;
  frameworks: string[];
  filesScanned: number;
  filesSkipped: number;
  routeFiles: SourceFileSummary[];
  componentFiles: SourceFileSummary[];
  styleFiles: SourceFileSummary[];
  contentFiles: SourceFileSummary[];
  configFiles: SourceFileSummary[];
  notes: string[];
};

const excludedDirs = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  "projects",
  ".turbo",
  ".cache",
  "DerivedData"
]);

const includedExtensions = new Set([
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".vue",
  ".svelte",
  ".astro",
  ".html",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".md",
  ".mdx",
  ".json"
]);

const maxFiles = 2000;
const maxFileBytes = 250_000;
const maxInlineContentBytes = 8_000_000;
const genericHomepageTerms = new Set(["home", "index"]);

export async function analyzeDesignSourceRepo(auditDir: string, repoPath: string): Promise<DesignRepoAnalysis> {
  const report = await readReportFromAuditDir(auditDir);
  const paths = await createNestedAuditPaths(auditDir);
  const sourceRepo = path.resolve(repoPath);
  const repoStat = await stat(sourceRepo).catch(() => undefined);
  if (!repoStat?.isDirectory()) {
    throw new Error(`Source repo path is not a directory: ${repoPath}`);
  }

  const scan = await collectSourceFiles(sourceRepo);
  const frameworks = await detectFrameworks(sourceRepo);
  const byFinding = buildSourceCandidates(report, scan.files);
  const analysis: DesignRepoAnalysis = {
    schemaVersion: "design-review-workflow.repo-analysis.v1",
    auditId: report.auditId,
    status: "completed",
    sourceRepo,
    generatedAt: new Date().toISOString(),
    frameworks,
    filesScanned: scan.files.length,
    filesSkipped: scan.skipped,
    routeFiles: summaries(scan.files, "route"),
    componentFiles: summaries(scan.files, "component"),
    styleFiles: summaries(scan.files, "style"),
    contentFiles: summaries(scan.files, "content"),
    configFiles: summaries(scan.files, "config"),
    notes: [
      "Read-only source analysis. No target repository files were modified.",
      "Source candidates are heuristic starting points and must be verified against the live evidence before edits."
    ]
  };

  await writeJson(path.join(paths.report, "repo-analysis.json"), analysis);
  await writeJson(path.join(paths.report, "source-candidates.json"), {
    schemaVersion: "design-review-workflow.source-candidates.v1",
    auditId: report.auditId,
    sourceRepo,
    generatedAt: analysis.generatedAt,
    byFinding
  });
  await writeJson(path.join(paths.report, "changed-files.json"), changedFilesModel(report, byFinding));
  await writeText(path.join(paths.report, "patch-plan.md"), renderSourceBackedPatchPlan(report, byFinding));
  await lintAuditReport(auditDir, false);

  return analysis;
}

async function collectSourceFiles(root: string): Promise<{ files: SourceFile[]; skipped: number }> {
  const files: SourceFile[] = [];
  let skipped = 0;
  let inlineBytes = 0;

  async function visit(dir: string): Promise<void> {
    if (files.length >= maxFiles) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (entry.name.startsWith(".") && entry.name !== ".well-known" && entry.name !== ".storybook") {
        skipped += 1;
        continue;
      }
      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(root, absolutePath);
      if (entry.isDirectory()) {
        if (excludedDirs.has(entry.name)) {
          skipped += 1;
          continue;
        }
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!includedExtensions.has(ext)) {
        skipped += 1;
        continue;
      }
      const fileStat = await stat(absolutePath).catch(() => undefined);
      if (!fileStat || fileStat.size > maxFileBytes) {
        skipped += 1;
        continue;
      }
      let content = "";
      if (inlineBytes + fileStat.size <= maxInlineContentBytes) {
        content = await readFile(absolutePath, "utf8").catch(() => "");
        inlineBytes += Buffer.byteLength(content);
      }
      files.push({
        absolutePath,
        relativePath,
        kind: classifyFile(relativePath),
        sizeBytes: fileStat.size,
        content
      });
    }
  }

  await visit(root);
  return { files, skipped };
}

async function detectFrameworks(root: string): Promise<string[]> {
  const frameworks = new Set<string>();
  const packageJson = await readOptionalPackageJson(path.join(root, "package.json"));
  const deps = packageJson ? { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) } : {};
  const depNames = Object.keys(deps);
  const addIfDep = (name: string, label: string) => {
    if (depNames.includes(name)) frameworks.add(label);
  };
  addIfDep("next", "Next.js");
  addIfDep("@remix-run/react", "Remix");
  addIfDep("react", "React");
  addIfDep("vue", "Vue");
  addIfDep("nuxt", "Nuxt");
  addIfDep("svelte", "Svelte");
  addIfDep("astro", "Astro");
  addIfDep("vite", "Vite");
  addIfDep("tailwindcss", "Tailwind CSS");
  addIfDep("styled-components", "styled-components");
  addIfDep("@emotion/react", "Emotion");

  const configSignals: Array<[string, string]> = [
    ["next.config.js", "Next.js"],
    ["next.config.mjs", "Next.js"],
    ["astro.config.mjs", "Astro"],
    ["svelte.config.js", "Svelte"],
    ["nuxt.config.ts", "Nuxt"],
    ["vite.config.ts", "Vite"],
    ["tailwind.config.js", "Tailwind CSS"],
    ["tailwind.config.ts", "Tailwind CSS"]
  ];
  for (const [file, label] of configSignals) {
    if (await exists(path.join(root, file))) frameworks.add(label);
  }
  return [...frameworks].sort();
}

function buildSourceCandidates(report: AuditReport, files: SourceFile[]): Record<string, SourceCandidate[]> {
  const byFinding: Record<string, SourceCandidate[]> = {};
  for (const finding of report.findings) {
    const page = report.pages.find((item) => item.pageId === finding.evidence.pageId);
    const terms = findingTerms(finding, page?.title);
    const pageSegments = pathnameTerms(finding.evidence.url);
    const scored = files
      .map((file) => scoreFile(file, finding, terms, pageSegments))
      .filter((candidate): candidate is SourceCandidate => Boolean(candidate))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    byFinding[finding.findingId] = scored;
  }
  return byFinding;
}

function scoreFile(file: SourceFile, finding: Finding, terms: string[], pageSegments: string[]): SourceCandidate | undefined {
  const rel = normalize(file.relativePath);
  const content = normalize(file.content.slice(0, 40_000));
  const reasons: string[] = [];
  let score = 0;

  for (const segment of pageSegments) {
    if (rel.includes(segment)) {
      score += 10;
      reasons.push(`path matches route segment "${segment}"`);
    } else if (!genericHomepageTerms.has(segment) && content.includes(segment)) {
      score += 4;
      reasons.push(`content mentions route segment "${segment}"`);
    }
  }

  for (const term of terms) {
    if (rel.includes(term)) {
      score += 6;
      reasons.push(`path matches design term "${term}"`);
    } else if (content.includes(term)) {
      score += 2;
      reasons.push(`content mentions design term "${term}"`);
    }
  }

  const categoryBoost = categoryFileBoost(finding.category, file.kind, rel);
  if (categoryBoost > 0) {
    score += categoryBoost;
    reasons.push(`file kind fits ${finding.category}`);
  }

  if (finding.evidence.section && content.includes(normalize(finding.evidence.section))) {
    score += 4;
    reasons.push("content matches the evidenced section label");
  }

  if (score <= 0) return undefined;
  return {
    path: file.relativePath,
    kind: file.kind,
    confidence: score >= 26 ? "high" : score >= 14 ? "medium" : "low",
    reason: reasons.slice(0, 4).join("; ") || "File resembles the finding context.",
    score
  };
}

function findingTerms(finding: Finding, pageTitle?: string): string[] {
  const categoryTerms: Record<string, string[]> = {
    visual_design: ["hero", "layout", "visual", "image", "color", "typography", "section"],
    ux: ["nav", "menu", "flow", "search", "filter", "form", "button"],
    conversion: ["cta", "button", "signup", "pricing", "checkout", "lead", "contact"],
    mobile: ["mobile", "responsive", "breakpoint", "drawer", "menu"],
    brand: ["brand", "logo", "headline", "copy", "about"],
    trust: ["trust", "testimonial", "review", "security", "proof", "badge"],
    content_design: ["copy", "headline", "heading", "content", "text"],
    accessibility_basic: ["aria", "label", "contrast", "alt", "focus"],
    performance_perception: ["image", "asset", "lazy", "font", "animation"],
    design_system: ["component", "button", "card", "theme", "tokens"],
    competitor_gap: ["home", "landing", "pricing", "feature", "comparison"]
  };
  return uniqueTerms([
    finding.title,
    finding.category,
    finding.evidence.section ?? "",
    finding.evidence.elementLabel ?? "",
    pageTitle ?? "",
    ...finding.evidence.textQuotes,
    ...(categoryTerms[finding.category] ?? [])
  ]);
}

function pathnameTerms(url: string): string[] {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    return segments.length > 0 ? uniqueTerms(segments) : ["home", "index"];
  } catch {
    return [];
  }
}

function uniqueTerms(values: string[]): string[] {
  const stop = new Set(["the", "and", "for", "with", "from", "that", "this", "page", "section", "user", "users", "design", "website"]);
  const terms = new Set<string>();
  for (const value of values) {
    for (const token of normalize(value).split(/[^a-z0-9]+/)) {
      if (token.length < 3 || stop.has(token)) continue;
      terms.add(token);
    }
  }
  return [...terms].slice(0, 28);
}

function classifyFile(relativePath: string): SourceFileKind {
  const normalizedPath = normalize(relativePath);
  const ext = path.extname(relativePath).toLowerCase();
  if (/\.(test|spec)\.[jt]sx?$/.test(relativePath) || normalizedPath.includes("__tests__")) return "test";
  if ([".css", ".scss", ".sass", ".less"].includes(ext) || normalizedPath.includes("styles") || normalizedPath.includes("theme")) return "style";
  if ([".md", ".mdx"].includes(ext) || normalizedPath.includes("content") || normalizedPath.includes("copy")) return "content";
  if (normalizedPath.endsWith("package.json") || normalizedPath.includes("config") || normalizedPath.includes("tokens")) return "config";
  if (
    normalizedPath.includes("/app/") ||
    normalizedPath.includes("/pages/") ||
    normalizedPath.includes("/routes/") ||
    normalizedPath.endsWith("page.tsx") ||
    normalizedPath.endsWith("page.jsx") ||
    normalizedPath.endsWith("layout.tsx")
  ) {
    return "route";
  }
  if (normalizedPath.includes("component") || normalizedPath.includes("/ui/") || normalizedPath.includes("/blocks/") || normalizedPath.includes("/sections/")) {
    return "component";
  }
  return "unknown";
}

function categoryFileBoost(category: Finding["category"], kind: SourceFileKind, relativePath: string): number {
  if (category === "design_system" && (kind === "component" || kind === "style" || kind === "config")) return 12;
  if (category === "visual_design" && (kind === "route" || kind === "component" || kind === "style")) return 10;
  if (category === "ux" && (kind === "route" || kind === "component")) return 10;
  if (category === "conversion" && (kind === "route" || kind === "component" || relativePath.includes("pricing") || relativePath.includes("contact"))) return 12;
  if (category === "mobile" && (kind === "style" || relativePath.includes("responsive") || relativePath.includes("breakpoint"))) return 12;
  if (category === "brand" && (kind === "content" || kind === "route")) return 8;
  if (category === "trust" && (kind === "content" || kind === "route" || relativePath.includes("testimonial") || relativePath.includes("review"))) return 10;
  if (category === "content_design" && (kind === "content" || kind === "route")) return 10;
  if (category === "accessibility_basic" && (kind === "component" || kind === "route")) return 10;
  if (category === "performance_perception" && (kind === "route" || kind === "component" || kind === "style")) return 8;
  if (category === "competitor_gap" && (kind === "route" || kind === "content")) return 6;
  return 0;
}

function changedFilesModel(report: AuditReport, byFinding: Record<string, SourceCandidate[]>) {
  const files = new Map<string, { path: string; kind: SourceFileKind; findingIds: string[]; reasons: string[] }>();
  for (const finding of report.findings) {
    for (const candidate of byFinding[finding.findingId] ?? []) {
      if (candidate.confidence === "low") continue;
      const row = files.get(candidate.path) ?? { path: candidate.path, kind: candidate.kind, findingIds: [], reasons: [] };
      row.findingIds.push(finding.findingId);
      row.reasons.push(candidate.reason);
      files.set(candidate.path, row);
    }
  }
  return {
    schemaVersion: "design-review-workflow.changed-files.v1",
    auditId: report.auditId,
    mode: "proposal_only",
    changedFiles: [...files.values()].map((file) => ({
      ...file,
      findingIds: [...new Set(file.findingIds)],
      reasons: [...new Set(file.reasons)].slice(0, 4)
    })),
    note: "Proposal only. The workflow did not modify the target source repository."
  };
}

function renderSourceBackedPatchPlan(report: AuditReport, byFinding: Record<string, SourceCandidate[]>): string {
  const lines = [
    "# Patch Plan",
    "",
    "This is a source-backed proposal generated from live design-review evidence. It does not modify the target website repository.",
    "",
    "## Implementation Queue",
    ""
  ];
  for (const ticket of report.tickets.slice(0, 14)) {
    const candidates = sourceCandidatesForTicket(ticket.sourceFindingIds, byFinding);
    lines.push(`### ${ticket.title}`);
    lines.push(`- Priority: ${ticket.priority}`);
    lines.push(`- Owners: ${ticket.role.join(", ")}`);
    lines.push(`- Evidence: ${ticket.evidenceRefs.join(", ")}`);
    lines.push(`- Candidate files: ${candidates.length > 0 ? candidates.map((candidate) => `${candidate.path} (${candidate.confidence})`).join(", ") : "none mapped"}`);
    lines.push(`- Acceptance: ${ticket.acceptanceCriteria.join("; ")}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function sourceCandidatesForTicket(findingIds: string[], byFinding: Record<string, SourceCandidate[]>): SourceCandidate[] {
  const seen = new Set<string>();
  const candidates: SourceCandidate[] = [];
  for (const id of findingIds) {
    for (const candidate of byFinding[id] ?? []) {
      if (seen.has(candidate.path)) continue;
      seen.add(candidate.path);
      candidates.push(candidate);
    }
  }
  return candidates.slice(0, 8);
}

function summaries(files: SourceFile[], kind: SourceFileKind): SourceFileSummary[] {
  return files
    .filter((file) => file.kind === kind)
    .slice(0, 80)
    .map((file) => ({ path: file.relativePath, kind: file.kind, sizeBytes: file.sizeBytes }));
}

async function readOptionalPackageJson(filePath: string): Promise<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  } catch {
    return undefined;
  }
}

async function exists(filePath: string): Promise<boolean> {
  return stat(filePath).then(
    () => true,
    () => false
  );
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\\/g, "/");
}
