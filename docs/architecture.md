# Architecture

The system is intentionally built as an evidence pipeline, not as a single agent that looks at a screenshot and writes prose.

```text
CLI / Local Web UI
  -> Audit Orchestrator
  -> Evidence Capture
  -> Structured Understanding
  -> Reviewer Agents
  -> Synthesis
  -> QA Gate
  -> Report Generation
  -> Report Lint
  -> Business-Grade Gate
  -> Design Workflow Artifacts
  -> Optional Multimodal Agent Visual Review
  -> Optional Source Repo Mapping
  -> Agent Handoff Bundle
```

## Layers

### Audit Orchestrator

Interprets config, creates the audit folder, coordinates capture, stores intermediate state, runs review, and writes reports.

The local web entrypoint binds to loopback only. It validates the initial target, redirects, browser navigation requests, and competitor targets against private/reserved network ranges; audit starts are rate-limited and queued with bounded concurrency and cancellation.

### Evidence Capture

Uses Playwright to render public pages. It stores raw desktop/mobile screenshots, safe interaction states, page inventory, redirect/canonical crawl metadata, partial-capture failures, extracted text, DOM summaries, CSS signals, deterministic copy/layout review signals, responsive axe results, and responsive browser performance evidence.

### Structured Understanding

Classifies pages by URL and visible evidence. Unknown pages remain `unknown` with lower confidence instead of being forced into a false category.

### Reviewer Agents

The MVP ships deterministic reviewers that emit structured `Finding` objects. These reviewers triage evidence and produce useful automated findings, but they do not unlock business-grade visual judgment by themselves.

High-fidelity design judgment is handled through an explicit multimodal agent lane: the workflow generates a review pack and evidence brief, the repo-capable agent running the workflow visually inspects the gallery, optimized PNG sheets, raw screenshots, and structured copy/layout signals, and `agent-review import` validates the completed `AgentVisualReview` artifact before merging it.

### Synthesis And QA

Findings are deduplicated, grouped into root-cause issues, scored, validated against evidence, and downgraded or removed if unsupported or generic. The v2 numeric score is status-independent; review status changes evidence coverage, confidence, and which subjective claims are permitted.

### Reports

The report layer writes:

- `index.html` at the audit root
- `report/report.json`
- `report/report.md`
- `report/report.html`
- `report/report.pdf`
- `report/executive-summary.md`
- `report/hosted/index.html`

The top-level audit `index.html` is the canonical no-server dashboard and links into generated JSON, screenshots, contact sheets, review gallery, gates, and handoff files by relative path. `report/hosted/index.html` remains a secondary standalone report; local assets use copy-on-write clones when the filesystem supports them and copy fallback otherwise, so editing hosted assets cannot mutate raw evidence.

### Local Export Packages

The `export` command creates deterministic local handoff packages without cloud credentials:

- `review`: customer-readable report package.
- `full`: complete internal artifact package excluding nested exports.
- `repo-import`: implementation-agent handoff package with local absolute paths redacted by default.

Each export includes `export-manifest.json`, `checksums.sha256`, and `LICENSE-NOTICE.md`. Cloud upload is intentionally outside the core pipeline and should happen only through an explicitly authorized external connector after a local package exists.

### Design Workflow Artifacts

The design-review bundle adds stable operational artifacts:

- `report/evidence.jsonl`
- `report/evidence-brief.json`
- `report/route-templates.json`
- `report/visual-system.json`
- `report/experience-timing.json`
- `report/standards-registry.json`
- `report/criteria-evaluation.json`
- `report/bundle-integrity.json`
- `report/suppression-report.json`
- `report/design-benchmark.json`
- `report/design-benchmark.md`
- `report/grouped-issues.json`
- `report/business-grade-gate.json`
- `report/screenshot-manifest.json`
- `report/agent-review-pack/`
- `report/agent-review-pack/review-pack-manifest.json`
- `report/agent-review-pack/gallery/index.html`
- `report/contact-sheets/first-viewports.png`
- `report/contact-sheets/pages/*.png`
- `report/contact-sheets/issues/*.png`
- `report/contact-sheets/*.png`
- `report/patch-plan.md`
- `report/changed-files.json`
- `report/manual-actions.md`
- `report/remaining-user-decisions.md`

These are design-review equivalents of a robust agentic workflow bundle. They do not copy SEO-specific checks; they expose evidence, UI system signals, implementation planning, standards, suppression state, and benchmark readiness for downstream agents.

### Optional Source Repo Mapping

