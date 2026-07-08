import { access } from "node:fs/promises";
import * as path from "node:path";
import { AuditReport, Finding } from "../schemas/audit.js";
import { AuditPaths } from "../storage/project.js";
import { writeJson, writeText } from "../utils/fs.js";
import { buildRelatedWorkflowsArtifact } from "./related-workflows.js";

export type DesignWorkflowArtifactPaths = {
  evidenceJsonl: string;
  routeTemplates: string;
  visualSystem: string;
  experienceTiming: string;
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
  standardsRegistry: string;
  suppressionReport: string;
  repoAnalysis: string;
  sourceCandidates: string;
  benchmarkJson: string;
  benchmarkMarkdown: string;
  patchPlan: string;
  changedFiles: string;
  manualActions: string;
  remainingUserDecisions: string;
};

export async function writeDesignWorkflowArtifacts(report: AuditReport, paths: AuditPaths): Promise<DesignWorkflowArtifactPaths> {
  const outputs: DesignWorkflowArtifactPaths = {
    evidenceJsonl: path.join(paths.report, "evidence.jsonl"),
    routeTemplates: path.join(paths.report, "route-templates.json"),
    visualSystem: path.join(paths.report, "visual-system.json"),
    experienceTiming: path.join(paths.report, "experience-timing.json"),
    performanceAudit: path.join(paths.report, "performance-audit.json"),
    accessibilityDetail: path.join(paths.report, "accessibility-detail.json"),
    privacyTracking: path.join(paths.report, "privacy-tracking.json"),
    resourceAudit: path.join(paths.report, "resource-audit.json"),
    interactionStates: path.join(paths.report, "interaction-states.json"),
    relatedWorkflows: path.join(paths.report, "related-workflows.json"),
    enterpriseReadiness: path.join(paths.report, "enterprise-readiness.json"),
    learningsReadme: path.join(paths.report, "learnings", "README.md"),
    learningsTemplate: path.join(paths.report, "learnings", "agent-learning-template.md"),
    runRetrospective: path.join(paths.report, "learnings", "run-retrospective.json"),
    stakeholderRecommendations: path.join(paths.report, "stakeholder-recommendations.md"),
    beforeAfterComparison: path.join(paths.report, "before-after-comparison.md"),
    standardsRegistry: path.join(paths.report, "standards-registry.json"),
    suppressionReport: path.join(paths.report, "suppression-report.json"),
    repoAnalysis: path.join(paths.report, "repo-analysis.json"),
    sourceCandidates: path.join(paths.report, "source-candidates.json"),
    benchmarkJson: path.join(paths.report, "design-benchmark.json"),
    benchmarkMarkdown: path.join(paths.report, "design-benchmark.md"),
    patchPlan: path.join(paths.report, "patch-plan.md"),
    changedFiles: path.join(paths.report, "changed-files.json"),
    manualActions: path.join(paths.report, "manual-actions.md"),
    remainingUserDecisions: path.join(paths.report, "remaining-user-decisions.md")
  };

  await writeText(outputs.evidenceJsonl, renderEvidenceJsonl(report));
  await writeJson(outputs.routeTemplates, routeTemplateModel(report));
  await writeJson(outputs.visualSystem, visualSystemModel(report));
  await writeJson(outputs.experienceTiming, experienceTimingModel(report));
  await writeJson(outputs.performanceAudit, performanceAuditModel(report));
  await writeJson(outputs.accessibilityDetail, accessibilityDetailModel(report));
  await writeJson(outputs.privacyTracking, privacyTrackingModel(report));
  await writeJson(outputs.resourceAudit, resourceAuditModel(report));
  await writeJson(outputs.interactionStates, interactionStatesModel(report));
  await writeJson(outputs.relatedWorkflows, await buildRelatedWorkflowsArtifact(report));
  await writeJson(outputs.enterpriseReadiness, enterpriseReadinessModel(report));
  await writeText(outputs.learningsReadme, renderLearningsReadme(report));
  await writeText(outputs.learningsTemplate, renderLearningTemplate(report));
  await writeJson(outputs.runRetrospective, runRetrospectiveModel(report));
  await writeJsonIfMissing(outputs.standardsRegistry, defaultDesignStandardsRegistry(report));
  await writeJsonIfMissing(outputs.suppressionReport, emptySuppressionReport(report));
  await writeJsonIfMissing(outputs.repoAnalysis, repoAnalysisPlaceholder(report));
  await writeJsonIfMissing(outputs.sourceCandidates, sourceCandidatesPlaceholder(report));
  await writeJson(outputs.benchmarkJson, designBenchmarkModel(report));
  await writeText(outputs.benchmarkMarkdown, renderDesignBenchmarkMarkdown(report));
  await writeTextIfMissing(outputs.patchPlan, renderPatchPlan(report));
  await writeJsonIfMissing(outputs.changedFiles, changedFilesPlaceholder(report));
  await writeText(outputs.stakeholderRecommendations, renderStakeholderRecommendations(report));
  await writeText(outputs.beforeAfterComparison, renderBeforeAfterComparison(report));
  await writeText(outputs.manualActions, renderManualActions(report));
  await writeText(outputs.remainingUserDecisions, renderRemainingUserDecisions(report));

  return outputs;
}

