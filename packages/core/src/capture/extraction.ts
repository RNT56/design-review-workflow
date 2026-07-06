import type { Page } from "playwright";
import {
  ComponentEvidence,
  CssSignals,
  FormSummary,
  SectionEvidence,
  TextNode,
  ViewportName
} from "../schemas/audit.js";
import { stableId } from "../utils/id.js";

export type ExtractedPage = {
  title?: string;
  language?: string;
  headings: TextNode[];
  buttons: TextNode[];
  links: TextNode[];
  forms: FormSummary[];
  imagesMissingAlt: number;
  imageCount: number;
  visibleTextSample: string;
  sections: SectionEvidence[];
  components: ComponentEvidence[];
  navigation: TextNode[];
  footerText?: string;
  cssSignals: CssSignals;
};

export async function extractPage(page: Page, viewport: ViewportName): Promise<ExtractedPage> {
  const raw = await page.evaluate(() => {
    const isVisible = (element: Element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };

    const selectorFor = (element: Element) => {
      const tag = element.tagName.toLowerCase();
      const id = element.id ? `#${CSS.escape(element.id)}` : "";
      const className = [...element.classList].slice(0, 2).map((part) => `.${CSS.escape(part)}`).join("");
      return `${tag}${id}${className}`;
    };

    const textNode = (element: Element) => ({
      text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 220),
      tag: element.tagName.toLowerCase(),
      selector: selectorFor(element),
      href: element instanceof HTMLAnchorElement ? element.href : undefined,
      visible: isVisible(element)
    });

    const headings = [...document.querySelectorAll("h1,h2,h3,h4")].filter(isVisible).map(textNode).filter((node) => node.text);
    const buttons = [...document.querySelectorAll("button,a[role='button'],input[type='button'],input[type='submit']")]
      .filter(isVisible)
      .map((element) => {
        const input = element as HTMLInputElement;
        const node = textNode(element);
        node.text = node.text || input.value || element.getAttribute("aria-label") || "";
        return node;
      })
      .filter((node) => node.text);
    const links = [...document.querySelectorAll("a[href]")].filter(isVisible).map(textNode).filter((node) => node.text);

    const forms = [...document.querySelectorAll("form")].filter(isVisible).map((form, index) => {
      const inputs = [...form.querySelectorAll("input,textarea,select")].filter(isVisible);
      const labels = [...form.querySelectorAll("label")].map((label) => label.textContent?.replace(/\s+/g, " ").trim() ?? "").filter(Boolean);
      const missingLabelCount = inputs.filter((input) => {
        const id = input.getAttribute("id");
        const aria = input.getAttribute("aria-label") || input.getAttribute("aria-labelledby");
        const placeholder = input.getAttribute("placeholder");
        const hasExplicit = id ? Boolean(form.querySelector(`label[for="${CSS.escape(id)}"]`)) : false;
        const hasWrapped = Boolean(input.closest("label"));
        return !aria && !placeholder && !hasExplicit && !hasWrapped;
      }).length;
      const submit = form.querySelector("button[type='submit'],input[type='submit'],button:not([type])");
      return {
        selector: selectorFor(form) || `form:nth-of-type(${index + 1})`,
        inputCount: inputs.length,
        missingLabelCount,
        submitText: submit?.textContent?.replace(/\s+/g, " ").trim() || (submit as HTMLInputElement | null)?.value || undefined,
        labels
      };
    });

    const images = [...document.querySelectorAll("img")].filter(isVisible);
    const imageCount = images.length;
    const imagesMissingAlt = images.filter((image) => !image.getAttribute("alt")?.trim()).length;

    const sectionElements = [
      ...document.querySelectorAll("header,nav,main,section,article,aside,footer,[role='banner'],[role='navigation'],[role='main'],[role='contentinfo']")
    ].filter(isVisible);
    const sections = sectionElements.slice(0, 40).map((element, index) => {
      const rect = element.getBoundingClientRect();
      const label =
        element.getAttribute("aria-label") ||
        element.getAttribute("role") ||
        element.tagName.toLowerCase() ||
        `section_${index + 1}`;
      return {
        id: `section_${index + 1}`,
        label,
        selector: selectorFor(element),
        textSample: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
        box: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      };
    });

    const componentElements = [...document.querySelectorAll("button,a,input,select,textarea,[role='button'],[role='tab'],[role='dialog'],details,summary")]
      .filter(isVisible)
      .slice(0, 120);
    const components = componentElements.map((element, index) => {
      const rect = element.getBoundingClientRect();
      const tag = element.tagName.toLowerCase();
      const role = element.getAttribute("role");
      return {
        id: `component_${index + 1}`,
        type: role || tag,
        label: (element.textContent ?? element.getAttribute("aria-label") ?? element.getAttribute("placeholder") ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
        selector: selectorFor(element),
        box: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      };
    });

    const navigation = [...document.querySelectorAll("nav a, header a, [role='navigation'] a")].filter(isVisible).map(textNode).filter((node) => node.text);
    const footerText = document.querySelector("footer,[role='contentinfo']")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 500);
    const visibleTextSample = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 4000);

    const cssElements = [...document.querySelectorAll("body *")].filter(isVisible).slice(0, 260);
    const cssSamples = cssElements.map((element) => {
      const style = window.getComputedStyle(element);
      return {
        selector: selectorFor(element),
        color: style.color,
        backgroundColor: effectiveBackground(element),
        fontFamily: style.fontFamily,
        fontSize: parseFloat(style.fontSize) || 0,
        lineHeight: parseFloat(style.lineHeight) || 0,
        borderRadius: parseFloat(style.borderRadius) || 0,
        textSample: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 90)
      };
    });

    function effectiveBackground(element: Element): string {
      let cursor: Element | null = element;
      while (cursor) {
        const background = window.getComputedStyle(cursor).backgroundColor;
        if (background && !background.endsWith(", 0)") && background !== "transparent" && background !== "rgba(0, 0, 0, 0)") {
          return background;
        }
        cursor = cursor.parentElement;
      }
      return "rgb(255, 255, 255)";
    }

    return {
      title: document.title || undefined,
      language: document.documentElement.lang || undefined,
      headings,
      buttons,
      links,
      forms,
      imagesMissingAlt,
      imageCount,
      visibleTextSample,
      sections,
      components,
      navigation,
      footerText,
      cssSamples
    };
  });

  const cssSignals = buildCssSignals(raw.cssSamples);

  return {
    title: raw.title,
    language: raw.language,
    headings: raw.headings,
    buttons: raw.buttons,
    links: raw.links.slice(0, 120),
    forms: raw.forms,
    imagesMissingAlt: raw.imagesMissingAlt,
    imageCount: raw.imageCount,
    visibleTextSample: raw.visibleTextSample,
    sections: raw.sections.map((section, index) => ({
      ...section,
      id: stableId("section", section.selector, index + 1),
      viewport
    })),
    components: raw.components.map((component, index) => ({
      ...component,
      id: stableId("component", `${component.type}:${component.label}:${component.selector}`, index + 1),
      viewport
    })),
    navigation: raw.navigation.slice(0, 80),
    footerText: raw.footerText,
    cssSignals
  };
}

