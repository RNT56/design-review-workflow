import type { Page } from "playwright";
import { AuditConfig } from "../schemas/audit.js";
import { isExcluded, normalizeUrl, sameSite } from "../utils/url.js";

export type CrawlCandidate = {
  url: string;
  sourceUrl?: string;
  depth: number;
  anchorText?: string;
  score: number;
};

const priorityPatterns: Array<[RegExp, number]> = [
  [/\/(pricing|preise|plans|tarife|angebot)/i, 38],
  [/\/(product|products|shop|store|collections|leistungen|services)/i, 32],
  [/\/(contact|kontakt|demo|book|termin|anfrage)/i, 30],
  [/\/(about|ueber|uber|team|company|agentur)/i, 18],
  [/\/(case|cases|kunden|referenzen|testimonials)/i, 16],
  [/\/(blog|articles|magazin|resources)/i, 10],
  [/\/(cart|checkout|warenkorb|kasse)/i, 8]
];

export async function discoverPages(page: Page, config: AuditConfig): Promise<CrawlCandidate[]> {
  const start = normalizeUrl(config.url);
  if (!start) {
    throw new Error(`Invalid URL: ${config.url}`);
  }

  const candidates = new Map<string, CrawlCandidate>();
  const visited = new Set<string>();
  const queue: CrawlCandidate[] = [{ url: start, depth: 0, score: 100 }];
  candidates.set(start, queue[0]);

  while (queue.length > 0 && visited.size < Math.max(config.maxPages * 3, config.maxPages)) {
    const current = queue.shift();
    if (!current || visited.has(current.url) || current.depth > config.crawl.maxDepth) {
      continue;
    }
    visited.add(current.url);

    try {
      await page.goto(current.url, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    } catch {
      continue;
    }

    const links = await page
      .locator("a[href]")
      .evaluateAll((anchors) =>
        anchors
          .map((anchor) => {
            const element = anchor as HTMLAnchorElement;
            return { href: element.href, text: element.innerText.trim().slice(0, 120) };
          })
          .filter((link) => Boolean(link.href))
      )
      .catch(() => []);

    for (const link of links) {
      const normalized = normalizeUrl(link.href, current.url);
      if (!normalized) {
        continue;
      }
      if (config.crawl.sameDomainOnly && !sameSite(normalized, start, config.crawl.includeSubdomains)) {
        continue;
      }
      if (isExcluded(normalized, config.crawl.excludePatterns)) {
        continue;
      }
      if (candidates.has(normalized)) {
        continue;
      }

      const candidate: CrawlCandidate = {
        url: normalized,
        sourceUrl: current.url,
        depth: current.depth + 1,
        anchorText: link.text,
        score: rankUrl(normalized, link.text, current.depth + 1)
      };
      candidates.set(normalized, candidate);
      if (candidate.depth < config.crawl.maxDepth) {
        queue.push(candidate);
      }
    }
  }

  const sitemapCandidates = await fetchSitemapCandidates(start, config).catch(() => []);
  for (const candidate of sitemapCandidates) {
    if (!candidates.has(candidate.url)) {
      candidates.set(candidate.url, candidate);
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || a.depth - b.depth || a.url.localeCompare(b.url))
    .slice(0, config.maxPages);
}

export function rankUrl(url: string, anchorText = "", depth = 0): number {
  const parsed = new URL(url);
  let score = parsed.pathname === "/" ? 100 : Math.max(8, 60 - depth * 12);
  const haystack = `${parsed.pathname} ${anchorText}`;

  for (const [pattern, boost] of priorityPatterns) {
    if (pattern.test(haystack)) {
      score += boost;
    }
  }

  if (/(privacy|terms|impressum|legal|login|account|admin)/i.test(haystack)) {
    score -= 100;
  }

  return score;
}

async function fetchSitemapCandidates(startUrl: string, config: AuditConfig): Promise<CrawlCandidate[]> {
  const origin = new URL(startUrl).origin;
  const response = await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) {
    return [];
  }
  const xml = await response.text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/gi)]
    .map((match) => normalizeUrl(match[1] ?? ""))
    .filter((value): value is string => Boolean(value))
    .filter((url) => !isExcluded(url, config.crawl.excludePatterns))
    .filter((url) => !config.crawl.sameDomainOnly || sameSite(url, startUrl, config.crawl.includeSubdomains));

  return urls.map((url) => ({
    url,
    depth: 1,
    sourceUrl: `${origin}/sitemap.xml`,
    score: rankUrl(url, "sitemap", 1)
  }));
}
