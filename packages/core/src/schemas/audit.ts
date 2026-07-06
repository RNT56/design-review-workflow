import { z } from "zod";

export const AuditModeSchema = z.enum(["quick_scan", "full_audit"]);
export type AuditMode = z.infer<typeof AuditModeSchema>;

export const ViewportNameSchema = z.enum(["desktop", "mobile"]);
export type ViewportName = z.infer<typeof ViewportNameSchema>;

export const PageTypeSchema = z.enum([
  "homepage",
  "landing",
  "product",
  "service",
  "pricing",
  "category",
  "product_detail",
  "cart",
  "checkout_start",
  "contact",
  "about",
  "blog_article",
  "blog_index",
  "portfolio",
  "dashboard_public",
  "unknown"
]);
export type PageType = z.infer<typeof PageTypeSchema>;

export const WebsiteTypeSchema = z.enum([
  "b2b",
  "ecommerce",
  "local_service",
  "portfolio",
  "blog_magazine",
  "corporate",
  "nonprofit",
  "personal_brand",
  "saas",
  "web_app_dashboard",
  "unknown"
]);
export type WebsiteType = z.infer<typeof WebsiteTypeSchema>;

export const SeveritySchema = z.enum(["critical", "high", "medium", "low"]);
export const ImpactSchema = z.enum(["high", "medium", "low"]);
export const EffortSchema = z.enum(["low", "medium", "high"]);
export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Severity = z.infer<typeof SeveritySchema>;
export type Impact = z.infer<typeof ImpactSchema>;
export type Effort = z.infer<typeof EffortSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const FindingCategorySchema = z.enum([
  "visual_design",
  "ux",
  "conversion",
  "mobile",
  "brand",
  "trust",
  "content_design",
  "accessibility_basic",
  "performance_perception",
  "design_system",
  "competitor_gap"
]);
export type FindingCategory = z.infer<typeof FindingCategorySchema>;

export const ViewportConfigSchema = z.object({
  name: ViewportNameSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  deviceScaleFactor: z.number().positive().default(1),
  isMobile: z.boolean().default(false)
});
export type ViewportConfig = z.infer<typeof ViewportConfigSchema>;

export const AuditConfigSchema = z.object({
  auditId: z.string().min(1),
  mode: AuditModeSchema,
  url: z.string().url(),
  maxPages: z.number().int().positive().max(50),
  language: z.string().default("auto"),
  websiteGoal: z.string().optional(),
  targetAudience: z.string().optional(),
  industry: z.string().optional(),
  brandContext: z.string().optional(),
  competitors: z.array(z.string().url()).default([]),
  viewports: z.array(ViewportConfigSchema).min(1),
  crawl: z.object({
    sameDomainOnly: z.boolean().default(true),
    includeSubdomains: z.boolean().default(false),
    maxDepth: z.number().int().min(0).max(5).default(2),
    excludePatterns: z.array(z.string()).default([])
  }),
  interactions: z.object({
    level: z.number().int().min(0).max(3).default(2),
    allowCheckoutStart: z.boolean().default(true),
    allowFormErrorChecks: z.boolean().default(false),
    allowPurchase: z.boolean().default(false),
    allowLogin: z.boolean().default(false)
  }),
  outputs: z.object({
    markdown: z.boolean().default(true),
    html: z.boolean().default(true),
    pdf: z.boolean().default(true),
    json: z.boolean().default(true),
    screenshotAnnotations: z.enum(["none", "basic"]).default("basic")
  }),
  modelRouter: z.object({
    qualityProfile: z.enum(["fast", "balanced", "premium"]).default("balanced"),
    allowOpenRouter: z.boolean().default(false),
    allowOpenAI: z.boolean().default(false),
    allowAnthropic: z.boolean().default(false),
    allowGemini: z.boolean().default(false)
  }),
  scoring: z.object({
    strictness: z.enum(["light", "standard", "enterprise"]).default("enterprise"),
    tone: z.enum(["internal", "client_ready"]).default("client_ready")
  })
});
export type AuditConfig = z.infer<typeof AuditConfigSchema>;