async function writeJsonIfMissing(filePath: string, value: unknown): Promise<void> {
  if (await exists(filePath)) return;
  await writeJson(filePath, value);
}

async function writeTextIfMissing(filePath: string, value: string): Promise<void> {
  if (await exists(filePath)) return;
  await writeText(filePath, value);
}

export function designBenchmarkModel(report: AuditReport) {
  const findingsWithScreenshots = report.findings.filter((finding) => finding.evidence.screenshotRefs.length > 0).length;
  const findingsWithAcceptance = report.findings.filter((finding) => finding.implementation.acceptanceCriteria.length > 0).length;
  const approvalRequired = report.findings.filter(approvalRequiredForFinding).length;
  const evidenceCompleteness = percent(findingsWithScreenshots, Math.max(report.findings.length, 1));
  const actionability = percent(findingsWithAcceptance, Math.max(report.findings.length, 1));
  const handoffReadiness = Math.round((evidenceCompleteness * 0.35) + (actionability * 0.35) + (report.pages.length > 0 ? 20 : 0) + (report.tickets.length > 0 ? 10 : 0));

  return {
    schemaVersion: "design-review-workflow.benchmark.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    url: report.config.url,
    score: {
      overall: Math.min(100, handoffReadiness),
      evidenceCompleteness,
      actionability,
      reportCompleteness: 100
    },
    counts: {
      pages: report.pages.length,
      findings: report.findings.length,
      findingsWithScreenshots,
      tickets: report.tickets.length,
      approvalRequired
    },
    gates: [
      { name: "Evidence-backed findings", status: findingsWithScreenshots === report.findings.length ? "pass" : "warn" },
      { name: "Acceptance criteria", status: findingsWithAcceptance === report.findings.length ? "pass" : "warn" },
      { name: "Agent handoff bundle", status: "pass" },
      { name: "Risk approval boundaries", status: approvalRequired > 0 ? "warn" : "pass" }
    ]
  };
}

export function defaultDesignStandardsRegistry(report?: AuditReport) {
  return {
    schemaVersion: "design-review-workflow.standards.v1",
    generatedAt: new Date().toISOString(),
    auditId: report?.auditId,
    rules: [
      { id: "design.evidence.required", area: "evidence", severity: "critical", description: "Every finding must cite captured URL and screenshot or page evidence." },
      { id: "design.safety.no-private-actions", area: "safety", severity: "critical", description: "Agents must not enter auth, account, admin, payment, or checkout-completion flows." },
      { id: "design.hierarchy.primary-action", area: "conversion", severity: "high", description: "Core pages should expose one clear primary user action where appropriate." },
      { id: "design.content.headline-specificity", area: "content_design", severity: "medium", description: "Primary headings should state audience, outcome, or concrete page purpose." },
      { id: "design.trust.proof-near-decision", area: "trust", severity: "medium", description: "Credibility proof should appear near important decisions when relevant." },
      { id: "design.accessibility.labels-contrast", area: "accessibility_basic", severity: "high", description: "Forms require accessible names and text should meet common readability thresholds." },
      { id: "design.mobile.tap-targets", area: "mobile", severity: "medium", description: "Important touch targets should be comfortably tappable on mobile." },
      { id: "design.system.consistency", area: "design_system", severity: "medium", description: "Typography, color, spacing, and component treatments should use consistent patterns." }
    ],
    riskBoundaries: [
      "Conversion, trust, policy, pricing, brand positioning, and checkout-adjacent changes require human approval before implementation.",
      "The workflow produces design-review guidance, not legal accessibility certification or analytics-backed causal claims."
    ]
  };
}

