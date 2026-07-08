export type EnterpriseFixtureArchetype =
  | "saas"
  | "portfolio"
  | "ecommerce"
  | "local_service"
  | "blog"
  | "docs"
  | "dashboard_public"
  | "interaction_heavy"
  | "performance_heavy"
  | "accessibility_issues";

export type EnterpriseFixtureDefinition = {
  id: string;
  archetype: EnterpriseFixtureArchetype;
  purpose: string;
  expectedEvidence: string[];
  expectedArtifacts: string[];
  riskSignals: string[];
};

export const enterpriseFixtureCorpus: EnterpriseFixtureDefinition[] = [
  fixture("fixture_saas", "saas", "B2B product marketing surface with hero, proof, pricing, feature depth, and CTA hierarchy."),
  fixture("fixture_portfolio", "portfolio", "Personal/agency portfolio with work proof, case-study navigation, contact CTA, and taste judgment."),
  fixture("fixture_ecommerce", "ecommerce", "Commerce catalog/product path with category, product detail, cart-adjacent, trust, and mobile purchase decision signals."),
  fixture("fixture_local_service", "local_service", "Local service site with service clarity, location trust, contact path, reviews, and proof near inquiry CTA."),
  fixture("fixture_blog", "blog", "Editorial/blog surface with article readability, index navigation, recirculation, and subscription prompts."),
  fixture("fixture_docs", "docs", "Documentation site with information scent, search/navigation, code/example readability, and version/context clarity."),
  fixture("fixture_dashboard_public", "dashboard_public", "Public dashboard/product surface with scanning density, comparison tables, chart framing, and operational clarity."),
  fixture("fixture_interaction_heavy", "interaction_heavy", "Read-only UI states for dialogs, drawers, tabs, accordions, filters, popovers, menus, and carousels."),
  fixture("fixture_performance_heavy", "performance_heavy", "Large media, third-party resource, render-blocking candidate, and delayed reveal stress surface."),
  fixture("fixture_accessibility_issues", "accessibility_issues", "Missing labels, heading structure, alt text, contrast candidates, and tap target risk surface.")
];

export function enterpriseFixtureManifest() {
  return {
    schemaVersion: "design-review-workflow.enterprise-fixtures.v1",
    generatedAt: new Date().toISOString(),
    fixtures: enterpriseFixtureCorpus,
    requiredEvalCommands: [
      "node apps/cli/dist/index.js report lint <audit-dir> --strict",
      "node apps/cli/dist/index.js enterprise verify --report <audit-dir>",
      "node apps/cli/dist/index.js business-grade lint --report <audit-dir>",
      "node apps/cli/dist/index.js compare <baseline-audit-dir> <candidate-audit-dir>"
    ]
  };
}

function fixture(id: string, archetype: EnterpriseFixtureArchetype, purpose: string): EnterpriseFixtureDefinition {
  return {
    id,
    archetype,
    purpose,
    expectedEvidence: [
      "desktop_first_viewport",
      "desktop_full_page",
      "mobile_first_viewport",
      "mobile_full_page",
      "screenshot_manifest",
      "evidence_brief",
      "enterprise_artifacts"
    ],
    expectedArtifacts: [
      "report/performance-audit.json",
      "report/accessibility-detail.json",
      "report/privacy-tracking.json",
      "report/resource-audit.json",
      "report/interaction-states.json",
      "report/related-workflows.json",
      "report/enterprise-readiness.json"
    ],
    riskSignals: riskSignalsFor(archetype)
  };
}

function riskSignalsFor(archetype: EnterpriseFixtureArchetype): string[] {
  switch (archetype) {
    case "interaction_heavy":
      return ["safe_interaction_coverage", "no_mutating_actions", "state_screenshot_links"];
    case "performance_heavy":
      return ["large_resources", "third_party_origins", "slow_timing_candidates"];
    case "accessibility_issues":
      return ["axe_violations", "missing_form_labels", "missing_alt", "contrast_candidates"];
    case "ecommerce":
      return ["checkout_boundary", "trust_proof", "mobile_cta"];
    default:
      return ["first_viewport_clarity", "navigation", "trust_proof", "mobile_composition"];
  }
}
