import * as path from "node:path";
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
      Object.values(page.screenshots).map((screenshot) => ({
        id: screenshot.id,
        pageId: page.pageId,
        url: page.url,
        viewport: screenshot.viewport,
        kind: screenshot.kind,
        path: screenshot.path,
        width: screenshot.width,
        height: screenshot.height,
        absolutePath: path.join(paths.auditRoot, screenshot.path)
      }))
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
  await writeJson(path.join(paths.report, "screenshot-manifest.json"), manifest);
  return manifest;
}
