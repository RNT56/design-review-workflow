import * as path from "node:path";
import {
  AuditConfig,
  AuditReport,
  Finding,
  FindingCategorySchema,
  PageEvidence,
  TicketRecommendation,
  WebsiteType
} from "../schemas/audit.js";
import { AuditPaths } from "../storage/project.js";
import { writeJson } from "../utils/fs.js";
import { stableId } from "../utils/id.js";
import { inferWebsiteType } from "./classification.js";
import { createScorecard, priorityScore } from "./scoring.js";

type FindingDraft = Omit<Finding, "findingId" | "priorityScore" | "relatedFindings">;

const actionWords = /\b(start|get|try|buy|book|contact|request|schedule|download|subscribe|sign up|learn|compare|demo|call|order|shop|anfragen|kontakt|buchen|kaufen|testen|starten|demo)\b/i;

export async function reviewEvidence(config: AuditConfig, pages: PageEvidence[], paths: AuditPaths): Promise<AuditReport> {
  const website = inferWebsiteType(pages, config.industry);
  const rawFindings = pages.flatMap((page) => generatePageFindings(page, website.websiteType));
  await writeAgentRuns(rawFindings, paths);

  const findings = validateAndDedupe(rawFindings, pages)
    .map((finding, index) => ({ ...finding, findingId: stableId("finding", `${finding.title}:${finding.evidence.url}:${finding.category}`, index + 1) }))
    .sort((a, b) => b.priorityScore - a.priorityScore);

  await writeJson(path.join(paths.synthesis, "findings.raw.json"), rawFindings);
  await writeJson(path.join(paths.synthesis, "findings.validated.json"), findings);

  const scorecard = createScorecard(findings, pages, website.websiteType);
  await writeJson(path.join(paths.synthesis, "scorecard.json"), scorecard);

  const quickWins = findings.filter((finding) => finding.effort === "low" && finding.impact !== "low" && finding.confidence !== "low").slice(0, 10);
  const tickets = createTickets(findings);
  const redesignBriefing = createRedesignBriefing(config, pages, findings, website.websiteType);

  return {
    auditId: config.auditId,
    generatedAt: new Date().toISOString(),
    config,
    websiteType: website.websiteType,
    websiteTypeConfidence: website.confidence,
    pages,
    findings,
    quickWins,
    scorecard,
    redesignBriefing,
    tickets,
    assumptions: [
      ...website.assumptions,
      "Brand fit is inferred from public website evidence unless explicit brand context is provided.",
      "Performance findings use browser navigation timing in the MVP, not a full Lighthouse report."
    ],
    limitations: [
      "No login-protected areas were audited.",
      "No purchases, real form submissions, or personal data entry were performed.",
      "Accessibility output is an automated basics pass, not a full WCAG audit.",
      "SEO, analytics, privacy, backend performance, and code quality are outside MVP scope."
    ]
  };
}

