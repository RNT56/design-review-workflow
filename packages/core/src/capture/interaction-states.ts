import { readFile } from "node:fs/promises";
import * as path from "node:path";
import type { Page } from "playwright";
import { PNG } from "pngjs";
import type {
  AuditConfig,
  InteractionStateCategory,
  InteractionStateEvidence,
  ScreenshotRef,
  ViewportConfig
} from "../schemas/audit.js";
import { stableId } from "../utils/id.js";
import { resetScrollPosition } from "./render-readiness.js";

type Candidate = {
  interactionId: string;
  selector: string;
  label: string;
  text?: string;
  role?: string;
  tagName: string;
  href?: string;
  target?: string;
  type?: string;
  ariaExpanded?: string;
  ariaHaspopup?: string;
  ariaControls?: string;
  category: InteractionStateCategory;
  score: number;
  notes: string[];
};

type CaptureInteractionStateResult = {
  screenshots: ScreenshotRef[];
  states: InteractionStateEvidence[];
};

type CandidateStateSnapshot = {
  ariaExpanded?: string | null;
  ariaSelected?: string | null;
  detailsOpen: boolean;
  controlledVisible: boolean;
  dialogCount: number;
  menuCount: number;
  popoverOpenCount: number;
};

const dangerousActionPattern =
  /\b(log\s*in|login|sign\s*in|signin|log\s*out|logout|account|admin|delete|remove|discard|save|send|submit|subscribe|checkout|buy|purchase|pay|payment|order|book|reserve|download|upload|share|connect|authorize|oauth)\b/i;
const safeStatePattern =
  /\b(menu|navigation|nav|filter|sort|more|details|faq|question|expand|collapse|open|close|modal|dialog|popover|drawer|tab|next|previous|prev|carousel|gallery)\b/i;