export const TextNodeSchema = z.object({
  text: z.string(),
  tag: z.string().optional(),
  selector: z.string().optional(),
  href: z.string().optional(),
  visible: z.boolean().default(true)
});
export type TextNode = z.infer<typeof TextNodeSchema>;

export const ScreenshotRefSchema = z.object({
  id: z.string(),
  viewport: ViewportNameSchema,
  kind: z.enum(["above_fold", "full_page", "state"]),
  path: z.string(),
  width: z.number(),
  height: z.number(),
  state: z.string().optional()
});
export type ScreenshotRef = z.infer<typeof ScreenshotRefSchema>;

export const SectionEvidenceSchema = z.object({
  id: z.string(),
  label: z.string(),
  selector: z.string(),
  textSample: z.string(),
  viewport: ViewportNameSchema.optional(),
  box: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number()
    })
    .optional()
});
export type SectionEvidence = z.infer<typeof SectionEvidenceSchema>;

export const ComponentEvidenceSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  selector: z.string().optional(),
  viewport: ViewportNameSchema.optional(),
  box: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number()
    })
    .optional()
});
export type ComponentEvidence = z.infer<typeof ComponentEvidenceSchema>;

export const FormSummarySchema = z.object({
  selector: z.string(),
  inputCount: z.number(),
  missingLabelCount: z.number(),
  submitText: z.string().optional(),
  labels: z.array(z.string()).default([])
});
export type FormSummary = z.infer<typeof FormSummarySchema>;

export const AccessibilitySummarySchema = z.object({
  status: z.enum(["completed", "failed", "skipped"]),
  violationCount: z.number().default(0),
  critical: z.number().default(0),
  serious: z.number().default(0),
  moderate: z.number().default(0),
  minor: z.number().default(0),
  topViolations: z
    .array(
      z.object({
        id: z.string(),
        impact: z.string().optional(),
        description: z.string(),
        nodes: z.number()
      })
    )
    .default([]),
  error: z.string().optional()
});
export type AccessibilitySummary = z.infer<typeof AccessibilitySummarySchema>;

export const PerformanceSummarySchema = z.object({
  status: z.enum(["completed", "failed", "skipped"]),
  source: z.string(),
  domContentLoadedMs: z.number().optional(),
  loadEventMs: z.number().optional(),
  firstPaintMs: z.number().optional(),
  firstContentfulPaintMs: z.number().optional(),
  transferSizeKb: z.number().optional(),
  error: z.string().optional()
});
export type PerformanceSummary = z.infer<typeof PerformanceSummarySchema>;

export const CssSignalsSchema = z.object({
  colors: z.array(z.string()).default([]),
  backgroundColors: z.array(z.string()).default([]),
  fonts: z.array(z.string()).default([]),
  fontSizes: z.array(z.number()).default([]),
  lineHeights: z.array(z.number()).default([]),
  borderRadii: z.array(z.number()).default([]),
  contrastPairs: z
    .array(
      z.object({
        foreground: z.string(),
        background: z.string(),
        ratio: z.number(),
        selector: z.string().optional(),
        textSample: z.string().optional()
      })
    )
    .default([])
});
export type CssSignals = z.infer<typeof CssSignalsSchema>;

export const PageEvidenceSchema = z.object({
  pageId: z.string(),
  url: z.string().url(),
  normalizedUrl: z.string().url(),
  title: z.string().optional(),
  language: z.string().optional(),
  pageType: PageTypeSchema,
  pageTypeConfidence: ConfidenceSchema,
  businessImportance: z.enum(["high", "medium", "low"]),
  primaryUserGoal: z.string().optional(),
  screenshots: z.record(z.string(), ScreenshotRefSchema),
  text: z.object({
    headings: z.array(TextNodeSchema),
    buttons: z.array(TextNodeSchema),
    links: z.array(TextNodeSchema),
    forms: z.array(FormSummarySchema),
    imagesMissingAlt: z.number().default(0),
    imageCount: z.number().default(0),
    visibleTextSample: z.string()
  }),
  structure: z.object({
    sections: z.array(SectionEvidenceSchema),
    components: z.array(ComponentEvidenceSchema),
    navigation: z.array(TextNodeSchema).default([]),
    footerText: z.string().optional()
  }),
  cssSignals: CssSignalsSchema.optional(),
  performance: PerformanceSummarySchema.optional(),
  accessibility: AccessibilitySummarySchema.optional()
});
export type PageEvidence = z.infer<typeof PageEvidenceSchema>;

