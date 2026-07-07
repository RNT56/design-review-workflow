# Agentic Website Design Review - Agent Source Of Truth

This repository builds a local-first website design review workflow. Treat this file as the primary contract for agents working here. If another document disagrees with this file, update the other document or explicitly revise this file in the same change.

## Product Goal

Create a locally runnable, later cloud-ready system that turns a public URL into an evidence-backed website design audit. The audit must capture rendered evidence, classify pages, generate structured findings, validate those findings, score the website, and export client-ready reports.

Minimum input:

- URL

Optional input:

- Website goal
- Target audience
- Industry
- Brand context
- Competitor URLs
- Audit mode
- Language
- Audit output root via `--audit-root <dir>` or `DESIGN_REVIEW_AUDIT_ROOT`
- Audit folder name via `--audit-name <name>`
- Explicit output directory via `--output <dir>`
- Target website source repository via `--repo <path>`
- Suppression file
- Baseline audit for compare/monitor workflows

Required outputs for the MVP:

- Workflow manifest
- Agent handoff JSON
- Validation and quality-gate JSON
- Design workflow benchmark
- Standards registry
- Suppression ledger
- Markdown report
- HTML report
- PDF report
- JSON automation export
- Scorecard
- Business-grade gate JSON
- Grouped issue inventory
- Prioritized findings
- Screenshot references
- Screenshot manifest and optimized review-pack contact sheets
- Static review-pack gallery
- Evidence JSONL
- Route template inventory
- Visual system inventory
- Experience timing summary
- Source candidate map when a target repo is explicitly supplied
- Patch plan and changed-file proposal
- Redesign briefing
- Ticket-ready recommendations
- Local export manifest and checksums when an export profile is generated
- Local export ZIPs or directories under `exports/` when requested

## Current Implementation Boundary

The implemented MVP is deterministic and local-first:

- TypeScript monorepo
- CLI audit runner
- Local web UI
- Deterministic local audit storage under `audit-reports/<site-or-audit-name>/<timestamp>Z-<scan-id>/`
- Playwright capture for desktop and mobile screenshots
- DOM, text, form, link, button, section, and CSS-signal extraction
- Basic same-domain crawl and page selection
- Rule-based page classification and website-type inference
- Rule-based reviewer agents that emit structured findings
- Deterministic synthesis, QA validation, scoring, quick wins, tickets, and redesign briefing
- Markdown, HTML, JSON, and PDF report generation
- Basic annotated screenshot generation for validated findings
- Manual competitor benchmark mode for supplied competitor URLs
- Local ticket export bundle for GitHub Issues, Linear, Jira, and JSON backlog
- Local audit index under `audit-reports/audit-index.json`
- SQLite-backed local audit index under `audit-reports/audit-index.sqlite` with JSON fallback
- Regression compare command with score deltas, finding deltas, and screenshot pixel diffs where screenshots are compatible
- Environment-configured LLM provider adapters for future reviewer use
- Read-only Figma evidence fetch command gated by `FIGMA_TOKEN`
- Local monitor runs from YAML/JSON configuration
- One-command agent runner via `scripts/agent-run.sh` and `npm run agent`
- Primary `run` command for audit, validation, and agent handoff
- `--audit-root`, `--audit-name`, and explicit `--output` storage controls
- Local export profiles via `export --profile review|full|repo-import`
- Strict business-grade gate with `automated_scan`, `agent_review_pending`, and `business_grade` statuses
- Multimodal agent visual-review pack generation via `review-pack build`
- Visual-review import via `agent-review import`, with validation against captured screenshot IDs and unsupported-claim checks
- `business-grade lint` for the business-grade gate separate from technical `report lint`
- Grouped root-cause issues under `grouped-issues.json`
- Top-level static audit dashboard under `index.html`; this is the canonical no-server report entrypoint for agents and handoff.
- Standalone static hosted report under `report/hosted/index.html` with copied screenshot assets
- Screenshot manifest with actual PNG dimensions, display roles, grouping metadata, and sheet references
- Optimized review-pack contact sheets for first viewports, page flows split into readable chunks, and grouped issue evidence
- Static review-pack gallery under `report/agent-review-pack/gallery/index.html`
- Issue evidence sheets with numbered markers and side legends for agent visual review
- Strict report lint, quality gate files, generated workflow manifest, handoff JSON, evidence index, implementation plan, and agent handoff instructions
- Design-native parity mechanics: `benchmark`, `standards update`, non-destructive `suppressions`, `--repo` source mapping, patch-plan proposals, changed-file proposals, evidence JSONL, route templates, visual-system inventory, and experience-timing artifacts
- Latest-audit pointers under `audit-reports/latest-audit.json` and `audit-reports/<site>/latest-audit.json`
- axe-core accessibility basics where injection succeeds
- Browser navigation-timing performance basics; Lighthouse-grade audits are intentionally external to this dependency-light workflow

