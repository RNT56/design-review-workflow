import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { PNG } from "pngjs";
import { AuditReport } from "../schemas/audit.js";
import { AuditPaths } from "../storage/project.js";
import { writeJson } from "../utils/fs.js";

export type ScreenshotManifestEntry = {
  id: string;
  pageId: string;
  url: string;
  viewport: string;
  kind: string;
  path: string;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  aspectRatio: number;
  displayRole: "first_viewport" | "full_page_flow" | "state_capture" | "annotated" | "raw";
  state?: string;
  interactionState?: {
    id: string;
    category: string;
    label: string;
  };
  pageTitle?: string;
  pageType: string;
  groups: string[];
  sheetRefs: string[];
  absolutePath: string;
};

export type ScreenshotManifest = {
  schemaVersion: "design-review-workflow.screenshot-manifest.v1";
  auditId: string;
  generatedAt: string;
  screenshots: ScreenshotManifestEntry[];
  pages: Array<{
    pageId: string;
    url: string;
    title?: string;
    pageType: string;
    screenshotIds: string[];
  }>;
  annotations: Array<{
    id: string;
    findingId: string;
    pageId: string;
    sourceScreenshotId: string;
    path: string;
    absolutePath: string;
  }>;
};

export function buildScreenshotManifest(report: AuditReport, paths: AuditPaths): ScreenshotManifest {
  return {
    schemaVersion: "design-review-workflow.screenshot-manifest.v1",
    auditId: report.auditId,
    generatedAt: new Date().toISOString(),
    screenshots: report.pages.flatMap((page) =>
      Object.values(page.screenshots).map((screenshot) => {
        const interactionState = page.interactionStates.find((state) => state.screenshotId === screenshot.id);
        return {
          id: screenshot.id,
          pageId: page.pageId,
          url: page.url,
          viewport: screenshot.viewport,
          kind: screenshot.kind,
          state: screenshot.state,
          interactionState: interactionState
            ? {
                id: interactionState.id,
                category: interactionState.category,
                label: interactionState.label
              }
            : undefined,
          path: screenshot.path,
          width: screenshot.width,
          height: screenshot.height,
          pixelWidth: screenshot.width,
          pixelHeight: screenshot.height,
          aspectRatio: screenshot.width / Math.max(1, screenshot.height),
          displayRole: displayRoleFor(screenshot.kind),
          pageTitle: page.title,
          pageType: page.pageType,
          groups: groupsFor(page.pageId, screenshot.viewport, screenshot.kind, screenshot.state, interactionState?.category),
          sheetRefs: [],
          absolutePath: path.join(paths.auditRoot, screenshot.path)
        };
      })
    ),
    pages: report.pages.map((page) => ({
      pageId: page.pageId,
      url: page.url,
      title: page.title,
      pageType: page.pageType,
      screenshotIds: Object.keys(page.screenshots)
    })),
    annotations: report.screenshotAnnotations.map((annotation) => ({
      id: annotation.annotatedScreenshot.id,
      findingId: annotation.findingId,
      pageId: annotation.pageId,
      sourceScreenshotId: annotation.sourceScreenshotId,
      path: annotation.annotatedScreenshot.path,
      absolutePath: path.join(paths.auditRoot, annotation.annotatedScreenshot.path)
    }))
  };
}

export async function writeScreenshotManifest(report: AuditReport, paths: AuditPaths): Promise<ScreenshotManifest> {
  const manifest = buildScreenshotManifest(report, paths);
  await enrichManifestDimensions(manifest);
  await writeJson(path.join(paths.report, "screenshot-manifest.json"), manifest);
  return manifest;
}

async function enrichManifestDimensions(manifest: ScreenshotManifest): Promise<void> {
  await Promise.all(
    manifest.screenshots.map(async (screenshot) => {
      const dimensions = await readPngDimensions(screenshot.absolutePath, { width: screenshot.width, height: screenshot.height });
      screenshot.pixelWidth = dimensions.width;
      screenshot.pixelHeight = dimensions.height;
      screenshot.width = dimensions.width;
      screenshot.height = dimensions.height;
      screenshot.aspectRatio = dimensions.width / Math.max(1, dimensions.height);
    })
  );
}

async function readPngDimensions(filePath: string, fallback: { width: number; height: number }): Promise<{ width: number; height: number }> {
  try {
    const png = PNG.sync.read(await readFile(filePath));
    return { width: png.width, height: png.height };
  } catch {
    return fallback;
  }
}

function displayRoleFor(kind: string): ScreenshotManifestEntry["displayRole"] {
  if (kind === "above_fold") return "first_viewport";
  if (kind === "full_page") return "full_page_flow";
  if (kind === "state") return "state_capture";
  if (kind === "annotated") return "annotated";
  return "raw";
}

function groupsFor(pageId: string, viewport: string, kind: string, state?: string, interactionCategory?: string): string[] {
  return [
    `page:${pageId}`,
    `viewport:${viewport}`,
    `kind:${kind}`,
    displayRoleFor(kind),
    ...(state ? [`state:${state}`] : []),
    ...(interactionCategory ? [`interaction:${interactionCategory}`] : [])
  ];
}