function generatePageFindings(page: PageEvidence, websiteType: WebsiteType): Finding[] {
  const drafts: FindingDraft[] = [];
  const h1s = page.text.headings.filter((heading) => heading.tag === "h1");
  const primaryScreenshot = page.screenshots[`${page.pageId}_desktop_above_fold`]?.id ?? Object.keys(page.screenshots)[0];
  const mobileScreenshot = page.screenshots[`${page.pageId}_mobile_above_fold`]?.id ?? primaryScreenshot;
  const pageImportance = page.businessImportance;

  if (h1s.length === 0) {
    drafts.push(draft(page, {
      title: "Primary page headline is missing",
      category: "content_design",
      severity: page.pageType === "homepage" ? "high" : "medium",
      impact: "high",
      effort: "low",
      confidence: "high",
      section: "above the fold",
      screenshotRefs: [primaryScreenshot],
      observation: "The captured page evidence does not include a visible H1 headline.",
      whyItMatters: "The first headline anchors page purpose, scanability, and conversion intent. Without it, users and assistive technology get a weaker orientation signal.",
      recommendation: "Add one visible H1 that states the page-specific value proposition or task in concrete language.",
      owner: ["copywriter", "designer"],
      acceptanceCriteria: ["Exactly one visible H1 is present.", "The H1 describes the page purpose without relying on surrounding context."],
      designPrinciples: ["hierarchy", "clarity"]
    }));
  }

  if (h1s.length > 1) {
    drafts.push(draft(page, {
      title: "Multiple H1 headings dilute page hierarchy",
      category: "content_design",
      severity: "medium",
      impact: "medium",
      effort: "low",
      confidence: "high",
      section: "page structure",
      screenshotRefs: [primaryScreenshot],
      textQuotes: h1s.map((heading) => heading.text).slice(0, 3),
      observation: `The page exposes ${h1s.length} H1 headings in captured evidence.`,
      whyItMatters: "Multiple primary headings can make the page hierarchy harder to scan and weaken the main message.",
      recommendation: "Keep one page-level H1 and demote supporting headings to H2/H3.",
      owner: ["designer", "developer", "copywriter"],
      acceptanceCriteria: ["Only one visible H1 remains.", "Supporting sections use ordered H2/H3 headings."],
      designPrinciples: ["hierarchy", "structure"]
    }));
  }

  const h1Text = h1s[0]?.text ?? "";
  if (h1Text && isWeakHeadline(h1Text) && ["homepage", "landing", "service", "product", "pricing"].includes(page.pageType)) {
    drafts.push(draft(page, {
      title: "Hero headline is too generic to carry the value proposition",
      category: "conversion",
      severity: "medium",
      impact: "high",
      effort: "low",
      confidence: "medium",
      section: "hero",
      screenshotRefs: [primaryScreenshot],
      textQuotes: [h1Text],
      observation: `The primary headline reads "${h1Text}", which gives limited detail about audience, outcome, or differentiator.`,
      whyItMatters: "A first viewport has to quickly explain why the offer matters and what the user should do next.",
      recommendation: "Rewrite the hero around audience, outcome, and differentiator; keep the support copy for proof and specifics.",
      owner: ["copywriter", "marketing"],
      acceptanceCriteria: ["Headline states the core user outcome.", "Subcopy adds proof or specificity.", "The primary CTA aligns with the headline promise."],
      designPrinciples: ["clarity", "information scent"]
    }));
  }

  const actionControls = [...page.text.buttons, ...page.text.links].filter((node) => actionWords.test(node.text));
  if (["homepage", "landing", "pricing", "service", "product", "contact"].includes(page.pageType) && actionControls.length === 0) {
    drafts.push(draft(page, {
      title: "No clear primary action was detected",
      category: "conversion",
      severity: page.pageType === "homepage" ? "high" : "medium",
      impact: "high",
      effort: "medium",
      confidence: "medium",
      section: "primary journey",
      screenshotRefs: [primaryScreenshot],
      observation: "The captured buttons and links do not include an action-oriented primary CTA.",
      whyItMatters: "Users need a clear next step when they understand the offer. Weak action hierarchy increases decision friction.",
      recommendation: "Define one primary action for this page and make it visibly dominant with specific action copy.",
      owner: ["designer", "copywriter", "product"],
      acceptanceCriteria: ["One primary CTA is visible above the fold where appropriate.", "CTA copy names the next action.", "Secondary actions are visually subordinate."],
      designPrinciples: ["hierarchy", "affordance"]
    }));
  }

  if (page.structure.navigation.length < 3 && page.pageType !== "checkout_start") {
    drafts.push(draft(page, {
      title: "Primary navigation has limited detectable structure",
      category: "ux",
      severity: "medium",
      impact: "medium",
      effort: "medium",
      confidence: "medium",
      section: "navigation",
      screenshotRefs: [primaryScreenshot],
      observation: `Only ${page.structure.navigation.length} navigation links were detected in header/navigation evidence.`,
      whyItMatters: "Navigation helps users understand available paths and recover when a page does not match intent.",
      recommendation: "Review the header navigation for clear top-level destinations, especially offer, proof, pricing, and contact paths.",
      owner: ["designer", "product"],
      acceptanceCriteria: ["Header navigation exposes the core user paths.", "Labels use user-facing language.", "The active or current section is understandable."],
      designPrinciples: ["wayfinding", "information architecture"]
    }));
  }

  const formsWithMissingLabels = page.text.forms.filter((form) => form.missingLabelCount > 0);
  if (formsWithMissingLabels.length > 0) {
    drafts.push(draft(page, {
      title: "Form fields are missing programmatic labels",
      category: "accessibility_basic",
      severity: "high",
      impact: "high",
      effort: "medium",
      confidence: "high",
      section: "form",
      screenshotRefs: [primaryScreenshot],
      observation: `${formsWithMissingLabels.length} form(s) include inputs without labels, ARIA labels, or placeholders in captured evidence.`,
      whyItMatters: "Unlabeled form fields increase completion friction and create accessibility barriers for assistive technology.",
      recommendation: "Add explicit labels or accessible names to every input, select, and textarea.",
      owner: ["developer", "designer"],
      acceptanceCriteria: ["Every form control has an associated label or accessible name.", "Placeholder text is not the only persistent instruction.", "Error/help text remains connected to the field."],
      designPrinciples: ["accessibility", "clarity"]
    }));
  }

  if (page.text.imageCount > 0 && page.text.imagesMissingAlt / page.text.imageCount > 0.25) {
    drafts.push(draft(page, {
      title: "Many visible images are missing alternative text",
      category: "accessibility_basic",
      severity: "medium",
      impact: "medium",
      effort: "medium",
      confidence: "high",
      section: "media",
      screenshotRefs: [primaryScreenshot],
      observation: `${page.text.imagesMissingAlt} of ${page.text.imageCount} visible images do not expose alt text.`,
      whyItMatters: "Missing alt text can hide meaningful product, proof, or navigation information from assistive technology.",
      recommendation: "Add descriptive alt text for meaningful images and empty alt text for purely decorative images.",
      owner: ["developer", "copywriter"],
      acceptanceCriteria: ["Meaningful images have concise descriptive alt text.", "Decorative images use empty alt attributes.", "Image text is not the only source of critical information."],
      designPrinciples: ["accessibility", "content design"]
    }));
  }

  const lowContrast = page.cssSignals?.contrastPairs.filter((pair) => pair.ratio < 4.5).slice(0, 5) ?? [];
  if (lowContrast.length > 0) {
    drafts.push(draft(page, {
      title: "Text contrast falls below common readability thresholds",
      category: "accessibility_basic",
      severity: lowContrast.some((pair) => pair.ratio < 3) ? "high" : "medium",
      impact: "high",
      effort: "medium",
      confidence: "medium",
      section: "visual styling",
      screenshotRefs: [primaryScreenshot],
      textQuotes: lowContrast.map((pair) => pair.textSample ?? "").filter(Boolean).slice(0, 3),
      observation: `The lowest sampled contrast ratio is ${lowContrast[0]?.ratio}:1.`,
      whyItMatters: "Low contrast reduces readability, especially on mobile, bright displays, and for users with low vision.",
      recommendation: "Increase foreground/background contrast for body copy, navigation, and CTA-adjacent labels.",
      owner: ["designer", "developer"],
      acceptanceCriteria: ["Body text meets at least 4.5:1 contrast where applicable.", "Large text and UI labels meet appropriate contrast thresholds.", "Updated colors remain consistent with brand tokens."],
      designPrinciples: ["contrast", "readability"]
    }));
  }

  if ((page.cssSignals?.fonts.length ?? 0) > 4 || (page.cssSignals?.fontSizes.length ?? 0) > 14) {
    drafts.push(draft(page, {
      title: "Typography system appears fragmented",
      category: "design_system",
      severity: "medium",
      impact: "medium",
      effort: "medium",
      confidence: "medium",
      section: "typography",
      screenshotRefs: [primaryScreenshot],
      observation: `Captured CSS samples include ${page.cssSignals?.fonts.length ?? 0} font-family values and ${page.cssSignals?.fontSizes.length ?? 0} font-size values.`,
      whyItMatters: "Fragmented typography makes pages feel less coherent and increases implementation debt.",
      recommendation: "Consolidate type usage into a small documented scale for headings, body copy, UI labels, and captions.",
      owner: ["designer", "developer"],
      acceptanceCriteria: ["A documented type scale exists.", "Page templates use the scale consistently.", "One-off font sizes are removed or justified."],
      designPrinciples: ["consistency", "rhythm"]
    }));
  }

  if (page.pageType === "homepage" && !hasTrustSignal(page, websiteType)) {
    drafts.push(draft(page, {
      title: "Homepage lacks obvious trust signals in captured evidence",
      category: "trust",
      severity: "medium",
      impact: "medium",
      effort: "medium",
      confidence: "low",
      section: "trust/proof",
      screenshotRefs: [primaryScreenshot],
      observation: "The MVP text scan did not find clear proof language such as testimonials, customers, case studies, certifications, reviews, or measurable outcomes.",
      whyItMatters: "Trust signals reduce perceived risk, especially for first-time visitors evaluating whether the offer is credible.",
      recommendation: "Add proof close to the primary offer: customer logos, testimonials, case-study links, ratings, certifications, or concrete outcome metrics.",
      owner: ["marketing", "designer", "copywriter"],
      acceptanceCriteria: ["At least one credible proof element appears near the main journey.", "Proof is specific and attributable where possible.", "Trust content is not visually hidden below low-priority content."],
      designPrinciples: ["credibility", "risk reduction"]
    }));
  }

  if (page.performance?.status === "completed" && (page.performance.loadEventMs ?? 0) > 4_000) {
    drafts.push(draft(page, {
      title: "Captured load timing may hurt perceived performance",
      category: "performance_perception",
      severity: "medium",
      impact: "medium",
      effort: "high",
      confidence: "medium",
      section: "page load",
      screenshotRefs: [primaryScreenshot],
      observation: `The browser load event completed at approximately ${page.performance.loadEventMs} ms in the MVP capture run.`,
      whyItMatters: "Slow perceived loading can reduce trust and increase abandonment before users engage with the page.",
      recommendation: "Audit above-the-fold asset weight, image sizing, render-blocking resources, and layout stability in a dedicated performance pass.",
      owner: ["developer"],
      acceptanceCriteria: ["Largest above-the-fold assets are optimized.", "Critical content renders promptly.", "A dedicated Lighthouse/WebPageTest pass confirms improvement."],
      designPrinciples: ["performance perception", "progressive rendering"]
    }));
  }

  const smallTargets = page.structure.components.filter(
    (component) => component.viewport === "desktop" && ["a", "button"].includes(component.type) && component.box && (component.box.width < 36 || component.box.height < 32)
  );
  if (smallTargets.length > 8) {
    drafts.push(draft(page, {
      title: "Several clickable targets appear small",
      category: "mobile",
      severity: "medium",
      impact: "medium",
      effort: "medium",
      confidence: "low",
      section: "interactive elements",
      screenshotRefs: [mobileScreenshot],
      observation: `${smallTargets.length} sampled links or buttons have compact dimensions in captured layout evidence.`,
      whyItMatters: "Small targets are harder to tap accurately on touch devices and can create mobile navigation friction.",
      recommendation: "Review link and button hit areas on mobile and increase padding or spacing for frequently used actions.",
      owner: ["designer", "developer"],
      acceptanceCriteria: ["Primary mobile controls have comfortable hit areas.", "Adjacent tap targets have enough spacing.", "Important actions remain reachable without precision taps."],
      designPrinciples: ["mobile ergonomics", "affordance"]
    }));
  }

  return drafts.map((item, index) => finalizeDraft(item, pageImportance, index));
}