function buildCssSignals(
  samples: Array<{
    selector: string;
    color: string;
    backgroundColor: string;
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    borderRadius: number;
    textSample: string;
  }>
): CssSignals {
  const unique = <T>(items: T[]) => [...new Set(items)].slice(0, 40);
  const contrastPairs = samples
    .filter((sample) => sample.textSample.length > 2)
    .map((sample) => ({
      foreground: sample.color,
      background: sample.backgroundColor,
      ratio: contrastRatio(sample.color, sample.backgroundColor),
      selector: sample.selector,
      textSample: sample.textSample
    }))
    .filter((pair) => Number.isFinite(pair.ratio))
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 40);

  return {
    colors: unique(samples.map((sample) => sample.color).filter(Boolean)),
    backgroundColors: unique(samples.map((sample) => sample.backgroundColor).filter(Boolean)),
    fonts: unique(samples.map((sample) => sample.fontFamily).filter(Boolean)),
    fontSizes: unique(samples.map((sample) => Math.round(sample.fontSize)).filter(Boolean)).sort((a, b) => a - b),
    lineHeights: unique(samples.map((sample) => Math.round(sample.lineHeight)).filter(Boolean)).sort((a, b) => a - b),
    borderRadii: unique(samples.map((sample) => Math.round(sample.borderRadius)).filter((value) => value >= 0)).sort((a, b) => a - b),
    contrastPairs
  };
}

function contrastRatio(foreground: string, background: string): number {
  const fg = parseRgb(foreground);
  const bg = parseRgb(background);
  if (!fg || !bg) {
    return Number.NaN;
  }
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

function parseRgb(value: string): [number, number, number] | null {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function luminance([r, g, b]: [number, number, number]): number {
  const convert = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
}
