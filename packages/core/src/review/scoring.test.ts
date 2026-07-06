import { describe, expect, it } from "vitest";
import { priorityScore } from "./scoring.js";

describe("priorityScore", () => {
  it("prioritizes high-impact confident low-effort homepage issues", () => {
    const score = priorityScore({
      severity: "high",
      impact: "high",
      confidence: "high",
      effort: "low",
      pageImportance: "high"
    });
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it("downranks low-confidence high-effort low-impact issues", () => {
    const score = priorityScore({
      severity: "low",
      impact: "low",
      confidence: "low",
      effort: "high",
      pageImportance: "low"
    });
    expect(score).toBeLessThan(45);
  });
});
