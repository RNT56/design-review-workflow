import { FindingCategory, PageType, WebsiteType } from "../schemas/audit.js";

export type Criterion = {
  id: string;
  category: FindingCategory;
  appliesTo: {
    pageTypes?: PageType[];
    websiteTypes?: WebsiteType[];
  };
  principle: string;
  question: string;
  evidenceRequired: string[];
  recommendationPatterns: string[];
};

export const criteriaLibrary: Criterion[] = [
  {
    id: "hero_value_proposition_clarity",
    category: "conversion",
    appliesTo: {
      pageTypes: ["homepage", "landing", "service", "product", "pricing"],
      websiteTypes: ["b2b", "saas", "local_service", "ecommerce", "corporate"]
    },
    principle: "clarity",
    question: "Is the primary value proposition understandable within the first viewport?",
    evidenceRequired: ["above_fold_screenshot", "h1_text", "primary_cta_text"],
    recommendationPatterns: [
      "Rewrite the hero headline around user outcome, audience, and differentiator.",
      "Make the primary CTA visually dominant and action-specific."
    ]
  },
  {
    id: "cta_hierarchy",
    category: "conversion",
    appliesTo: {
      pageTypes: ["homepage", "landing", "pricing", "service", "product_detail", "contact"]
    },
    principle: "hierarchy",
    question: "Does the page provide one clear primary next action?",
    evidenceRequired: ["button_text", "link_text", "above_fold_screenshot"],
    recommendationPatterns: [
      "Define one primary CTA per page and visually demote secondary actions.",
      "Use action-specific copy that describes the next step."
    ]
  },
  {
    id: "navigation_wayfinding",
    category: "ux",
    appliesTo: {
      pageTypes: ["homepage", "landing", "pricing", "service", "product", "category", "about", "contact"]
    },
    principle: "wayfinding",
    question: "Can users understand the main paths available from the current page?",
    evidenceRequired: ["navigation_links", "header_screenshot"],
    recommendationPatterns: [
      "Expose the core user paths in the primary navigation.",
      "Use concrete labels for offers, proof, pricing, and contact paths."
    ]
  },
  {
    id: "form_accessible_names",
    category: "accessibility_basic",
    appliesTo: {
      pageTypes: ["contact", "checkout_start", "landing", "pricing", "homepage"]
    },
    principle: "accessibility",
    question: "Do all form controls have persistent labels or accessible names?",
    evidenceRequired: ["form_summary", "dom_extract"],
    recommendationPatterns: [
      "Add explicit labels or accessible names to every control.",
      "Do not rely on placeholder text as the only field instruction."
    ]
  },
  {
    id: "typography_system_consistency",
    category: "design_system",
    appliesTo: {},
    principle: "consistency",
    question: "Does typography follow a coherent, repeatable scale?",
    evidenceRequired: ["font_families", "font_sizes", "screenshots"],
    recommendationPatterns: [
      "Consolidate type usage into a documented scale.",
      "Remove one-off font sizes unless they map to a deliberate component variant."
    ]
  },
  {
    id: "trust_signal_proximity",
    category: "trust",
    appliesTo: {
      pageTypes: ["homepage", "landing", "pricing", "product_detail"],
      websiteTypes: ["b2b", "saas", "ecommerce", "local_service", "corporate"]
    },
    principle: "credibility",
    question: "Are proof and trust signals near major decisions?",
    evidenceRequired: ["visible_text", "section_inventory", "screenshots"],
    recommendationPatterns: [
      "Place proof close to the primary offer or pricing decision.",
      "Use customer logos, testimonials, case studies, reviews, certifications, or outcome metrics."
    ]
  }
];

export function criteriaFor(pageType: PageType, websiteType: WebsiteType): Criterion[] {
  return criteriaLibrary.filter((criterion) => {
    const pageMatch = !criterion.appliesTo.pageTypes || criterion.appliesTo.pageTypes.includes(pageType);
    const websiteMatch = !criterion.appliesTo.websiteTypes || criterion.appliesTo.websiteTypes.includes(websiteType);
    return pageMatch && websiteMatch;
  });
}