function renderEvidenceJsonl(report: AuditReport): string {
  const rows: unknown[] = [];
  for (const page of report.pages) {
    rows.push({
      type: "page",
      pageId: page.pageId,
      url: page.url,
      pageType: page.pageType,
      title: page.title,
      screenshots: Object.values(page.screenshots).map((screenshot) => screenshot.path),
      interactionStates: page.interactionStates.map((state) => ({
        id: state.id,
        viewport: state.viewport,
        category: state.category,
        label: state.label,
        state: state.state,
        screenshotId: state.screenshotId
      })),
      extractedEvidencePath: `extracted/pages/${page.pageId}.json`
    });
    for (const state of page.interactionStates) {
      rows.push({
        type: "interaction_state",
        pageId: page.pageId,
        url: page.url,
        id: state.id,
        viewport: state.viewport,
        category: state.category,
        label: state.label,
        state: state.state,
        screenshotId: state.screenshotId,
        screenshotPath: page.screenshots[state.screenshotId]?.path,
        triggerSelector: state.triggerSelector,
        triggerRole: state.triggerRole,
        urlChanged: state.urlChanged,
        notes: state.notes
      });
    }
  }
  for (const finding of report.findings) {
    rows.push({
      type: "finding",
      findingId: finding.findingId,
      title: finding.title,
      category: finding.category,
      severity: finding.severity,
      priorityScore: finding.priorityScore,
      evidence: finding.evidence
    });
  }
  for (const annotation of report.screenshotAnnotations) {
    rows.push({
      type: "annotation",
      annotationId: annotation.annotationId,
      findingId: annotation.findingId,
      path: annotation.annotatedScreenshot.path
    });
  }
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function routeTemplateModel(report: AuditReport) {
  const groups = new Map<string, Array<{ pageId: string; url: string; title?: string; importance: string }>>();
  for (const page of report.pages) {
    const pathname = new URL(page.url).pathname;
    const depth = pathname.split("/").filter(Boolean).length;
    const key = `${page.pageType}:${depth}`;
    const group = groups.get(key) ?? [];
    group.push({ pageId: page.pageId, url: page.url, title: page.title, importance: page.businessImportance });
    groups.set(key, group);
  }
  return {
    schemaVersion: "design-review-workflow.route-templates.v1",
    auditId: report.auditId,
    templates: [...groups.entries()].map(([key, pages]) => ({
      templateId: key.replace(/[^a-z0-9]+/gi, "_").toLowerCase(),
      pageType: key.split(":")[0],
      depth: Number(key.split(":")[1]),
      pageCount: pages.length,
      pages
    }))
  };
}

function visualSystemModel(report: AuditReport) {
  const colors = new Map<string, number>();
  const backgrounds = new Map<string, number>();
  const fonts = new Map<string, number>();
  const fontSizes = new Map<string, number>();
  const radii = new Map<string, number>();

  for (const page of report.pages) {
    for (const color of page.cssSignals?.colors ?? []) increment(colors, color);
    for (const color of page.cssSignals?.backgroundColors ?? []) increment(backgrounds, color);
    for (const font of page.cssSignals?.fonts ?? []) increment(fonts, font);
    for (const size of page.cssSignals?.fontSizes ?? []) increment(fontSizes, String(size));
    for (const radius of page.cssSignals?.borderRadii ?? []) increment(radii, String(radius));
  }

  return {
    schemaVersion: "design-review-workflow.visual-system.v1",
    auditId: report.auditId,
    colors: ranked(colors),
    backgroundColors: ranked(backgrounds),
    fonts: ranked(fonts),
    fontSizes: ranked(fontSizes),
    borderRadii: ranked(radii),
    risks: {
      typographyFragmentation: fontSizes.size > 14 || fonts.size > 4,
      colorFragmentation: colors.size + backgrounds.size > 36
    }
  };
}

function experienceTimingModel(report: AuditReport) {
  return {
    schemaVersion: "design-review-workflow.experience-timing.v1",
    auditId: report.auditId,
    source: "browser_navigation_timing",
    pages: report.pages.map((page) => ({
      pageId: page.pageId,
      url: page.url,
      status: page.performance?.status ?? "skipped",
      domContentLoadedMs: page.performance?.domContentLoadedMs,
      loadEventMs: page.performance?.loadEventMs,
      firstPaintMs: page.performance?.firstPaintMs,
      firstContentfulPaintMs: page.performance?.firstContentfulPaintMs,
      transferSizeKb: page.performance?.transferSizeKb,
      lighthouse: page.performance?.lighthouse
    }))
  };
}

function performanceAuditModel(report: AuditReport) {
  const pages = report.pages.map((page) => {
    const resourceSummary = page.performance?.resourceSummary;
    return {
      pageId: page.pageId,
      url: page.url,
      status: page.performance?.status ?? "skipped",
      source: page.performance?.source ?? "browser_navigation_timing",
      timings: {
        domContentLoadedMs: page.performance?.domContentLoadedMs,
        loadEventMs: page.performance?.loadEventMs,
        firstPaintMs: page.performance?.firstPaintMs,
        firstContentfulPaintMs: page.performance?.firstContentfulPaintMs,
        transferSizeKb: page.performance?.transferSizeKb
      },
      coreWebVitalsCandidates: {
        firstContentfulPaintMs: page.performance?.firstContentfulPaintMs,
        largestContentfulPaintMs: page.performance?.lighthouse?.largestContentfulPaintMs,
        totalBlockingTimeMs: page.performance?.lighthouse?.totalBlockingTimeMs,
        cumulativeLayoutShift: page.performance?.lighthouse?.cumulativeLayoutShift,
        note: "Navigation timing is captured by the local browser. Lighthouse metrics appear only when a Lighthouse result exists."
      },
      resources: resourceSummary,
      largestResources: resourceSummary?.largestResources ?? [],
      risks: performanceRisks(page.performance)
    };
  });
  return {
    schemaVersion: "design-review-workflow.performance-audit.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    status: pages.some((page) => page.status === "completed") ? "completed" : "limited",
    lighthouse: {
      status: report.pages.some((page) => page.performance?.lighthouse?.status === "completed") ? "completed" : "not_run",
      note:
        "This artifact is Lighthouse-compatible in shape but does not claim a Lighthouse run unless page.performance.lighthouse.status is completed."
    },
    pages,
    summary: {
      pagesMeasured: pages.filter((page) => page.status === "completed").length,
      totalPages: pages.length,
      slowLoadPages: pages.filter((page) => typeof page.timings.loadEventMs === "number" && page.timings.loadEventMs > 3500).length,
      thirdPartyOrigins: unique(
        report.pages.flatMap((page) => page.performance?.resourceSummary?.thirdPartyOrigins ?? [])
      ).slice(0, 50)
    },
    limitations: [
      "Browser navigation timing and resource timing are local evidence, not backend profiling.",
      "Use a dedicated Lighthouse or RUM workflow for lab-grade or field performance claims.",
      "SEO scoring is intentionally out of scope for this design workflow."
    ]
  };
}

function accessibilityDetailModel(report: AuditReport) {
  return {
    schemaVersion: "design-review-workflow.accessibility-detail.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    status: report.pages.some((page) => page.accessibility?.status === "completed") ? "completed" : "limited",
    pages: report.pages.map((page) => ({
      pageId: page.pageId,
      url: page.url,
      axe: page.accessibility,
      forms: page.text.forms.map((form) => ({
        selector: form.selector,
        inputCount: form.inputCount,
        missingLabelCount: form.missingLabelCount,
        submitText: form.submitText
      })),
      images: {
        total: page.text.imageCount,
        missingAlt: page.text.imagesMissingAlt
      },
      contrastCandidates: (page.cssSignals?.contrastPairs ?? [])
        .filter((pair) => pair.ratio > 0 && pair.ratio < 4.5)
        .slice(0, 25)
    })),
    totals: {
      violations: report.pages.reduce((sum, page) => sum + (page.accessibility?.violationCount ?? 0), 0),
      critical: report.pages.reduce((sum, page) => sum + (page.accessibility?.critical ?? 0), 0),
      serious: report.pages.reduce((sum, page) => sum + (page.accessibility?.serious ?? 0), 0),
      imagesMissingAlt: report.pages.reduce((sum, page) => sum + page.text.imagesMissingAlt, 0),
      missingFormLabels: report.pages.reduce((sum, page) => sum + page.text.forms.reduce((formSum, form) => formSum + form.missingLabelCount, 0), 0)
    },
    limitations: [
      "This is an accessibility basics artifact based on automated checks and DOM signals.",
      "It is not a WCAG certification, legal accessibility audit, or substitute for manual assistive technology testing."
    ]
  };
}

function privacyTrackingModel(report: AuditReport) {
  const firstPartyOrigin = originOf(report.config.url);
  const externalLinks = report.pages.flatMap((page) =>
    page.text.links
      .map((link) => link.href)
      .filter((href): href is string => Boolean(href))
      .flatMap((href) => {
        const origin = originOf(href);
        if (!origin || origin === firstPartyOrigin) return [];
        return [{ pageId: page.pageId, url: page.url, href, origin }];
      })
  );
  const thirdPartyOrigins = unique(report.pages.flatMap((page) => page.performance?.resourceSummary?.thirdPartyOrigins ?? []));
  return {
    schemaVersion: "design-review-workflow.privacy-tracking.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    status: "signals_only",
    firstPartyOrigin,
    thirdPartyResourceOrigins: thirdPartyOrigins,
    externalLinks: externalLinks.slice(0, 120),
    cookies: {
      status: "not_collected",
      note: "Cookie values are not collected or exported by default. Cookie banner dismissal may occur only to reveal page content for screenshots."
    },
    storage: {
      status: "not_collected",
      note: "Local/session storage values are not collected in this local-first design audit artifact."
    },
    riskSignals: [
      ...(thirdPartyOrigins.length > 0 ? [`${thirdPartyOrigins.length} third-party resource origin(s) observed through browser resource timing.`] : []),
      ...(externalLinks.length > 0 ? [`${externalLinks.length} external link(s) observed in visible page content.`] : []),
      ...report.pages.flatMap((page) => page.text.forms.length > 0 ? [`${page.text.forms.length} visible form(s) on ${page.url}.`] : [])
    ],
    limitations: [
      "This is privacy/tracking evidence for design review context only.",
      "It does not claim legal privacy compliance, consent compliance, tracker classification completeness, or server-side logging analysis."
    ]
  };
}

function resourceAuditModel(report: AuditReport) {
  const pages = report.pages.map((page) => ({
    pageId: page.pageId,
    url: page.url,
    resourceSummary: page.performance?.resourceSummary,
    largestResources: page.performance?.resourceSummary?.largestResources ?? [],
    renderBlockingCandidates: (page.performance?.resourceSummary?.largestResources ?? []).filter((resource) =>
      resource.initiatorType === "script" || resource.initiatorType === "link" || resource.initiatorType === "css"
    )
  }));
  return {
    schemaVersion: "design-review-workflow.resource-audit.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    pages,
    totals: {
      resources: report.pages.reduce((sum, page) => sum + (page.performance?.resourceSummary?.totalResources ?? 0), 0),
      scripts: report.pages.reduce((sum, page) => sum + (page.performance?.resourceSummary?.scripts ?? 0), 0),
      stylesheets: report.pages.reduce((sum, page) => sum + (page.performance?.resourceSummary?.stylesheets ?? 0), 0),
      images: report.pages.reduce((sum, page) => sum + (page.performance?.resourceSummary?.images ?? 0), 0),
      fonts: report.pages.reduce((sum, page) => sum + (page.performance?.resourceSummary?.fonts ?? 0), 0),
      thirdPartyResources: report.pages.reduce((sum, page) => sum + (page.performance?.resourceSummary?.thirdPartyResources ?? 0), 0)
    },
    limitations: [
      "Resource timing is browser-captured evidence. Bundle internals, source maps, and server waterfall diagnostics are out of scope unless explicitly supplied.",
      "Largest resource candidates are hints for implementation review, not proof of production bottlenecks."
    ]
  };
}

function interactionStatesModel(report: AuditReport) {
  const states = report.pages.flatMap((page) =>
    page.interactionStates.map((state) => ({
      pageId: page.pageId,
      url: page.url,
      ...state,
      screenshotPath: page.screenshots[state.screenshotId]?.path
    }))
  );
  const byCategory = new Map<string, number>();
  for (const state of states) increment(byCategory, state.category);
  return {
    schemaVersion: "design-review-workflow.interaction-states.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    status: states.length > 0 ? "completed" : "none_captured",
    settings: report.config.interactions,
    coverage: {
      totalStates: states.length,
      byCategory: ranked(byCategory),
      pagesWithStates: new Set(states.map((state) => state.pageId)).size,
      pagesCaptured: report.pages.length
    },
    states,
    safetyPolicy: {
      mutatingActionsAllowed: false,
      formSubmissionAllowed: report.config.interactions.allowFormErrorChecks,
      loginAllowed: report.config.interactions.allowLogin,
      purchaseAllowed: report.config.interactions.allowPurchase,
      note: "Captured states are intended for safe read-only UI surfaces such as menus, dialogs, tabs, accordions, filters, carousels, and popovers."
    }
  };
}

function enterpriseReadinessModel(report: AuditReport) {
  const hasVisualReview = Boolean(report.agentVisualReview);
  const requiredArtifactFiles = [
    "performance-audit.json",
    "accessibility-detail.json",
    "privacy-tracking.json",
    "resource-audit.json",
    "interaction-states.json",
    "related-workflows.json"
  ];
  return {
    schemaVersion: "design-review-workflow.enterprise-readiness.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    status: report.businessGradeStatus === "business_grade" && hasVisualReview ? "business_grade_ready" : "agent_review_pending",
    businessGradeStatus: report.businessGradeStatus,
    reviewMode: report.config.reviewMode,
    gates: [
      { name: "Captured pages", status: report.pages.length > 0 ? "pass" : "fail" },
      { name: "Screenshot evidence", status: report.pages.some((page) => Object.keys(page.screenshots).length > 0) ? "pass" : "fail" },
      { name: "Safe interaction evidence", status: report.pages.some((page) => page.interactionStates.length > 0) ? "pass" : "warn" },
      { name: "Business-grade visual review", status: hasVisualReview ? "pass" : "pending" },
      { name: "Related workflow seam", status: "pass" }
    ],
    requiredArtifacts: requiredArtifactFiles.map((file) => ({ file: `report/${file}`, status: "written_by_report_bundle" })),
    limitations:
      report.businessGradeStatus === "business_grade"
        ? report.limitations
        : [
            ...report.limitations,
            "Enterprise local evidence is present, but subjective business-grade design judgment requires a validated AgentVisualReview import."
          ]
  };
}

function runRetrospectiveModel(report: AuditReport) {
  const highSeverityFindings = report.findings.filter((finding) => finding.severity === "critical" || finding.severity === "high").length;
  return {
    schemaVersion: "design-review-workflow.run-retrospective.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    url: report.config.url,
    mode: report.config.mode,
    reviewMode: report.config.reviewMode,
    businessGradeStatus: report.businessGradeStatus,
    counts: {
      pages: report.pages.length,
      findings: report.findings.length,
      highSeverityFindings,
      groupedIssues: report.groupedIssues.length,
      interactionStates: report.pages.reduce((sum, page) => sum + page.interactionStates.length, 0),
      screenshots: report.pages.reduce((sum, page) => sum + Object.keys(page.screenshots).length, 0)
    },
    gates: {
      visualReviewImported: Boolean(report.agentVisualReview),
      relatedWorkflowCount: report.config.relatedWorkflows.length,
      providerAutoConfigured: report.config.reviewMode === "auto" || report.config.reviewMode === "hybrid"
    },
    recommendedAgentLearningFile:
      "report/learnings/<agent-name>-<YYYYMMDD-HHMMSS>-learnings.md",
    note:
      "This machine-readable retrospective is generated by the workflow. Running agents should add a human learning note when they complete visual review, implementation, or workflow troubleshooting."
  };
}

function renderLearningsReadme(report: AuditReport): string {
  return `# Agent Learnings

Audit: ${report.auditId}
Target: ${report.config.url}

This folder is for maintainers to collect workflow feedback from agents after real runs.

Agents should add a short Markdown note here when they:

- Completed a manual or provider-backed visual review import.
- Hit provider, browser, capture, report, export, or handoff friction.
- Found false positives, missing evidence, confusing instructions, or report UX gaps.
- Identified a useful fixture, eval, suppression rule, or workflow improvement.

Use \`agent-learning-template.md\` as the shape and write notes as:

\`\`\`text
report/learnings/<agent-name>-<YYYYMMDD-HHMMSS>-learnings.md
\`\`\`

Keep notes evidence-linked and concise. Do not include secrets, cookies, private customer data, or raw provider payloads.
`;
}

function renderLearningTemplate(report: AuditReport): string {
  return `# Agent Learning Note

Audit: ${report.auditId}
Target: ${report.config.url}
Agent:
Date:

## Outcome

- Business-grade status before final closeout:
- Visual review imported: yes/no
- Commands run:

## What Went Well

-

## Friction Or Failure Points

-

## Evidence Or Report Gaps

-

## False Positives Or Weak Findings

-

## Suggested Workflow Improvement

- Proposed change:
- Why it matters:
- Suggested acceptance test:
- Priority: low/medium/high

## Maintainer Notes

-
`;
}

function emptySuppressionReport(report: AuditReport) {
  return {
    schemaVersion: "design-review-workflow.suppression-report.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    suppressionsApplied: 0,
    suppressedFindingIds: [],
    note: "No suppressions were supplied. Suppressions are non-destructive and never remove findings from findings.json."
  };
}

function repoAnalysisPlaceholder(report: AuditReport) {
  return {
    schemaVersion: "design-review-workflow.repo-analysis.v1",
    auditId: report.auditId,
    status: "not_supplied",
    sourceRepo: null,
    frameworks: [],
    routeFiles: [],
    componentFiles: [],
    styleFiles: [],
    contentFiles: [],
    configFiles: [],
    note: "No target source repository was supplied. Run the workflow with --repo <path> to generate source-backed candidates."
  };
}

function sourceCandidatesPlaceholder(report: AuditReport) {
  return {
    schemaVersion: "design-review-workflow.source-candidates.v1",
    auditId: report.auditId,
    sourceRepo: null,
    byFinding: {},
    note: "No target source repository was supplied. Run the workflow with --repo <path> to map findings to files."
  };
}

function changedFilesPlaceholder(report: AuditReport) {
  return {
    schemaVersion: "design-review-workflow.changed-files.v1",
    auditId: report.auditId,
    mode: "proposal_only",
    changedFiles: [],
    note: "No target source repository was supplied. Repo-aware candidate files can be generated with the CLI --repo option."
  };
}

function renderPatchPlan(report: AuditReport): string {
  const lines = [
    "# Patch Plan",
    "",
    "This workflow is report-first. It does not modify a target website repository unless an agent is explicitly given that repository and asked to implement changes.",
    "",
    "## Proposed Change Areas",
    ""
  ];
  for (const ticket of report.tickets.slice(0, 12)) {
    lines.push(`### ${ticket.title}`);
    lines.push(`- Priority: ${ticket.priority}`);
    lines.push(`- Owners: ${ticket.role.join(", ")}`);
    lines.push(`- Evidence: ${ticket.evidenceRefs.join(", ")}`);
    lines.push(`- Acceptance: ${ticket.acceptanceCriteria.join("; ")}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function renderStakeholderRecommendations(report: AuditReport): string {
  const lines = [
    "# Stakeholder Recommendations",
    "",
    `Target: ${report.config.url}`,
    `Audit: ${report.auditId}`,
    `Business-grade status: ${report.businessGradeStatus}`,
    "",
    "## Recommended Sequence",
    "",
    "1. Resolve high-priority clarity, trust, mobile, and conversion blockers with evidence-backed acceptance criteria.",
    "2. Validate risky public-facing changes with the accountable stakeholder before implementation.",
    "3. Rerun the audit and compare against the baseline after changes land.",
    ""
  ];
  if (report.businessGradeStatus !== "business_grade") {
    lines.push("## Review Limitation");
    lines.push("");
    lines.push("This audit has not imported a validated multimodal visual review. Treat subjective style, taste, and redesign direction as pending until `business-grade lint` passes.");
    lines.push("");
  }
  lines.push("## Priority Recommendations");
  lines.push("");
  for (const finding of report.findings.slice(0, 12)) {
    lines.push(`### ${finding.title}`);
    lines.push(`- Priority: ${finding.priorityScore}`);
    lines.push(`- Severity: ${finding.severity}`);
    lines.push(`- Owner: ${finding.implementation.owner.join(", ")}`);
    lines.push(`- Evidence URL: ${finding.evidence.url}`);
    lines.push(`- Evidence refs: ${finding.evidence.screenshotRefs.join(", ") || "page evidence only"}`);
    lines.push(`- Recommendation: ${finding.recommendation}`);
    lines.push(`- Acceptance: ${finding.implementation.acceptanceCriteria.join("; ")}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function renderBeforeAfterComparison(report: AuditReport): string {
  return `# Before / After Comparison

Target: ${report.config.url}
Audit: ${report.auditId}

No baseline audit was supplied to this report bundle, so before/after deltas are not computed here.

When a compatible baseline exists, run:

\`\`\`bash
node apps/cli/dist/index.js compare <baseline-audit-dir> <candidate-audit-dir>
\`\`\`

Use the generated comparison JSON for score deltas, finding deltas, and screenshot pixel diffs where screenshots are compatible.
`;
}

function renderManualActions(report: AuditReport): string {
  const gated = report.findings.filter(approvalRequiredForFinding);
  const lines = ["# Manual Actions", "", "Human approval is required before implementing risky public-facing changes.", ""];
  if (gated.length === 0) {
    lines.push("No approval-gated findings were detected by the current rules.");
  } else {
    for (const finding of gated) {
      lines.push(`- ${finding.title}: ${finding.recommendation}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderRemainingUserDecisions(report: AuditReport): string {
  const lines = [
    "# Remaining User Decisions",
    "",
    "- Confirm the website goal and target audience if they were inferred.",
    "- Approve conversion, trust, pricing, checkout-adjacent, or brand-positioning changes before implementation.",
    "- Provide the target website source repository when source-backed implementation is required.",
    "- Run a dedicated performance or accessibility audit when certification-grade evidence is needed.",
    ""
  ];
  if (report.config.websiteGoal) {
    lines.splice(2, 1, `- Website goal supplied: ${report.config.websiteGoal}`);
  }
  return lines.join("\n");
}

function renderDesignBenchmarkMarkdown(report: AuditReport): string {
  const benchmark = designBenchmarkModel(report);
  return `# Design Workflow Benchmark

Audit: ${report.auditId}
URL: ${report.config.url}

## Scores

- Overall handoff readiness: ${benchmark.score.overall}
- Evidence completeness: ${benchmark.score.evidenceCompleteness}
- Actionability: ${benchmark.score.actionability}
- Report completeness: ${benchmark.score.reportCompleteness}

## Gates

${benchmark.gates.map((gate) => `- ${gate.status}: ${gate.name}`).join("\n")}
`;
}

function approvalRequiredForFinding(finding: Finding): boolean {
  return finding.category === "conversion" || finding.category === "trust" || finding.severity === "critical";
}

function percent(numerator: number, denominator: number): number {
  return Math.round((numerator / denominator) * 100);
}

function performanceRisks(performance: AuditReport["pages"][number]["performance"]): string[] {
  if (!performance || performance.status !== "completed") return ["Performance evidence was not completed for this page."];
  const risks: string[] = [];
  if (typeof performance.loadEventMs === "number" && performance.loadEventMs > 3500) risks.push("Load event exceeded 3500ms in local capture.");
  if (typeof performance.firstContentfulPaintMs === "number" && performance.firstContentfulPaintMs > 2500) risks.push("First contentful paint exceeded 2500ms in local capture.");
  if ((performance.resourceSummary?.thirdPartyResources ?? 0) > 12) risks.push("Multiple third-party resources were observed.");
  if ((performance.resourceSummary?.largestResources ?? []).some((resource) => (resource.transferSizeKb ?? 0) > 1024)) risks.push("At least one resource exceeded 1MB transfer size.");
  return risks;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function originOf(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function increment(map: Map<string, number>, value: string): void {
  const key = value.trim();
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function ranked(map: Map<string, number>) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([value, count]) => ({ value, count }));
}

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false
  );
}
