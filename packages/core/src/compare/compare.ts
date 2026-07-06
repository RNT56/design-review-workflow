import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { AuditCompareResult, AuditCompareResultSchema, AuditReport, ScreenshotRef } from "../schemas/audit.js";
import { readReportFromAuditDir } from "../storage/index.js";
import { writeJson } from "../utils/fs.js";

export async function compareAuditDirs(beforeAuditDir: string, afterAuditDir: string): Promise<{ result: AuditCompareResult; outputPath: string }> {
  const before = await readReportFromAuditDir(beforeAuditDir);
  const after = await readReportFromAuditDir(afterAuditDir);
  const result = AuditCompareResultSchema.parse({
    generatedAt: new Date().toISOString(),
    beforeAuditId: before.auditId,
    afterAuditId: after.auditId,
    beforeUrl: before.config.url,
    afterUrl: after.config.url,
    scoreDelta: after.scorecard.overallScore - before.scorecard.overallScore,
    subscoreDeltas: compareSubscores(before, after),
    resolvedFindings: before.findings.filter((finding) => !after.findings.some((candidate) => candidate.title === finding.title)),
    newFindings: after.findings.filter((finding) => !before.findings.some((candidate) => candidate.title === finding.title)),
    persistentFindings: after.findings.filter((finding) => before.findings.some((candidate) => candidate.title === finding.title)),
    screenshotDiffs: await compareScreenshots(beforeAuditDir, afterAuditDir, before, after)
  });

  const outputDir = path.join(afterAuditDir, "comparison");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `compare-${before.auditId}.json`);
  await writeJson(outputPath, result);
  return { result, outputPath };
}

function compareSubscores(before: AuditReport, after: AuditReport): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const key of Object.keys(after.scorecard.subscores)) {
    const beforeScore = before.scorecard.subscores[key as keyof typeof before.scorecard.subscores]?.score ?? 0;
    const afterScore = after.scorecard.subscores[key as keyof typeof after.scorecard.subscores]?.score ?? 0;
    deltas[key] = afterScore - beforeScore;
  }
  return deltas;
}

async function compareScreenshots(beforeAuditDir: string, afterAuditDir: string, before: AuditReport, after: AuditReport): Promise<AuditCompareResult["screenshotDiffs"]> {
  const diffs: AuditCompareResult["screenshotDiffs"] = [];
  const outputDir = path.join(afterAuditDir, "screenshots", "diffs");
  await mkdir(outputDir, { recursive: true });

  for (const afterPage of after.pages) {
    const beforePage = before.pages.find((page) => page.normalizedUrl === afterPage.normalizedUrl || page.pageType === afterPage.pageType);
    if (!beforePage) {
      continue;
    }
    const beforeShot = pickComparableScreenshot(beforePage.screenshots);
    const afterShot = pickComparableScreenshot(afterPage.screenshots);
    if (!beforeShot || !afterShot) {
      continue;
    }
    const beforePath = path.join(beforeAuditDir, beforeShot.path);
    const afterPath = path.join(afterAuditDir, afterShot.path);
    const diffPath = path.join(outputDir, `${afterPage.pageId}_${afterShot.viewport}_${afterShot.kind}.png`);
    diffs.push(await comparePng(beforePath, afterPath, diffPath));
  }

  return diffs;
}

function pickComparableScreenshot(screenshots: Record<string, ScreenshotRef>): ScreenshotRef | undefined {
  return (
    Object.values(screenshots).find((screenshot) => screenshot.viewport === "desktop" && screenshot.kind === "above_fold") ??
    Object.values(screenshots).find((screenshot) => screenshot.kind === "above_fold")
  );
}

async function comparePng(beforePath: string, afterPath: string, diffPath: string): Promise<AuditCompareResult["screenshotDiffs"][number]> {
  try {
    const before = PNG.sync.read(await readFile(beforePath));
    const after = PNG.sync.read(await readFile(afterPath));
    if (before.width !== after.width || before.height !== after.height) {
      return {
        beforeScreenshot: beforePath,
        afterScreenshot: afterPath,
        comparedPixels: 0,
        changedPixels: 0,
        changedRatio: 0,
        status: "skipped",
        reason: `Screenshot dimensions differ: ${before.width}x${before.height} vs ${after.width}x${after.height}`
      };
    }
    const diff = new PNG({ width: before.width, height: before.height });
    const changedPixels = pixelmatch(before.data, after.data, diff.data, before.width, before.height, { threshold: 0.12 });
    await writeFile(diffPath, PNG.sync.write(diff));
    const comparedPixels = before.width * before.height;
    return {
      beforeScreenshot: beforePath,
      afterScreenshot: afterPath,
      diffPath,
      comparedPixels,
      changedPixels,
      changedRatio: Number((changedPixels / comparedPixels).toFixed(4)),
      status: "completed"
    };
  } catch (error) {
    return {
      beforeScreenshot: beforePath,
      afterScreenshot: afterPath,
      comparedPixels: 0,
      changedPixels: 0,
      changedRatio: 0,
      status: "failed",
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}