The following are planned seams, not completed product claims unless code and tests prove otherwise:

- External LLM-backed review agents
- Provider-specific model quality claims
- Business-grade report claims without imported multimodal agent visual review
- Continuous scheduled monitoring
- Figma analysis beyond read-only evidence fetch
- Login-area audits
- SaaS/cloud multi-user storage
- Live Jira, Linear, GitHub Issues, Notion, Slack, or Google Docs writes
- Built-in cloud upload. Agents with explicit connector access may upload generated export packages, but core should stay local-first.
- Full WCAG certification
- Deep SEO, analytics, privacy, bundle, server, or tracking analysis

## Non-Goals For MVP

Do not add these unless the roadmap explicitly changes:

- Entering login-protected areas
- Completing purchases
- Sending real personal data
- Claiming legal accessibility or privacy compliance
- Publishing screenshots externally
- Automatically researching competitors
- Diagnosing backend performance or JavaScript bundle internals

## Architecture Contract

The workflow must stay evidence-first:

```text
Evidence Capture
-> Structured Understanding
-> Specialized Reviews
-> Synthesis
-> QA Gate
-> Reports / Tickets
```

Every final finding must include:

- URL
- Page type or page ID
- Viewport when applicable
- Section or element when applicable
- Observation
- Impact
- Recommendation
- Severity
- Priority score
- Confidence
- Evidence reference
- Acceptance criteria

Agents must not invent pages, competitors, metrics, screenshots, user behavior, or brand guidelines. If brand fit, audience, or business goal is inferred, label it as inferred.

High-fidelity design judgment must come from the repo-capable multimodal agent running the workflow. The workflow may package screenshots and prompts, but it must not imply an AI model viewed the design until `agent-review import` has validated a completed `AgentVisualReview` artifact.

Strict business-grade visual review requires:

- A site-level `designVerdict` with readiness, style/taste, audience fit, brand fit, strongest qualities, weakest risks, redesign direction, rationale, confidence, and limitations.
- A completed review for every captured page, including first viewport, hierarchy, composition, CTA clarity, trust/proof, mobile feel, visual-system coherence, accessibility basics, style/taste, and redesign advice.
- At least 3 evidence-linked redesign actions, unless `designVerdict.readiness` is `no_major_redesign_needed` with a detailed evidence-backed rationale.
- No TODO/template text, no unknown screenshot references, and no unsupported analytics/user/revenue/competitor claims.

## Agentic Workflow Contract

Primary fresh-clone command:

```bash
bash scripts/agent-run.sh <public-url>
```

Primary built CLI command:

```bash
node apps/cli/dist/index.js run <public-url>
node apps/cli/dist/index.js run <public-url> --repo <target-website-source-repo>
node apps/cli/dist/index.js run <public-url> --audit-root /path/to/design-review-workflow/audit-reports
node apps/cli/dist/index.js run <public-url> --business-grade
```

Default audit storage:

```text
audit-reports/
  <site-or-audit-name>/
    <timestamp>Z-<scan-id>/
      audit-config.json
      audit-state.json
      screenshots/
      extracted/
      agent-runs/
      synthesis/
      exports/
      report/
  audit-index.json
  audit-index.sqlite
  latest-audit.json
```

