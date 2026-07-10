import { access, readFile } from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import {
  AgentVisualReviewSchema,
  FindingSchema,
  GroupedIssueSchema,
  ScorecardSchema
} from "../schemas/audit.js";
import { BundleIntegrityManifestSchema } from "./integrity.js";

type ArtifactContract = {
  file: string;
  schema: z.ZodTypeAny;
  optional?: boolean;
};

const versioned = (schemaVersion: string, shape: z.ZodRawShape = {}) =>
  z.object({
    schemaVersion: z.literal(schemaVersion),
    auditId: z.string().min(1).optional(),
    ...shape
  }).passthrough();

const contracts: ArtifactContract[] = [
  { file: "report/workflow-manifest.json", schema: versioned("design-review-workflow.agent.v1", { artifacts: z.record(z.string(), z.unknown()) }) },
  { file: "report/handoff.json", schema: versioned("design-review-workflow.handoff.v1", { artifacts: z.record(z.string(), z.unknown()) }) },
  { file: "report/findings.json", schema: z.array(FindingSchema) },
  { file: "report/score.json", schema: ScorecardSchema },
  { file: "report/grouped-issues.json", schema: z.array(GroupedIssueSchema) },
  { file: "report/evidence-brief.json", schema: versioned("design-review-workflow.evidence-brief.v1", { pages: z.array(z.unknown()), deterministicFindings: z.array(z.unknown()) }) },
  { file: "report/evidence-index.json", schema: z.object({ auditId: z.string().min(1), pages: z.array(z.unknown()) }).passthrough() },
  { file: "report/screenshot-manifest.json", schema: versioned("design-review-workflow.screenshot-manifest.v1", { screenshots: z.array(z.unknown()), pages: z.array(z.unknown()) }) },
  { file: "report/business-grade-gate.json", schema: versioned("design-review-workflow.business-grade-gate.v1", { status: z.enum(["pass", "fail"]), errors: z.array(z.string()), warnings: z.array(z.string()) }) },
  { file: "report/implementation-plan.json", schema: z.object({ auditId: z.string().min(1), items: z.array(z.unknown()) }).passthrough() },
  { file: "report/repo-analysis.json", schema: versioned("design-review-workflow.repo-analysis.v1") },
  { file: "report/source-candidates.json", schema: versioned("design-review-workflow.source-candidates.v1", { byFinding: z.record(z.string(), z.array(z.unknown())) }) },
  { file: "report/route-templates.json", schema: versioned("design-review-workflow.route-templates.v1", { templates: z.array(z.unknown()) }) },
  { file: "report/visual-system.json", schema: versioned("design-review-workflow.visual-system.v1") },
  { file: "report/experience-timing.json", schema: versioned("design-review-workflow.experience-timing.v1", { pages: z.array(z.unknown()) }) },
  { file: "report/performance-audit.json", schema: versioned("design-review-workflow.performance-audit.v1", { pages: z.array(z.unknown()) }) },
  { file: "report/accessibility-detail.json", schema: versioned("design-review-workflow.accessibility-detail.v1", { pages: z.array(z.unknown()) }) },
  { file: "report/privacy-tracking.json", schema: versioned("design-review-workflow.privacy-tracking.v1", { riskSignals: z.array(z.string()) }) },
  { file: "report/resource-audit.json", schema: versioned("design-review-workflow.resource-audit.v1", { pages: z.array(z.unknown()) }) },
  { file: "report/interaction-states.json", schema: versioned("design-review-workflow.interaction-states.v1", { states: z.array(z.unknown()) }) },
  { file: "report/related-workflows.json", schema: versioned("design-review-workflow.related-workflows.v1", { workflows: z.array(z.unknown()) }) },
  { file: "report/enterprise-readiness.json", schema: versioned("design-review-workflow.enterprise-readiness.v1", { gates: z.array(z.unknown()) }) },
  { file: "report/standards-registry.json", schema: versioned("design-review-workflow.standards.v1", { rules: z.array(z.unknown()) }) },
  { file: "report/criteria-evaluation.json", schema: versioned("design-review-workflow.criteria-evaluation.v1", { pages: z.array(z.unknown()), summary: z.unknown() }) },
  {
    file: "report/suppression-report.json",
    schema: z.union([
      versioned("design-review-workflow.suppression-report.v1", { suppressionsApplied: z.number().int().min(0) }),
      versioned("design-review-workflow.suppression-report.v2", {
        suppressionsApplied: z.number().int().min(0),
        suppressionsExpired: z.number().int().min(0),
        suppressionsUnmatched: z.number().int().min(0),
        suppressedFindingFingerprints: z.array(z.string())
      })
    ])
  },
  { file: "report/design-benchmark.json", schema: versioned("design-review-workflow.benchmark.v1", { score: z.unknown(), gates: z.array(z.unknown()) }) },
  { file: "report/changed-files.json", schema: versioned("design-review-workflow.changed-files.v1", { changedFiles: z.array(z.unknown()) }) },
  { file: "report/report-dashboard.json", schema: z.object({ auditId: z.string().min(1), findings: z.array(z.unknown()), groupedIssues: z.array(z.unknown()) }).passthrough() },
  { file: "report/actionability.json", schema: z.array(z.unknown()) },
  { file: "report/bundle-integrity.json", schema: BundleIntegrityManifestSchema },
  { file: "report/agent-visual-review.json", schema: AgentVisualReviewSchema, optional: true },
  {
    file: "report/provider-review.json",
    optional: true,
    schema: z.object({
      schemaVersion: z.literal("design-review-workflow.provider-review.v1"),
      generatedAt: z.string().datetime(),
      mode: z.enum(["auto", "manual", "hybrid"]),
      status: z.string().min(1)
    }).passthrough()
  },
  {
    file: "report/agent-review-pack/review-pack-manifest.json",
    optional: true,
    schema: z.object({
      schemaVersion: z.literal("design-review-workflow.review-pack.v1"),
      auditId: z.string().min(1),
      recommendedReviewOrder: z.array(z.unknown()),
      sheets: z.array(z.unknown()),
      statistics: z.object({ pages: z.number().int().min(0), screenshots: z.number().int().min(0) }).passthrough()
    }).passthrough()
  }
];

export async function validateArtifactContracts(auditDir: string, expectedAuditId: string): Promise<string[]> {
  const errors: string[] = [];
  for (const contract of contracts) {
    const absolutePath = path.join(auditDir, contract.file);
    const fileExists = await access(absolutePath).then(
      () => true,
      () => false
    );
    if (!fileExists) {
      if (!contract.optional) errors.push(`Missing artifact contract file: ${contract.file}`);
      continue;
    }
    try {
      const parsed = contract.schema.parse(JSON.parse(await readFile(absolutePath, "utf8"))) as { auditId?: string };
      if (parsed && typeof parsed === "object" && "auditId" in parsed && parsed.auditId && parsed.auditId !== expectedAuditId) {
        errors.push(`Artifact auditId mismatch in ${contract.file}: expected ${expectedAuditId}, found ${parsed.auditId}.`);
      }
    } catch (error) {
      const message = error instanceof z.ZodError
        ? error.issues.slice(0, 4).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ")
        : error instanceof Error
          ? error.message
          : String(error);
      errors.push(`Artifact contract failed for ${contract.file}: ${message}`);
    }
  }
  return errors;
}