function draft(
  page: PageEvidence,
  input: {
    title: string;
    category: Finding["category"];
    severity: Finding["severity"];
    impact: Finding["impact"];
    effort: Finding["effort"];
    confidence: Finding["confidence"];
    section?: string;
    screenshotRefs: string[];
    textQuotes?: string[];
    observation: string;
    whyItMatters: string;
    recommendation: string;
    owner: Finding["implementation"]["owner"];
    acceptanceCriteria: string[];
    designPrinciples: string[];
  }
): FindingDraft {
  return {
    title: input.title,
    category: input.category,
    severity: input.severity,
    impact: input.impact,
    effort: input.effort,
    confidence: input.confidence,
    evidence: {
      pageId: page.pageId,
      url: page.url,
      viewport: input.screenshotRefs.some((ref) => ref.includes("mobile")) ? "mobile" : "desktop",
      section: input.section,
      screenshotRefs: input.screenshotRefs.filter(Boolean),
      textQuotes: input.textQuotes ?? []
    },
    observation: input.observation,
    whyItMatters: input.whyItMatters,
    recommendation: input.recommendation,
    designPrinciples: input.designPrinciples,
    implementation: {
      owner: input.owner,
      acceptanceCriteria: input.acceptanceCriteria,
      dependencies: [],
      definitionOfDone: ["Evidence has been reviewed after implementation.", "The issue is no longer present in desktop and mobile capture where applicable."]
    }
  };
}

