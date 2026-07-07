import * as path from "node:path";
import type { AuditReport, PageEvidence, PageReviewSignals } from "../schemas/audit.js";
import type { AuditPaths } from "../storage/project.js";
import { writeJson } from "../utils/fs.js";

export type EvidenceBrief = {
  schemaVersion: "design-review-workflow.evidence-brief.v1";
  auditId: string;
  generatedAt: string;
  url: string;
  businessGradeStatus: AuditReport["businessGradeStatus"];
  websiteType: AuditReport["websiteType"];
  websiteTypeConfidence: AuditReport["websiteTypeConfidence"];
  context: {
    goal?: string;
    audience?: string;
    industry?: string;
    brandContext?: string;
  };
  pages: Array<{
    pageId: string;
    url: string;
    pageType: PageEvidence["pageType"];
    importance: PageEvidence["businessImportance"];
    title?: string;
    headline?: PageReviewSignals["headline"];
    ctas?: PageReviewSignals["ctas"];
    proof?: PageReviewSignals["proof"];
    firstViewport?: PageReviewSignals["firstViewport"];
    mobileDesktop?: PageReviewSignals["mobileDesktop"];
    contentDensity?: PageReviewSignals["contentDensity"];
    visualSystem?: PageReviewSignals["visualSystem"];
    topHeadings: string[];
    navigationLabels: string[];
    screenshotIds: string[];
    interactionStates: Array<{
      id: string;
      viewport: string;
      category: string;
      label: string;
      state: string;
      screenshotId: string;
      urlChanged: boolean;
      notes: string[];
    }>;
  }>;
  deterministicFindings: Array<{
    findingId: string;
    title: string;
    category: string;
    severity: string;
    priorityScore: number;
    url: string;
    observation: string;
    recommendation: string;
    evidenceRefs: string[];
    textQuotes: string[];
  }>;
  reviewGuidance: string[];
};

export async function writeEvidenceBrief(report: AuditReport, paths: AuditPaths, brief = buildEvidenceBrief(report)): Promise<string> {
  const output = path.join(paths.report, "evidence-brief.json");
  await writeJson(output, brief);
  return output;
}

export function buildEvidenceBrief(report: AuditReport): EvidenceBrief {
  return {
    schemaVersion: "design-review-workflow.evidence-brief.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    url: report.config.url,
    businessGradeStatus: report.businessGradeStatus,
    websiteType: report.websiteType,
    websiteTypeConfidence: report.websiteTypeConfidence,
    context: {
      goal: report.config.websiteGoal,
      audience: report.config.targetAudience,
      industry: report.config.industry,
      brandContext: report.config.brandContext
    },
    pages: report.pages.map((page) => ({
      pageId: page.pageId,
      url: page.url,
      pageType: page.pageType,
      importance: page.businessImportance,
      title: page.title,
      headline: page.reviewSignals?.headline,
      ctas: page.reviewSignals?.ctas,
      proof: page.reviewSignals?.proof,
      firstViewport: page.reviewSignals?.firstViewport,
      mobileDesktop: page.reviewSignals?.mobileDesktop,
      contentDensity: page.reviewSignals?.contentDensity,
      visualSystem: page.reviewSignals?.visualSystem,
      topHeadings: page.text.headings.slice(0, 8).map((heading) => heading.text),
      navigationLabels: page.structure.navigation.slice(0, 12).map((item) => item.text),
      screenshotIds: Object.keys(page.screenshots),
      interactionStates: page.interactionStates.map((state) => ({
        id: state.id,
        viewport: state.viewport,
        category: state.category,
        label: state.label,
        state: state.state,
        screenshotId: state.screenshotId,
        urlChanged: state.urlChanged,
        notes: state.notes
      }))
    })),
    deterministicFindings: report.findings.slice(0, 20).map((finding) => ({
      findingId: finding.findingId,
      title: finding.title,
      category: finding.category,
      severity: finding.severity,
      priorityScore: finding.priorityScore,
      url: finding.evidence.url,
      observation: finding.observation,
      recommendation: finding.recommendation,
      evidenceRefs: finding.evidence.screenshotRefs,
      textQuotes: finding.evidence.textQuotes
    })),
    reviewGuidance: [
      "Use this brief as structured context, not as a substitute for screenshot inspection.",
      "Business-grade judgment must be based on captured screenshots and evidence references.",
      "Inspect interaction state screenshots for captured menus, dialogs, popovers, accordions, tabs, and other safe UI states before judging navigation or hidden content.",
      "Do not claim analytics, user behavior, revenue, competitor performance, or private brand rules unless supplied as explicit evidence."
    ]
  };
}
