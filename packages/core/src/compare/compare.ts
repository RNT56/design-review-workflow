import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { AuditCompareResult, AuditCompareResultSchema, AuditReport, Finding, ScreenshotRef } from "../schemas/audit.js";
import { readReportFromAuditDir } from "../storage/index.js";
import { findingFingerprint } from "../utils/id.js";
import { writeJson } from "../utils/fs.js";

export type CompareAuditOptions = {
  allowIncompatible?: boolean;
};

export async function compareAuditDirs(
  beforeAuditDir: string,
  afterAuditDir: string,
  options: CompareAuditOptions = {}
): Promise<{ result: AuditCompareResult; outputPath: string }> {
  const before = await readReportFromAuditDir(beforeAuditDir);
  const after = await readReportFromAuditDir(afterAuditDir);
  const compatibility = compareCompatibility(before, after);
  if (compatibility.status === "incompatible" && !options.allowIncompatible) {
    throw new Error(`Audits are not comparable: ${compatibility.reasons.join("; ")}. Use --allow-incompatible only for exploratory output.`);
  }

  const beforeByFingerprint = new Map(before.findings.map((finding) => [fingerprint(finding), finding]));
  const afterByFingerprint = new Map(after.findings.map((finding) => [fingerprint(finding), finding]));
  const result = AuditCompareResultSchema.parse({
    schemaVersion: "design-review-workflow.compare.v2",
    generatedAt: new Date().toISOString(),
    beforeAuditId: before.auditId,
    afterAuditId: after.auditId,
    beforeUrl: before.config.url,
    afterUrl: after.config.url,
    compatibility,
    scoreDelta: after.scorecard.overallScore - before.scorecard.overallScore,
    subscoreDeltas: compareSubscores(before, after),
    resolvedFindings: before.findings.filter((finding) => !afterByFingerprint.has(fingerprint(finding))),
    newFindings: after.findings.filter((finding) => !beforeByFingerprint.has(fingerprint(finding))),
    persistentFindings: after.findings.filter((finding) => beforeByFingerprint.has(fingerprint(finding))),
    screenshotDiffs: compatibility.screenshotComparable
      ? await compareScreenshots(beforeAuditDir, afterAuditDir, before, after)
      : []
  });

  const outputDir = path.join(afterAuditDir, "comparison");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `compare-${before.auditId}.json`);
  await writeJson(outputPath, result);
  return { result, outputPath };
}

function compareCompatibility(before: AuditReport, after: AuditReport): AuditCompareResult["compatibility"] {
  const reasons: string[] = [];
  const beforeTarget = canonicalTarget(before.config.url);
  const afterTarget = canonicalTarget(after.config.url);
  const targetMatches = beforeTarget === afterTarget;
  if (!targetMatches) reasons.push(`target differs (${beforeTarget} vs ${afterTarget})`);

  const beforeRubricVersion = before.scorecard.rubricVersion ?? "design-review-workflow.scoring.v1-legacy";
  const afterRubricVersion = after.scorecard.rubricVersion ?? "design-review-workflow.scoring.v1-legacy";
  const rubricMatches = beforeRubricVersion === afterRubricVersion;
  if (!rubricMatches) reasons.push(`scoring rubric differs (${beforeRubricVersion} vs ${afterRubricVersion})`);

  const scopeMatches = before.config.mode === after.config.mode && before.config.maxPages === after.config.maxPages;
  if (!scopeMatches) reasons.push(`audit scope differs (${before.config.mode}/${before.config.maxPages} vs ${after.config.mode}/${after.config.maxPages})`);

  const beforeViewports = viewportSignature(before);
  const afterViewports = viewportSignature(after);
  const viewportsMatch = beforeViewports === afterViewports;
  if (!viewportsMatch) reasons.push("viewport configuration differs");

  const beforeCapture = JSON.stringify(before.config.capture);
  const afterCapture = JSON.stringify(after.config.capture);
  const captureMatches = beforeCapture === afterCapture;
  if (!captureMatches) reasons.push("capture configuration differs");

  const findingComparable = targetMatches && scopeMatches;
  const scoreComparable = findingComparable && rubricMatches;
  const screenshotComparable = targetMatches && viewportsMatch && captureMatches;
  return {
    status: reasons.length === 0 ? "compatible" : "incompatible",
    scoreComparable,
    findingComparable,
    screenshotComparable,
    reasons,
    beforeRubricVersion,
    afterRubricVersion
  };
}

function viewportSignature(report: AuditReport): string {
  return JSON.stringify(
    report.config.viewports.map(({ name, width, height, deviceScaleFactor, isMobile }) => ({ name, width, height, deviceScaleFactor, isMobile }))
  );
}

function canonicalTarget(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
  url.searchParams.sort();
  return url.toString();
}

function fingerprint(finding: Finding): string {
  return finding.fingerprint ?? findingFingerprint(finding);
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
    const beforePage = before.pages.find((page) => page.normalizedUrl === afterPage.normalizedUrl);
    if (!beforePage) continue;

    const afterShots = Object.values(afterPage.screenshots).filter((shot) => shot.kind === "above_fold" || shot.kind === "full_page");
    for (const afterShot of afterShots) {
      const beforeShot = pickComparableScreenshot(beforePage.screenshots, afterShot);
      if (!beforeShot) continue;
      const beforePath = path.join(beforeAuditDir, beforeShot.path);
      const afterPath = path.join(afterAuditDir, afterShot.path);
      const diffPath = path.join(outputDir, `${afterPage.pageId}_${afterShot.viewport}_${afterShot.kind}.png`);
      diffs.push(await comparePng(beforePath, afterPath, diffPath));
    }
  }

  return diffs;
}

function pickComparableScreenshot(screenshots: Record<string, ScreenshotRef>, target: ScreenshotRef): ScreenshotRef | undefined {
  return Object.values(screenshots).find(
    (screenshot) => screenshot.viewport === target.viewport && screenshot.kind === target.kind
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