export async function captureInteractionStates(
  page: Page,
  folder: string,
  pageId: string,
  slug: string,
  viewport: ViewportConfig,
  config: AuditConfig,
  remainingPageLimit = config.interactions.maxStateCapturesPerPage
): Promise<CaptureInteractionStateResult> {
  if (config.interactions.level < 1 || !config.interactions.captureStates) {
    return { screenshots: [], states: [] };
  }

  const pageLimit = Math.max(0, config.interactions.maxStateCapturesPerPage);
  const viewportLimit = Math.max(0, Math.min(config.interactions.maxStateCapturesPerViewport, pageLimit, remainingPageLimit));
  if (viewportLimit === 0 || pageLimit === 0) {
    return { screenshots: [], states: [] };
  }

  await resetScrollPosition(page);
  const candidates = await discoverCandidates(page, config, viewport);
  const screenshots: ScreenshotRef[] = [];
  const states: InteractionStateEvidence[] = [];
  const usedSlugs = new Set<string>();

  for (const candidate of candidates.slice(0, viewportLimit)) {
    if (states.length >= viewportLimit) break;

    const beforeUrl = page.url();
    const beforeState = await readCandidateState(page, candidate);
    const activated = await activateCandidate(page, candidate);
    if (!activated) {
      await restorePage(page, candidate, beforeUrl);
      continue;
    }

    await waitForStateSettle(page);

    const afterUrl = page.url();
    const navigationSafety = safeUrlTransition(beforeUrl, afterUrl);
    if (!navigationSafety.safe) {
      await restorePage(page, candidate, beforeUrl);
      continue;
    }

    const opened = await candidateOpenedState(page, candidate, beforeState);
    if (!opened) {
      await restorePage(page, candidate, beforeUrl);
      continue;
    }

    const stateSlug = uniqueStateSlug(stateSlugFor(candidate, viewport), usedSlugs);
    usedSlugs.add(stateSlug);
    const screenshotId = `${pageId}_${viewport.name}_${stateSlug}`;
    const filePath = path.join(folder, `${slug}_${viewport.name}_${stateSlug}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    const dimensions = await readPngDimensions(filePath, { width: viewport.width, height: viewport.height });

    const screenshot: ScreenshotRef = {
      id: screenshotId,
      viewport: viewport.name,
      kind: "state",
      state: stateSlug,
      path: path.relative(path.dirname(path.dirname(folder)), filePath),
      width: dimensions.width,
      height: dimensions.height
    };
    screenshots.push(screenshot);
    states.push({
      id: stableId("interaction_state", `${pageId}:${viewport.name}:${candidate.selector}:${stateSlug}`),
      viewport: viewport.name,
      category: candidate.category,
      label: candidate.label,
      triggerSelector: candidate.selector,
      triggerRole: candidate.role,
      triggerText: candidate.text,
      action: "click",
      state: stateSlug,
      screenshotId,
      beforeUrl,
      afterUrl,
      urlChanged: beforeUrl !== afterUrl,
      notes: [
        ...candidate.notes,
        ...(navigationSafety.hashOnly ? ["Click changed only the URL hash."] : [])
      ]
    });

    await restorePage(page, candidate, beforeUrl);
  }

  await resetScrollPosition(page);
  return { screenshots, states };
}

async function discoverCandidates(page: Page, config: AuditConfig, viewport: ViewportConfig): Promise<Candidate[]> {
  const rawCandidates = await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        [
          "button",
          "summary",
          "[role='button']",
          "[role='tab']",
          "[aria-haspopup]",
          "[aria-expanded]",
          "a[href^='#']",
          "details > summary"
        ].join(",")
      )
    );
    const seen = new Set<HTMLElement>();
    let counter = 0;
    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
    };
    const accessibleLabel = (element: HTMLElement) => {
      const labelledBy = element.getAttribute("aria-labelledby");
      const labelFromReference = labelledBy
        ?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean)
        .join(" ");
      return (
        element.getAttribute("aria-label")?.trim() ||
        labelFromReference ||
        element.getAttribute("title")?.trim() ||
        element.textContent?.replace(/\s+/g, " ").trim() ||
        element.getAttribute("href")?.trim() ||
        element.tagName.toLowerCase()
      );
    };

    return nodes.flatMap((element) => {
      if (seen.has(element) || !visible(element)) return [];
      seen.add(element);
      if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return [];
      const rect = element.getBoundingClientRect();
      const id = `wdr_interaction_${counter++}`;
      element.setAttribute("data-wdr-interaction-id", id);
      const anchor = element instanceof HTMLAnchorElement ? element : undefined;
      const button = element instanceof HTMLButtonElement ? element : undefined;
      return [
        {
          interactionId: id,
          selector: `[data-wdr-interaction-id="${id}"]`,
          label: accessibleLabel(element).slice(0, 120),
          text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 120),
          role: element.getAttribute("role") || element.tagName.toLowerCase(),
          tagName: element.tagName.toLowerCase(),
          href: anchor?.getAttribute("href") ?? undefined,
          target: anchor?.getAttribute("target") ?? undefined,
          type: button?.type ?? element.getAttribute("type") ?? undefined,
          ariaExpanded: element.getAttribute("aria-expanded") ?? undefined,
          ariaHaspopup: element.getAttribute("aria-haspopup") ?? undefined,
          ariaControls: element.getAttribute("aria-controls") ?? undefined,
          inForm: Boolean(element.closest("form")),
          top: rect.top,
          left: rect.left
        }
      ];
    });
  });

  const deduped = new Map<string, Candidate>();
  for (const raw of rawCandidates) {
    const candidate = classifyCandidate(raw, config, viewport);
    if (!candidate) continue;
    const dedupeKey = `${candidate.category}:${candidate.label.toLowerCase()}:${viewport.name}`;
    const previous = deduped.get(dedupeKey);
    if (!previous || previous.score < candidate.score) {
      deduped.set(dedupeKey, candidate);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .map((candidate) => candidate);
}

function classifyCandidate(
  raw: {
    interactionId: string;
    selector: string;
    label: string;
    text?: string;
    role?: string;
    tagName: string;
    href?: string;
    target?: string;
    type?: string;
    ariaExpanded?: string;
    ariaHaspopup?: string;
    ariaControls?: string;
    inForm?: boolean;
    top?: number;
  },
  config: AuditConfig,
  viewport: ViewportConfig
): Candidate | null {
  const label = normalizeLabel(raw.label);
  const searchText = `${label} ${raw.text ?? ""} ${raw.href ?? ""}`.trim();
  const notes: string[] = [];

  if (!label || label.length > 120) return null;
  if (raw.target && raw.target !== "_self") return null;
  if (raw.href && !raw.href.startsWith("#")) return null;
  if (raw.inForm) return null;
  if (/\b(buy|purchase|pay|payment|order|checkout|cart|log\s*in|login|sign\s*in|signin|account|admin|oauth|authorize)\b/i.test(searchText)) return null;
  if (dangerousActionPattern.test(searchText) && !safeStatePattern.test(searchText)) return null;

  let category: InteractionStateCategory = "other";
  let score = 0;
  const role = (raw.role ?? "").toLowerCase();
  const haspopup = (raw.ariaHaspopup ?? "").toLowerCase();
  const expanded = raw.ariaExpanded;

  if (role === "tab") {
    category = "tab";
    score += 70;
  } else if (haspopup === "dialog" || /\b(dialog|modal)\b/i.test(searchText)) {
    category = "dialog";
    score += 90;
  } else if (haspopup && haspopup !== "false") {
    category = haspopup === "menu" || /\b(menu|nav|navigation)\b/i.test(searchText) ? "menu" : "popover";
    score += 82;
  } else if (raw.tagName === "summary" || /\b(faq|question|details|expand|collapse)\b/i.test(searchText)) {
    category = raw.tagName === "summary" ? "accordion" : "disclosure";
    score += 76;
  } else if (expanded === "false" || expanded === "true") {
    category = /\b(menu|nav|navigation)\b/i.test(searchText) ? "navigation" : "disclosure";
    score += 74;
  } else if (/\b(menu|nav|navigation|hamburger)\b/i.test(searchText)) {
    category = viewport.name === "mobile" ? "navigation" : "menu";
    score += 72;
  } else if (/\b(filter|sort|category)\b/i.test(searchText)) {
    category = "filter";
    score += 64;
  } else if (/\b(next|previous|prev|slide|carousel|gallery)\b/i.test(searchText)) {
    category = "carousel";
    score += 58;
  } else if (!safeStatePattern.test(searchText)) {
    return null;
  } else {
    category = "disclosure";
    score += 48;
  }

  if (viewport.name === "mobile" && (category === "navigation" || category === "menu")) score += 20;
  if (raw.ariaControls) score += 8;
  if (expanded === "false") score += 8;
  if ((raw.top ?? 0) >= 0) score += Math.max(0, 10 - Math.round((raw.top ?? 0) / 200));

  return {
    interactionId: raw.interactionId,
    selector: raw.selector,
    label,
    text: raw.text,
    role: raw.role,
    tagName: raw.tagName,
    href: raw.href,
    target: raw.target,
    type: raw.type,
    ariaExpanded: raw.ariaExpanded,
    ariaHaspopup: raw.ariaHaspopup,
    ariaControls: raw.ariaControls,
    category,
    score,
    notes
  };
}

async function activateCandidate(page: Page, candidate: Candidate): Promise<boolean> {
  return page
    .evaluate((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return false;
      element.scrollIntoView({ block: "center", inline: "center" });
      element.click();
      return true;
    }, candidate.selector)
    .catch(() => false);
}

async function readCandidateState(page: Page, candidate: Candidate): Promise<CandidateStateSnapshot> {
  return page
    .evaluate((candidateInfo) => {
      const element = document.querySelector<HTMLElement>(candidateInfo.selector);
      const isVisible = (node: Element | null) => {
        if (!(node instanceof HTMLElement)) return false;
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return rect.width > 1 && rect.height > 1 && style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
      };
      const controlled = candidateInfo.ariaControls ? document.getElementById(candidateInfo.ariaControls) : null;
      return {
        ariaExpanded: element?.getAttribute("aria-expanded"),
        ariaSelected: element?.getAttribute("aria-selected"),
        detailsOpen: Boolean(element?.closest("details")?.hasAttribute("open")),
        controlledVisible: isVisible(controlled),
        dialogCount: document.querySelectorAll("dialog[open], [role='dialog'], [aria-modal='true']").length,
        menuCount: document.querySelectorAll("[role='menu'], [role='listbox'], [role='tabpanel']").length,
        popoverOpenCount: document.querySelectorAll("[popover]").length
      };
    }, candidate)
    .catch(() => ({
      detailsOpen: false,
      controlledVisible: false,
      dialogCount: 0,
      menuCount: 0,
      popoverOpenCount: 0
    }));
}

async function candidateOpenedState(page: Page, candidate: Candidate, beforeState: CandidateStateSnapshot): Promise<boolean> {
  return page.evaluate((payload) => {
    const candidateInfo = payload.candidate;
    const before = payload.beforeState;
    const element = document.querySelector<HTMLElement>(candidateInfo.selector);
    const isVisible = (node: Element | null) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 1 && rect.height > 1 && style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
    };
    const controlled = candidateInfo.ariaControls ? document.getElementById(candidateInfo.ariaControls) : null;
    const after = {
      ariaExpanded: element?.getAttribute("aria-expanded"),
      ariaSelected: element?.getAttribute("aria-selected"),
      detailsOpen: Boolean(element?.closest("details")?.hasAttribute("open")),
      controlledVisible: isVisible(controlled),
      dialogCount: document.querySelectorAll("dialog[open], [role='dialog'], [aria-modal='true']").length,
      menuCount: document.querySelectorAll("[role='menu'], [role='listbox'], [role='tabpanel']").length
    };
    if (after.ariaExpanded === "true" && before.ariaExpanded !== "true") return true;
    if (after.ariaSelected === "true" && before.ariaSelected !== "true") return true;
    if (after.detailsOpen && !before.detailsOpen) return true;
    if (after.controlledVisible && !before.controlledVisible) return true;
    if (after.dialogCount > before.dialogCount) return true;
    if (after.menuCount > before.menuCount) return true;
    return false;
  }, { candidate, beforeState });
}

async function restorePage(page: Page, candidate: Candidate, beforeUrl: string): Promise<void> {
  const currentUrl = page.url();
  if (!safeUrlTransition(beforeUrl, currentUrl).safe) {
    await page.goto(beforeUrl, { waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => undefined);
    await waitForStateSettle(page);
    return;
  }

  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(100).catch(() => undefined);
  await page
    .evaluate((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return;
      if (element.getAttribute("aria-expanded") === "true" || element.closest("details")?.hasAttribute("open")) {
        element.click();
      }
    }, candidate.selector)
    .catch(() => undefined);

  if (currentUrl !== beforeUrl) {
    await page.goto(beforeUrl, { waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => undefined);
    await waitForStateSettle(page);
  }
  await resetScrollPosition(page).catch(() => undefined);
}

async function waitForStateSettle(page: Page): Promise<void> {
  await page.waitForTimeout(220).catch(() => undefined);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 800 }).catch(() => undefined);
}

function safeUrlTransition(beforeUrl: string, afterUrl: string): { safe: boolean; hashOnly: boolean } {
  try {
    const before = new URL(beforeUrl);
    const after = new URL(afterUrl);
    const sameDocument = before.origin === after.origin && before.pathname === after.pathname && before.search === after.search;
    return { safe: sameDocument, hashOnly: sameDocument && before.hash !== after.hash };
  } catch {
    return { safe: beforeUrl === afterUrl, hashOnly: false };
  }
}

function stateSlugFor(candidate: Candidate, viewport: ViewportConfig): string {
  if (viewport.name === "mobile" && (candidate.category === "navigation" || candidate.category === "menu")) {
    return "mobile_nav_open";
  }
  const label = candidate.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);
  return `${candidate.category}_${label || candidate.interactionId}`;
}

function uniqueStateSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function readPngDimensions(filePath: string, fallback: { width: number; height: number }): Promise<{ width: number; height: number }> {
  try {
    const png = PNG.sync.read(await readFile(filePath));
    return { width: png.width, height: png.height };
  } catch {
    return fallback;
  }
}
