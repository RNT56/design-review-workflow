import { describe, expect, it } from "vitest";
import type { Finding } from "../schemas/audit.js";
import { groupFindings } from "./grouping.js";

describe("groupFindings", () => {
  it("merges duplicate deterministic findings into one grouped issue", () => {
    const findings = [finding("finding_1", "https://example.com/"), finding("finding_2", "https://example.com/about")];

    const grouped = groupFindings(findings);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].sourceFindingIds).toEqual(["finding_1", "finding_2"]);
    expect(grouped[0].affectedPages.map((page) => page.url)).toEqual(["https://example.com/", "https://example.com/about"]);
  });
});

function finding(findingId: string, url: string): Finding {
  return {
    findingId,
    source: "deterministic",
    title: "Primary action lacks hierarchy",
    category: "conversion",
    severity: "high",
    priorityScore: 82,
    impact: "high",
    effort: "medium",
    confidence: "high",
    evidence: {
      pageId: findingId.replace("finding", "page"),
      url,
      section: "hero",
      screenshotRefs: [`${findingId}_shot`],
      textQuotes: []
    },
    observation: "The primary action is not visually dominant enough in the captured first viewport.",
    whyItMatters: "Visitors need a clear next step before comparing secondary navigation choices.",
    recommendation: "Make one primary action visually dominant and keep secondary actions clearly subordinate.",
    designPrinciples: ["hierarchy"],
    implementation: {
      owner: ["designer", "developer"],
      acceptanceCriteria: ["One primary CTA is visually dominant in the first viewport."],
      dependencies: [],
      definitionOfDone: ["A rerun shows the issue is resolved."]
    },
    relatedFindings: []
  };
}