export const FindingSchema = z.object({
  findingId: z.string(),
  title: z.string(),
  category: FindingCategorySchema,
  severity: SeveritySchema,
  priorityScore: z.number().min(0).max(100),
  impact: ImpactSchema,
  effort: EffortSchema,
  confidence: ConfidenceSchema,
  evidence: z.object({
    pageId: z.string(),
    url: z.string().url(),
    viewport: ViewportNameSchema.optional(),
    section: z.string().optional(),
    elementLabel: z.string().optional(),
    screenshotRefs: z.array(z.string()).default([]),
    textQuotes: z.array(z.string()).default([])
  }),
  observation: z.string(),
  whyItMatters: z.string(),
  recommendation: z.string(),
  designPrinciples: z.array(z.string()).default([]),
  businessRisk: z.string().optional(),
  expectedKpiImpact: z.string().optional(),
  suggestedExperiment: z.string().optional(),
  implementation: z.object({
    owner: z.array(z.enum(["designer", "developer", "copywriter", "marketing", "product"])),
    acceptanceCriteria: z.array(z.string()),
    dependencies: z.array(z.string()).default([]),
    definitionOfDone: z.array(z.string()).default([])
  }),
  relatedFindings: z.array(z.string()).default([])
});
export type Finding = z.infer<typeof FindingSchema>;

export const ScoreItemSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: ConfidenceSchema,
  rationale: z.string()
});
export type ScoreItem = z.infer<typeof ScoreItemSchema>;

export const ScorecardSchema = z.object({
  overallScore: z.number().min(0).max(100),
  confidence: ConfidenceSchema,
  subscores: z.object({
    visualDesignQuality: ScoreItemSchema,
    uxClarityNavigation: ScoreItemSchema,
    conversionReadiness: ScoreItemSchema,
    mobileExperience: ScoreItemSchema,
    brandFitTrust: ScoreItemSchema,
    contentDesignUxWriting: ScoreItemSchema,
    accessibilityBasics: ScoreItemSchema,
    performancePerception: ScoreItemSchema,
    designSystemConsistency: ScoreItemSchema
  }),
  weights: z.record(z.string(), z.number()),
  websiteTypeAdjustment: z.string(),
  topStrengths: z.array(z.string()),
  topRisks: z.array(z.string())
});
export type Scorecard = z.infer<typeof ScorecardSchema>;

export const TicketRecommendationSchema = z.object({
  title: z.string(),
  role: z.array(z.enum(["designer", "developer", "copywriter", "marketing", "product"])),
  priority: SeveritySchema,
  effort: EffortSchema,
  sourceFindingIds: z.array(z.string()),
  problem: z.string(),
  goal: z.string(),
  scope: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  definitionOfDone: z.array(z.string()),
  evidenceRefs: z.array(z.string())
});
export type TicketRecommendation = z.infer<typeof TicketRecommendationSchema>;

export const AuditReportSchema = z.object({
  auditId: z.string(),
  generatedAt: z.string(),
  config: AuditConfigSchema,
  websiteType: WebsiteTypeSchema,
  websiteTypeConfidence: ConfidenceSchema,
  pages: z.array(PageEvidenceSchema),
  findings: z.array(FindingSchema),
  quickWins: z.array(FindingSchema),
  scorecard: ScorecardSchema,
  redesignBriefing: z.array(z.object({ title: z.string(), body: z.string() })),
  tickets: z.array(TicketRecommendationSchema),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string())
});
export type AuditReport = z.infer<typeof AuditReportSchema>;

export type ProgressEvent = {
  stage: string;
  message: string;
  current?: number;
  total?: number;
};