Slug priority is `--audit-name`, then config `auditName`/`auditSlug`, then the target domain. Normal runs never overwrite prior audit folders. `--output <dir>` is an explicit advanced override and still fails if the directory already exists.

Every completed audit must produce a self-contained agent bundle under `report/`, plus a top-level `index.html` dashboard at the audit root:

- `../index.html` as the primary human-readable entrypoint
- `workflow-manifest.json`
- `handoff.json`
- `validation.json`
- `quality-gate.json`
- `business-grade-gate.json`
- `grouped-issues.json`
- `screenshot-manifest.json`
- `agent-review-pack/review-pack-manifest.json`
- `agent-review-pack/gallery/index.html`
- `contact-sheets/first-viewports.png`
- `contact-sheets/pages/*.png`
- `contact-sheets/issues/*.png`
- `agent-execution-plan.md`
- `implementation-plan.json`
- `evidence-index.json`
- `evidence.jsonl`
- `repo-analysis.json`
- `source-candidates.json`
- `patch-plan.md`
- `changed-files.json`
- `route-templates.json`
- `visual-system.json`
- `experience-timing.json`
- `design-benchmark.json`
- `design-benchmark.md`
- `standards-registry.json`
- `suppression-report.json`
- `actionability.json`
- `findings.json`
- `score.json`
- `report-dashboard.json`
- `hosted/index.html`
- `agent-review-pack/`
- `contact-sheets/*.png`
- `agent-visual-review.json` when an agent visual review has been imported
- `agent-instructions/README.md`
- `agent-instructions/codex.md`
- `agent-instructions/claude-code.md`
- `agent-instructions/opencode.md`
- `agent-instructions/openclaw.md`
- `agent-instructions/hermes.md`

The report bundle is the stable interface for downstream agents. Agents should read `workflow-manifest.json` first, then `handoff.json`, then `agent-execution-plan.md`.

When business-grade review is required, agents must use the review-pack order from `agent-review-pack/review-pack-manifest.json`:

1. First viewports: `contact-sheets/first-viewports.png` plus per-page `contact-sheets/pages/*-first-viewports.png`.
2. Grouped issue evidence: `contact-sheets/issues/*.png`.
3. Page flows: `contact-sheets/pages/*-flow.png`.
4. Raw screenshots listed in `screenshot-manifest.json` for dispute resolution or closer inspection.

`contact-sheets/all-pages.png` remains a compatibility overview, not the primary visual review artifact.

Stable closeout commands:

```bash
node apps/cli/dist/index.js report lint <audit-dir> --strict
node apps/cli/dist/index.js review-pack build --report <audit-dir>   # refresh/backfill review-pack assets
node apps/cli/dist/index.js agent-review validate --report <audit-dir> --file <visual-review.json>
node apps/cli/dist/index.js agent-review import --report <audit-dir> --file <visual-review.json>
node apps/cli/dist/index.js business-grade lint --report <audit-dir>
node apps/cli/dist/index.js benchmark --report <audit-dir>
node apps/cli/dist/index.js plan build --report <audit-dir>
node apps/cli/dist/index.js standards update --report <audit-dir>
node apps/cli/dist/index.js suppressions init design-review-suppressions.json
node apps/cli/dist/index.js suppressions apply --report <audit-dir> --file design-review-suppressions.json
node apps/cli/dist/index.js export --report <audit-dir> --profile review
node apps/cli/dist/index.js export --report <audit-dir> --profile full
node apps/cli/dist/index.js export --report <audit-dir> --profile repo-import
```

Export profiles are local-only:

- `review`: customer-readable report bundle with hosted report, contact sheets, findings, score, gates, and selected visual evidence.
- `full`: complete internal audit artifact bundle excluding nested prior exports.
- `repo-import`: source-repo handoff package for implementation agents, with local absolute paths redacted by default.

