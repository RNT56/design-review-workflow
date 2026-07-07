# Agentic Website Design Review Workflow

Local-first, agent-native website design review workflow for evidence-backed UX, visual design, conversion, mobile, accessibility-basic, and performance-perception audits.

The intended handoff is simple: give any repo-capable agent this repository plus a public URL. The workflow captures evidence, validates the report bundle, and emits both human-readable reports and machine-readable handoff files.

Business-grade design-review claims are gated. A normal run is an `automated_scan`; a business-grade report requires the running multimodal agent to inspect the generated screenshots/contact sheets, write an `AgentVisualReview` JSON artifact, import it, and pass `business-grade lint`. No additional API keys are required for that lane.

## Quick Start

For agents or fresh clones:

```bash
bash scripts/agent-run.sh https://example.com
```

Equivalent manual path:

```bash
npm ci
npx playwright install chromium
npm run build
node apps/cli/dist/index.js run https://example.com
```

With read-only source mapping for an implementation agent:

```bash
node apps/cli/dist/index.js run https://example.com --repo /path/to/target-website-repo
```

Business-grade lane:

```bash
node apps/cli/dist/index.js run https://example.com --business-grade
node apps/cli/dist/index.js review-pack build --report projects/<site>/audits/<audit-id>
# The repo-capable multimodal agent follows report/agent-review-pack/review-pack-manifest.json,
# inspects the gallery and optimized PNG sheets, then writes a completed visual-review JSON.
node apps/cli/dist/index.js agent-review import --report projects/<site>/audits/<audit-id> --file agent-runs/<agent>/visual-review.json
node apps/cli/dist/index.js business-grade lint --report projects/<site>/audits/<audit-id>
```

Audit outputs are written to `projects/<site>/audits/<timestamp>-<mode>/`.

Each completed audit writes:

- `report/workflow-manifest.json`
- `report/handoff.json`
- `report/validation.json`
- `report/quality-gate.json`
- `report/business-grade-gate.json`
- `report/grouped-issues.json`
- `report/screenshot-manifest.json`
- `report/agent-review-pack/review-pack-manifest.json` when built
- `report/agent-review-pack/gallery/index.html` when built
- `report/contact-sheets/first-viewports.png` when built
- `report/contact-sheets/pages/*.png` when built
- `report/contact-sheets/issues/*.png` when built
- `report/agent-execution-plan.md`
- `report/implementation-plan.json`
- `report/evidence-index.json`
- `report/evidence.jsonl`
- `report/source-candidates.json`
- `report/repo-analysis.json`
- `report/patch-plan.md`
- `report/changed-files.json`
- `report/route-templates.json`
- `report/visual-system.json`
- `report/experience-timing.json`
- `report/design-benchmark.json`
- `report/standards-registry.json`
- `report/suppression-report.json`
- `report/hosted/index.html`
- `report/agent-review-pack/` when built
- `report/contact-sheets/*.png` when built
- `report/agent-visual-review.json` when imported
- `report/agent-instructions/*.md`
- `report/index.md` and `report/index.html`

Run the local UI:

```bash
npm run web
```

Then open the printed local URL.

## CLI

```bash
node apps/cli/dist/index.js run https://example.com --mode full --max-pages 15
npm run agent -- https://example.com
npm run quick -- https://example.com
npm run full -- https://example.com --competitor https://competitor.example
node apps/cli/dist/index.js latest example.com
node apps/cli/dist/index.js validate ./projects/example-com/audits/<audit-id>/report/report.json
node apps/cli/dist/index.js compare ./projects/example-com/audits/before ./projects/example-com/audits/after
node apps/cli/dist/index.js monitor init monitor.yaml
node apps/cli/dist/index.js monitor run monitor.yaml
node apps/cli/dist/index.js providers status
node apps/cli/dist/index.js workflow --format json
node apps/cli/dist/index.js report lint ./projects/example-com/audits/<audit-id> --strict
node apps/cli/dist/index.js review-pack build --report ./projects/example-com/audits/<audit-id>
node apps/cli/dist/index.js agent-review import --report ./projects/example-com/audits/<audit-id> --file agent-runs/<agent>/visual-review.json
node apps/cli/dist/index.js business-grade lint --report ./projects/example-com/audits/<audit-id>
node apps/cli/dist/index.js plan build --report ./projects/example-com/audits/<audit-id>
node apps/cli/dist/index.js benchmark --report ./projects/example-com/audits/<audit-id>
node apps/cli/dist/index.js standards update --report ./projects/example-com/audits/<audit-id>
node apps/cli/dist/index.js suppressions init design-review-suppressions.json
node apps/cli/dist/index.js suppressions apply --report ./projects/example-com/audits/<audit-id> --file design-review-suppressions.json
npm run doctor
```