function finalizeDraft(draftItem: FindingDraft, pageImportance: "high" | "medium" | "low", index: number): Finding {
  return {
    ...draftItem,
    findingId: stableId("raw_finding", `${draftItem.title}:${draftItem.evidence.url}`, index + 1),
    priorityScore: priorityScore({
      severity: draftItem.severity,
      impact: draftItem.impact,
      confidence: draftItem.confidence,
      effort: draftItem.effort,
      pageImportance
    }),
    relatedFindings: []
  };
}

function validateAndDedupe(findings: Finding[], pages: PageEvidence[]): Finding[] {
  const pageById = new Map(pages.map((page) => [page.pageId, page]));
  const seen = new Map<string, Finding>();

  for (const finding of findings) {
    const page = pageById.get(finding.evidence.pageId);
    if (!page) {
      continue;
    }
    const hasScreenshot = finding.evidence.screenshotRefs.length === 0 || finding.evidence.screenshotRefs.every((ref) => Boolean(page.screenshots[ref]));
    if (!hasScreenshot) {
      continue;
    }
    if (finding.recommendation.length < 30 || finding.observation.length < 30) {
      continue;
    }

    const key = `${finding.category}:${finding.title}:${finding.evidence.pageId}`;
    const existing = seen.get(key);
    if (!existing || finding.priorityScore > existing.priorityScore) {
      seen.set(key, finding);
    }
  }

  return [...seen.values()];
}

