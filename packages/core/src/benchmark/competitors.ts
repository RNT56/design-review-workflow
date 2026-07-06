import * as path from "node:path";
import { captureEvidence } from "../capture/capture.js";
import { AuditConfig, CompetitorBenchmark, ProgressEvent } from "../schemas/audit.js";
import { createNestedAuditPaths, type AuditPaths } from "../storage/project.js";
import { writeJson } from "../utils/fs.js";
import { siteSlug } from "../utils/url.js";
import { reviewEvidence } from "../review/findings.js";

export async function runCompetitorBenchmarks(
  config: AuditConfig,
  mainScore: number,
  paths: AuditPaths,
  onProgress?: (event: ProgressEvent) => void
): Promise<CompetitorBenchmark[]> {
  const competitors = config.competitors.slice(0, 3);
  const results: CompetitorBenchmark[] = [];

  for (let index = 0; index < competitors.length; index += 1) {
    const competitorUrl = competitors[index];
    onProgress?.({
      stage: "competitors",
      message: `Benchmarking competitor ${competitorUrl}`,
      current: index + 1,
      total: competitors.length
    });
    const competitorConfig: AuditConfig = {
      ...config,
      auditId: `${config.auditId}-competitor-${index + 1}`,
      url: competitorUrl,
      maxPages: Math.min(config.mode === "full_audit" ? 3 : 1, config.maxPages),
      competitors: [],
      outputs: {
        markdown: false,
        html: false,
        pdf: false,
        json: true,
        screenshotAnnotations: "basic"
      }
    };
    const competitorRoot = path.join(paths.competitors, siteSlug(competitorUrl));
    const competitorPaths = await createNestedAuditPaths(competitorRoot);
    await writeJson(path.join(competitorRoot, "audit-config.json"), competitorConfig);
    const capture = await captureEvidence(competitorConfig, competitorPaths, onProgress);
    const competitorReport = await reviewEvidence(competitorConfig, capture.pages, competitorPaths);
    await writeJson(path.join(competitorRoot, "report.json"), competitorReport);

    const scoreDelta = competitorReport.scorecard.overallScore - mainScore;
    results.push({
      competitorUrl,
      auditRoot: competitorRoot,
      pagesReviewed: competitorReport.pages.length,
      scorecard: competitorReport.scorecard,
      topFindings: competitorReport.findings.slice(0, 5),
      relativeStrengths: scoreDelta < 0 ? [`Main site scores ${Math.abs(scoreDelta)} points higher overall.`] : ["Competitor exposes patterns worth reviewing in the detailed evidence."],
      relativeWeaknesses: scoreDelta > 0 ? [`Competitor scores ${scoreDelta} points higher overall in the deterministic benchmark.`] : ["No overall benchmark gap detected by deterministic scoring."],
      differentiationOpportunities: competitorReport.findings.slice(0, 3).map((finding) => `Differentiate by outperforming competitor weakness: ${finding.title}`)
    });
  }

  await writeJson(path.join(paths.synthesis, "competitor-benchmark.json"), results);
  return results;
}
