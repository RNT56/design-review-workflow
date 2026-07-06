import { PageEvidence, PageType, WebsiteType } from "../schemas/audit.js";
import type { ExtractedPage } from "../capture/extraction.js";

export type PageClassification = {
  pageType: PageType;
  confidence: "high" | "medium" | "low";
  primaryUserGoal: string;
  businessImportance: "high" | "medium" | "low";
};

const pageRules: Array<{ type: PageType; pattern: RegExp; goal: string; importance: "high" | "medium" | "low" }> = [
  { type: "pricing", pattern: /\/(pricing|preise|plans|tarife|angebot)/i, goal: "Compare offers and choose a plan", importance: "high" },
  { type: "contact", pattern: /\/(contact|kontakt|demo|book|termin|anfrage)/i, goal: "Contact the organization or request a conversation", importance: "high" },
  { type: "checkout_start", pattern: /\/(checkout|kasse)/i, goal: "Start checkout", importance: "high" },
  { type: "cart", pattern: /\/(cart|warenkorb)/i, goal: "Review selected products", importance: "high" },
  { type: "product_detail", pattern: /\/(product|products|produkte|p)\//i, goal: "Evaluate a product and decide whether to buy", importance: "high" },
  { type: "category", pattern: /\/(shop|store|collections|category|kategorie)/i, goal: "Browse a product or content category", importance: "medium" },
  { type: "service", pattern: /\/(services|leistungen|service|solutions|loesungen|lösungen)/i, goal: "Understand a service offering", importance: "high" },
  { type: "about", pattern: /\/(about|ueber|uber|team|company|agentur)/i, goal: "Assess credibility and fit", importance: "medium" },
  { type: "blog_article", pattern: /\/(blog|articles|magazin|resources)\/.+/i, goal: "Read article content", importance: "medium" },
  { type: "blog_index", pattern: /\/(blog|articles|magazin|resources)$/i, goal: "Discover articles and resources", importance: "medium" },
  { type: "portfolio", pattern: /\/(work|portfolio|projects|case-studies|referenzen)/i, goal: "Evaluate proof and past work", importance: "high" }
];

export function classifyPage(url: string, evidence: Pick<ExtractedPage, "headings" | "buttons" | "links" | "visibleTextSample">): PageClassification {
  const parsed = new URL(url);
  if (parsed.pathname === "/" || parsed.pathname === "") {
    return {
      pageType: "homepage",
      confidence: "high",
      primaryUserGoal: "Understand the offer and choose the next action",
      businessImportance: "high"
    };
  }

  for (const rule of pageRules) {
    if (rule.pattern.test(parsed.pathname)) {
      return {
        pageType: rule.type,
        confidence: "high",
        primaryUserGoal: rule.goal,
        businessImportance: rule.importance
      };
    }
  }

  const text = `${evidence.headings.map((heading) => heading.text).join(" ")} ${evidence.buttons.map((button) => button.text).join(" ")} ${evidence.visibleTextSample}`.toLowerCase();

  if (/(price|pricing|preise|plan|tarif)/.test(text)) {
    return { pageType: "pricing", confidence: "medium", primaryUserGoal: "Compare offers and choose a plan", businessImportance: "high" };
  }
  if (/(add to cart|warenkorb|checkout|buy now|jetzt kaufen)/.test(text)) {
    return { pageType: "product_detail", confidence: "medium", primaryUserGoal: "Evaluate a product and decide whether to buy", businessImportance: "high" };
  }
  if (/(contact|kontakt|book a call|demo|anfrage|termin)/.test(text)) {
    return { pageType: "contact", confidence: "medium", primaryUserGoal: "Contact the organization or request a conversation", businessImportance: "high" };
  }

  return {
    pageType: "unknown",
    confidence: "low",
    primaryUserGoal: "Unclear from captured evidence",
    businessImportance: "low"
  };
}

export function inferWebsiteType(pages: PageEvidence[], providedIndustry?: string): { websiteType: WebsiteType; confidence: "high" | "medium" | "low"; assumptions: string[] } {
  const text = pages.map((page) => `${page.url} ${page.title ?? ""} ${page.text.visibleTextSample}`).join(" ").toLowerCase();
  const pageTypes = new Set(pages.map((page) => page.pageType));
  const assumptions: string[] = [];

  if (providedIndustry) {
    assumptions.push(`Industry was provided as "${providedIndustry}" and used as contextual evidence.`);
  }

  if (pageTypes.has("product_detail") || pageTypes.has("cart") || pageTypes.has("checkout_start") || /(add to cart|shipping|sku|shop now|warenkorb)/.test(text)) {
    return { websiteType: "ecommerce", confidence: "medium", assumptions };
  }
  if (pageTypes.has("pricing") && /(demo|signup|sign up|platform|software|api|dashboard|workspace)/.test(text)) {
    return { websiteType: "saas", confidence: "medium", assumptions };
  }
  if (/(portfolio|selected work|case study|projects|clients)/.test(text) && !pageTypes.has("pricing")) {
    return { websiteType: "portfolio", confidence: "medium", assumptions };
  }
  if (/(appointment|service area|local|near you|praxis|kanzlei|restaurant|salon|repair)/.test(text)) {
    return { websiteType: "local_service", confidence: "medium", assumptions };
  }
  if (pageTypes.has("blog_index") || pageTypes.has("blog_article")) {
    return { websiteType: "blog_magazine", confidence: "low", assumptions };
  }
  if (/(enterprise|solutions|contact sales|case studies|whitepaper|b2b)/.test(text)) {
    return { websiteType: "b2b", confidence: "medium", assumptions };
  }

  return {
    websiteType: "unknown",
    confidence: "low",
    assumptions: [...assumptions, "Website type was inferred from captured public text and may be incomplete."]
  };
}