`--repo <path>` attaches a target website source repository explicitly. The mapper is read-only, bounded to frontend/design-relevant files, skips generated folders, and writes:

- `report/repo-analysis.json`
- `report/source-candidates.json`
- `report/patch-plan.md`
- `report/changed-files.json`

The workflow must not silently assume the current directory is the website source repository.

### Multimodal Agent Visual Review

The default agent path is business-grade, local-first, and quiet in chat. `scripts/agent-run.sh` and `npm run agent -- <url>` call `run --business-grade --format json`, which writes screenshot manifests, optimized contact sheets, a static filterable gallery, `report/evidence-brief.json`, per-page prompts, a JSON schema, and a template. Agents should keep routine progress and logs out of chat, use the JSON closeout for their final response, and inspect those screenshots and structured signals before writing `agent-runs/<agent>/visual-review.json`.

The review-pack order is first viewports, grouped issue evidence, page-flow sheets split into readable chunks, captured interaction states, then raw screenshots. `contact-sheets/all-pages.png` is retained as a compatibility overview. Raw screenshots remain unchanged; sheets and gallery files are derived inspection surfaces.

`agent-review import` validates the review against the captured screenshot inventory, rejects TODO/template text, shallow generic verdicts, unknown screenshots, and unsupported analytics/user/competitor claims. A passing artifact must include site-level design verdict, style/taste assessment, messaging/copy assessment, page-level visual and copy judgment for every captured page, and prioritized redesign actions or a detailed no-major-redesign rationale. The import converts visual findings into the normal finding pipeline, turns redesign actions into ticket-ready recommendations, refreshes grouped issues, scoring, tickets, report surfaces, and writes `report/agent-visual-review.json`.

`business-grade lint` passes only after that import succeeds.

`agent-review generate --report <audit-dir> --provider auto` is an optional provider-backed lane. It uses configured multimodal provider adapters, bounded timeouts/output limits, balanced review-pack sampling, staged page batches for larger sites, and request/image provenance hashes. It saves raw provider output under `agent-runs/`, writes the same `AgentVisualReview` schema, and must pass the same validate/import/business-grade gates.

### Validation And Handoff

Every completed audit uses an explicit finalizer to write integrity and gate state, then runs pure read-only report lint. Existing bundles are changed only through `report repair` or another explicit artifact-writing command. The stable agent bundle includes:

- `index.html`
- `report/workflow-manifest.json`
- `report/handoff.json`
- `report/validation.json`
- `report/quality-gate.json`
- `report/business-grade-gate.json`
- `report/grouped-issues.json`
- `report/screenshot-manifest.json`
- `report/evidence-index.json`
- `report/evidence.jsonl`
- `report/implementation-plan.json`
- `report/repo-analysis.json`
- `report/source-candidates.json`
- `report/patch-plan.md`
- `report/changed-files.json`
- `report/route-templates.json`
- `report/visual-system.json`
- `report/experience-timing.json`
- `report/design-benchmark.json`
- `report/standards-registry.json`
- `report/suppression-report.json`
- `report/hosted/index.html`
- `report/agent-execution-plan.md`
- `report/agent-instructions/*.md`

## Storage Contract

Each audit is a reproducible local snapshot:

```text
audit-reports/<site-or-audit-name>/<timestamp>Z-<scan-id>/
  audit-config.json
  audit-state.json
  index.html
  crawl-map.json
  page-inventory.json
  screenshots/
    desktop/
    mobile/
    states/
  extracted/
    pages/
  agent-runs/
  synthesis/
  exports/
  report/
```

The latest completed audit is also exposed through generated pointers:

```text
audit-reports/audit-index.json
audit-reports/audit-index.sqlite
audit-reports/latest-audit.json
audit-reports/<site>/latest-audit.json
```

Storage controls:

- `--audit-root <dir>` and `DESIGN_REVIEW_AUDIT_ROOT` select the root. The default is `./audit-reports`.
- `--audit-name <name>` controls the site folder slug before falling back to the domain.
- `--output <dir>` is an explicit advanced override and must not overwrite an existing audit directory.

Legacy `projects/<site>/audits/<id>/` reports remain readable for compatibility, but new runs should use `audit-reports/`.

## Extension Points

- `ModelRouter` and `LlmProvider` interfaces for future provider-backed agents
- Criteria library for review rules and scoring calibration
- Design standards registry for workflow-level rules
- Read-only source repo analyzer for implementation candidate mapping
- Report generator boundaries for external document exports
- Audit storage boundary for future cloud indexing or optional upload layers
- Agent bundle JSON files for downstream coding-agent execution