async function writeAgentRuns(findings: Finding[], paths: AuditPaths): Promise<void> {
  const byCategory = new Map<string, Finding[]>();
  for (const finding of findings) {
    const group = byCategory.get(finding.category) ?? [];
    group.push(finding);
    byCategory.set(finding.category, group);
  }

  for (const category of FindingCategorySchema.options) {
    await writeJson(path.join(paths.agentRuns, `${category}.json`), {
      reviewer: category,
      mode: "deterministic_mvp",
      findings: byCategory.get(category) ?? []
    });
  }
}

function createTickets(findings: Finding[]): TicketRecommendation[] {
  return findings.slice(0, 12).map((finding) => ({
    title: finding.title,
    role: finding.implementation.owner,
    priority: finding.severity,
    effort: finding.effort,
    sourceFindingIds: [finding.findingId],
    problem: finding.observation,
    goal: finding.recommendation,
    scope: [finding.evidence.section ?? "affected section", finding.category],
    acceptanceCriteria: finding.implementation.acceptanceCriteria,
    definitionOfDone: finding.implementation.definitionOfDone,
    evidenceRefs: [...finding.evidence.screenshotRefs, finding.evidence.url]
  }));
}

function createRedesignBriefing(config: AuditConfig, pages: PageEvidence[], findings: Finding[], websiteType: WebsiteType) {
  const top = findings.slice(0, 5);
  const homepage = pages.find((page) => page.pageType === "homepage") ?? pages[0];
  return [
    {
      title: "Starting point",
      body: `The audit reviewed ${pages.length} public page(s) for ${new URL(config.url).hostname}. Website type is ${websiteType}; this is inferred unless explicit context was provided.`
    },
    {
      title: "Primary website goal",
      body: config.websiteGoal ?? homepage?.primaryUserGoal ?? "The primary goal is inferred from captured page evidence and should be confirmed with stakeholders."
    },
    {
      title: "Main redesign themes",
      body: top.length
        ? top.map((finding) => `${finding.title}: ${finding.recommendation}`).join(" ")
        : "No high-priority redesign blockers were detected by the MVP rules."
    },
    {
      title: "CTA system",
      body: "Define one primary action per core page, keep secondary actions visually subordinate, and make action copy specific to the user task."
    },
    {
      title: "Trust system",
      body: "Place proof close to major decisions: credible testimonials, customer logos, case studies, certifications, measurable outcomes, or risk-reversal copy."
    },
    {
      title: "Mobile principles",
      body: "Keep primary actions reachable, tap targets comfortable, navigation simple, and first-viewport messaging specific enough to work without desktop context."
    }
  ];
}

function isWeakHeadline(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (normalized.length < 18) return true;
  return /^(welcome|home|solutions|services|products|we build|we create|hello|startseite|willkommen)$/i.test(normalized);
}

function hasTrustSignal(page: PageEvidence, websiteType: WebsiteType): boolean {
  const text = page.text.visibleTextSample.toLowerCase();
  const common = /(customer|client|testimonial|case stud|review|rated|trusted|certified|award|logo|partner|security|privacy|kunden|referenz|bewertung|zertifiziert)/;
  if (common.test(text)) {
    return true;
  }
  if (websiteType === "ecommerce") {
    return /(shipping|return|refund|secure|payment|garantie|versand|retoure)/.test(text);
  }
  return false;
}