Each export writes `export-manifest.json`, `checksums.sha256`, and `LICENSE-NOTICE.md`. Cloud upload is intentionally outside the core workflow; use a separate explicitly authorized agent connector if a user asks for upload.

`--repo` is read-only. It may generate `repo-analysis.json`, `source-candidates.json`, `patch-plan.md`, and `changed-files.json`, but it must not modify the target website repository. Implementation agents must verify candidate files before editing and must run the target repo's own tests/build after any changes.

## Repository Layout

```text
apps/
  cli/          Command-line entrypoint.
  web/          Local web UI and local API server.
packages/
  core/         Capture, schemas, storage, review, synthesis, reports.
docs/           Architecture, scoring, schemas, prompts, eval plan.
examples/       Example audit config.
audit-reports/  Generated local audit outputs. Ignored by Git.
projects/       Legacy audit output root. Read-compatible; do not use for new default output.
```

## Implementation Rules

- Prefer deterministic capture and structured schemas over free-form prose.
- Keep model names and provider choices in config/adapters, never hard-coded through core logic.
- Save intermediate artifacts in the audit folder so failures are inspectable.
- Reports must reference existing screenshot/evidence files only.
- Raw screenshots must remain unchanged; generated contact sheets and gallery files are derived review surfaces.
- `screenshot-manifest.json` must include actual PNG pixel dimensions, display roles, group memberships, and derived sheet references when the review pack is built.
- `agent-review-pack/review-pack-manifest.json` is the source of truth for visual review order and sheet mappings.
- Local UI and hosted reports should keep raw screenshot drawers collapsed by default while linking optimized issue/page evidence sheets.
- Agent handoff files must be generated under `report/agent-instructions/`.
- `workflow-manifest.json` and `handoff.json` must be machine-readable and must not require scraping Markdown.
- `source-candidates.json`, `patch-plan.md`, and `changed-files.json` are proposal artifacts, not proof that edits were made.
- Suppressions are non-destructive. They must be recorded in `suppression-report.json` and must not remove entries from `findings.json`.
- Every normal audit must write `validation.json` and `quality-gate.json`.
- `report lint --strict` must fail unsupported report bundles.
- `business-grade lint` must fail unless a strict validated `AgentVisualReview` has been imported.
- `run --business-grade` must generate the review pack and leave the audit in `agent_review_pending` until import.
- Automated scans must be labeled `automated_scan`, not `business_grade`.
- Automated scans must not provide subjective style/taste verdicts; they must show that visual review is required.
- Scores must remain capped when `businessGradeStatus !== business_grade`.
- The QA gate must remove or downgrade unsupported, generic, duplicate, or overclaiming findings.
- Any future LLM reviewer must produce the same `Finding` or `AgentVisualReview` schema and pass the same deterministic QA/business-grade gates.
- Use local files and `.env` for credentials. Never commit secrets.
- Keep generated `audit-reports/` output out of Git except curated examples.
- Keep legacy generated `projects/*/audits/*`, `projects/index.sqlite`, `projects/index.json`, and `projects/figma/` out of Git.
- Do not add Google Drive, Dropbox, S3, or other upload behavior to the core runner unless the roadmap explicitly changes; export deterministic local packages first.

## Verification Expectations

Before closing implementation work, run the strongest feasible local checks:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run doctor`
- At least one smoke audit against a small local or public page when browser dependencies are installed
- A compare smoke when two compatible audit snapshots exist

If a check cannot run, document the exact reason in the final response.

## Roadmap Summary

MVP:

- URL to local evidence snapshot
- Desktop and mobile screenshots
- Page classification
- DOM/text/CSS/accessibility/performance basics
- Structured deterministic findings
- QA gate, scorecard, briefing, tickets
- Markdown, HTML, PDF, JSON exports
- CLI and local UI

V1:

- LLM provider adapters used in production
- External ticket/document live-write commands
- Continuous scheduled monitoring daemon or external scheduler

V2+:

- Figma prototype review
- CMS/platform-specific recommendations
- Design token export
- Presentation export
- Cloud/team product
- Continuous monitoring and launch gates
