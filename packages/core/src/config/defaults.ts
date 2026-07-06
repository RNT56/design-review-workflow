import { AuditConfig, AuditConfigSchema, AuditMode, ViewportConfig } from "../schemas/audit.js";
import { createAuditId } from "../utils/id.js";

const defaultViewports: ViewportConfig[] = [
  {
    name: "desktop",
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    isMobile: false
  },
  {
    name: "mobile",
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true
  }
];

export type AuditInput = {
  url: string;
  mode?: AuditMode;
  maxPages?: number;
  language?: string;
  websiteGoal?: string;
  targetAudience?: string;
  industry?: string;
  brandContext?: string;
  competitors?: string[];
  outputPdf?: boolean;
  outputHtml?: boolean;
  outputJson?: boolean;
  outputMarkdown?: boolean;
};

export function createAuditConfig(input: AuditInput): AuditConfig {
  const mode = input.mode ?? "quick_scan";
  const maxPages = input.maxPages ?? (mode === "quick_scan" ? 6 : 15);

  return AuditConfigSchema.parse({
    auditId: createAuditId(mode),
    mode,
    url: normalizeUrlInput(input.url),
    maxPages,
    language: input.language ?? "auto",
    websiteGoal: input.websiteGoal,
    targetAudience: input.targetAudience,
    industry: input.industry,
    brandContext: input.brandContext,
    competitors: input.competitors ?? [],
    viewports: defaultViewports,
    crawl: {
      sameDomainOnly: true,
      includeSubdomains: false,
      maxDepth: mode === "quick_scan" ? 2 : 3,
      excludePatterns: ["/login", "/account", "/admin", "/privacy", "/terms", "/cart/checkout"]
    },
    interactions: {
      level: 2,
      allowCheckoutStart: true,
      allowFormErrorChecks: false,
      allowPurchase: false,
      allowLogin: false
    },
    outputs: {
      markdown: input.outputMarkdown ?? true,
      html: input.outputHtml ?? true,
      pdf: input.outputPdf ?? true,
      json: input.outputJson ?? true,
      screenshotAnnotations: "basic"
    },
    modelRouter: {
      qualityProfile: "balanced",
      allowOpenRouter: false,
      allowOpenAI: false,
      allowAnthropic: false,
      allowGemini: false
    },
    scoring: {
      strictness: "enterprise",
      tone: "client_ready"
    }
  });
}

export function normalizeUrlInput(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}
