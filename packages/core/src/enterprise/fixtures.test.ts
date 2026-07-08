import { describe, expect, it } from "vitest";
import { enterpriseFixtureCorpus, enterpriseFixtureManifest } from "./fixtures.js";

describe("enterprise fixture corpus", () => {
  it("declares the required enterprise archetypes and artifacts", () => {
    const manifest = enterpriseFixtureManifest();
    expect(manifest.fixtures).toHaveLength(enterpriseFixtureCorpus.length);
    expect(manifest.fixtures.map((fixture) => fixture.archetype)).toEqual([
      "saas",
      "portfolio",
      "ecommerce",
      "local_service",
      "blog",
      "docs",
      "dashboard_public",
      "interaction_heavy",
      "performance_heavy",
      "accessibility_issues"
    ]);
    for (const fixture of manifest.fixtures) {
      expect(fixture.expectedArtifacts).toContain("report/performance-audit.json");
      expect(fixture.expectedArtifacts).toContain("report/enterprise-readiness.json");
      expect(fixture.expectedEvidence).toContain("screenshot_manifest");
    }
  });
});
