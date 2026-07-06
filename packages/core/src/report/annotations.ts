import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { PNG } from "pngjs";
import { AuditConfig, Finding, PageEvidence, ScreenshotAnnotation } from "../schemas/audit.js";
import { AuditPaths } from "../storage/project.js";
import { ensureDir, writeJson } from "../utils/fs.js";
import { stableId } from "../utils/id.js";

export async function createScreenshotAnnotations(
  config: AuditConfig,
  paths: AuditPaths,
  findings: Finding[],
  pages: PageEvidence[]
): Promise<ScreenshotAnnotation[]> {
  if (config.outputs.screenshotAnnotations === "none") {
    return [];
  }

  const pageById = new Map(pages.map((page) => [page.pageId, page]));
  const annotations: ScreenshotAnnotation[] = [];
  await ensureDir(paths.screenshotsAnnotated);

  for (const finding of findings.slice(0, 20)) {
    const page = pageById.get(finding.evidence.pageId);
    if (!page) {
      continue;
    }
    const sourceScreenshotId =
      finding.evidence.screenshotRefs.find((ref) => page.screenshots[ref]?.kind === "above_fold") ??
      finding.evidence.screenshotRefs.find((ref) => page.screenshots[ref]) ??
      Object.values(page.screenshots).find((screenshot) => screenshot.kind === "above_fold")?.id;

    if (!sourceScreenshotId) {
      continue;
    }
    const source = page.screenshots[sourceScreenshotId];
    const sourcePath = path.join(paths.auditRoot, source.path);
    const marker = markerForFinding(finding, page, source.width, source.height);
    const annotationId = stableId("annotation", `${finding.findingId}:${sourceScreenshotId}`);
    const outputFileName = `${annotationId}.png`;
    const outputPath = path.join(paths.screenshotsAnnotated, outputFileName);

    try {
      await drawAnnotation(sourcePath, outputPath, marker, finding.title);
    } catch {
      continue;
    }

    annotations.push({
      annotationId,
      findingId: finding.findingId,
      pageId: page.pageId,
      sourceScreenshotId,
      label: finding.title,
      marker,
      annotatedScreenshot: {
        id: `${annotationId}_screenshot`,
        viewport: source.viewport,
        kind: "annotated",
        path: path.relative(paths.auditRoot, outputPath),
        width: source.width,
        height: source.height,
        state: "finding_annotation"
      }
    });
  }

  await writeJson(path.join(paths.synthesis, "screenshot-annotations.json"), annotations);
  return annotations;
}

function markerForFinding(finding: Finding, page: PageEvidence, width: number, height: number) {
  const sectionText = (finding.evidence.section ?? "").toLowerCase();
  const section =
    page.structure.sections.find((item) => item.label.toLowerCase().includes(sectionText) || item.textSample.toLowerCase().includes(sectionText)) ??
    page.structure.sections.find((item) => /hero|header|main|section/i.test(item.label)) ??
    page.structure.sections[0];

  if (section?.box) {
    const y = Math.max(0, Math.min(section.box.y, height - 80));
    return {
      x: Math.max(12, Math.min(section.box.x, width - 120)),
      y,
      width: Math.max(120, Math.min(section.box.width || width - 24, width - 24)),
      height: Math.max(64, Math.min(section.box.height || 140, height - y - 12))
    };
  }

  return {
    x: 32,
    y: finding.evidence.section?.includes("navigation") ? 24 : 120,
    width: Math.max(120, width - 64),
    height: finding.evidence.section?.includes("navigation") ? 120 : 220
  };
}

async function drawAnnotation(sourcePath: string, outputPath: string, marker: { x: number; y: number; width: number; height: number }, label: string) {
  const png = PNG.sync.read(await readFile(sourcePath));
  const color = { r: 180, g: 35, b: 24, a: 255 };
  const thickness = 5;
  const x0 = Math.round(marker.x);
  const y0 = Math.round(marker.y);
  const x1 = Math.round(Math.min(marker.x + marker.width, png.width - 1));
  const y1 = Math.round(Math.min(marker.y + marker.height, png.height - 1));

  for (let t = 0; t < thickness; t += 1) {
    drawLine(png, x0, y0 + t, x1, y0 + t, color);
    drawLine(png, x0, y1 - t, x1, y1 - t, color);
    drawLine(png, x0 + t, y0, x0 + t, y1, color);
    drawLine(png, x1 - t, y0, x1 - t, y1, color);
  }

  drawLabelBlock(png, x0, Math.max(0, y0 - 34), label.slice(0, 36), color);
  await writeFile(outputPath, PNG.sync.write(png));
}

function drawLine(png: PNG, x0: number, y0: number, x1: number, y1: number, color: { r: number; g: number; b: number; a: number }) {
  const horizontal = y0 === y1;
  const start = horizontal ? Math.max(0, Math.min(x0, x1)) : Math.max(0, Math.min(y0, y1));
  const end = horizontal ? Math.min(png.width - 1, Math.max(x0, x1)) : Math.min(png.height - 1, Math.max(y0, y1));
  for (let position = start; position <= end; position += 1) {
    setPixel(png, horizontal ? position : x0, horizontal ? y0 : position, color);
  }
}

function drawLabelBlock(png: PNG, x: number, y: number, label: string, color: { r: number; g: number; b: number; a: number }) {
  const blockWidth = Math.min(png.width - x - 1, Math.max(160, label.length * 8));
  const blockHeight = 28;
  for (let yy = y; yy < y + blockHeight && yy < png.height; yy += 1) {
    for (let xx = x; xx < x + blockWidth && xx < png.width; xx += 1) {
      setPixel(png, xx, yy, color);
    }
  }
  // Minimal non-text glyph stripe keeps the label area visible without bundling font rendering.
  for (let xx = x + 8; xx < x + blockWidth - 8 && xx < png.width; xx += 9) {
    for (let yy = y + 8; yy < y + 20 && yy < png.height; yy += 1) {
      setPixel(png, xx, yy, { r: 255, g: 255, b: 255, a: 255 });
    }
  }
}

function setPixel(png: PNG, x: number, y: number, color: { r: number; g: number; b: number; a: number }) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
    return;
  }
  const index = (Math.round(y) * png.width + Math.round(x)) * 4;
  png.data[index] = color.r;
  png.data[index + 1] = color.g;
  png.data[index + 2] = color.b;
  png.data[index + 3] = color.a;
}