## What The Workflow Does

- Same-domain crawl with relevance ranking
- Desktop and mobile screenshots
- Above-the-fold and full-page screenshots
- DOM/text/link/button/form extraction
- Section and component inventory
- CSS signals: colors, fonts, sizes, spacing, contrast samples
- axe-core accessibility basics when page injection succeeds
- Browser navigation-timing performance basics
- Rule-based reviewer agents for design, UX, conversion, brand/trust, content, mobile, accessibility, performance, and design-system consistency
- Deterministic synthesis, QA gate, scorecard, quick wins, redesign briefing, and ticket-ready recommendations
- Markdown, HTML, PDF, and JSON report exports
- Basic annotated screenshots for validated findings
- Screenshot manifest, contact sheets, and static hosted report with local screenshot assets
- Business-grade visual-review pack for repo-capable multimodal agents, including optimized first-viewport, page-flow, issue-evidence PNG sheets and a static filterable gallery
- Visual-review import that merges agent observations, grouped issues, refreshed score confidence, and report/UI output
- Competitor benchmark output when competitor URLs are supplied
- Local ticket export files for GitHub Issues, Linear, Jira, and JSON backlog
- Audit compare artifacts with subscore deltas and screenshot diffs where dimensions match
- SQLite-backed local audit index with JSON fallback
- Local monitor runs from YAML/JSON config
- Read-only Figma evidence fetch command when `FIGMA_TOKEN` is configured
- Environment-configured model provider adapters
- One-command agent runner for repo-capable agents
- Repository-level workflow contract via `workflow`
- Strict report lint and quality-gate files
- Design workflow benchmark, standards registry, and non-destructive suppression ledger
- Optional `--repo` source analysis that emits candidate files, patch plan, and changed-file proposal without modifying the target repo
- Latest-audit pointers for timestamp-free handoff
- Agent execution plan, machine-readable handoff, implementation plan, evidence index, evidence JSONL, and agent-specific instructions

## Safety Boundary

- No login-area audits
- No purchases or personal-data submission
- No full WCAG, SEO, analytics, privacy, bundle, or server-performance audit
- No production LLM provider calls yet
- No business-grade claim without imported agent visual review
- No true Lighthouse report yet
- No Figma or external ticketing integrations yet
- No automatic target-repo edits from `--repo`; it is read-only source mapping
- No live writes to external ticketing systems without explicit credentials and a dedicated command
- No model call is made unless both provider API key and model env vars are configured

See [AGENTS.md](./AGENTS.md) for the source-of-truth implementation contract.
See [AGENT-RUNBOOK.md](./AGENT-RUNBOOK.md) for handing this workflow to another agent.

## Review Pack Order

When business-grade depth is required, agents should build the review pack and inspect evidence in this order:

1. `report/agent-review-pack/review-pack-manifest.json`
2. `report/agent-review-pack/gallery/index.html`
3. `report/contact-sheets/first-viewports.png`
4. `report/contact-sheets/issues/*.png`
5. `report/contact-sheets/pages/*-flow.png`
6. Raw screenshots listed in `report/screenshot-manifest.json`

Raw screenshots are never modified. The generated sheets are inspection surfaces over that evidence.

## Project Structure

```text
apps/
  cli/          CLI entrypoint.
  web/          Local web UI and local API server.
packages/
  core/         Capture, schemas, review, scoring, reports.
docs/           Architecture and operating docs.
examples/       Example audit config.
projects/       Generated local audit output.
```

## Development

```bash
npm run typecheck
npm test
npm run build
npm run doctor
```

The generated `projects/*/audits/*` folders are ignored by Git. Keep only intentional samples under `examples/`.
