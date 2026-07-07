# Agent Compatibility

The workflow should be usable by repo-capable agents such as Codex, Claude Code, opencode, OpenClaw, Hermes, and similar coding agents.

## Contract

Inputs:

- Workflow repo
- Public URL
- Optional context flags
- Optional explicit target website source repo via `--repo <path>`
- Optional audit root via `--audit-root <dir>` or `DESIGN_REVIEW_AUDIT_ROOT`
- Optional audit folder name via `--audit-name <name>`
- Optional suppression file
- Optional business-grade lane requiring imported agent visual review

Output:

- Local audit bundle
- Workflow manifest
- Handoff JSON
- Strict report validation result
- Quality gate JSON
- Agent execution plan
- Implementation plan
- Evidence index
- Evidence JSONL
- Source candidates and repo analysis when `--repo` is supplied
- Patch plan and changed-file proposal
- Design benchmark
- Business-grade gate
- Grouped issue inventory
- Screenshot manifest with PNG dimensions, grouping metadata, and sheet references
- Optimized contact sheets and static review-pack gallery
- Standards registry
- Suppression ledger
- Agent-specific instructions
- Human-readable and machine-readable report files
- Local export packages when requested

## Agent-Specific Handoff Files

Every successful audit writes:

- `report/agent-instructions/README.md`
- `report/agent-instructions/codex.md`
- `report/agent-instructions/claude-code.md`
- `report/agent-instructions/opencode.md`
- `report/agent-instructions/openclaw.md`
- `report/agent-instructions/hermes.md`

## Stable Commands

```bash
bash scripts/agent-run.sh <url>
node apps/cli/dist/index.js run <url>
node apps/cli/dist/index.js run <url> --repo <target-website-source-repo>
node apps/cli/dist/index.js run <url> --audit-root /path/to/design-review-workflow/audit-reports
node apps/cli/dist/index.js workflow --format json
node apps/cli/dist/index.js latest [site-or-url]
node apps/cli/dist/index.js doctor
node apps/cli/dist/index.js report lint <audit-dir> --strict
node apps/cli/dist/index.js review-pack build --report <audit-dir>
node apps/cli/dist/index.js agent-review validate --report <audit-dir> --file <visual-review.json>
node apps/cli/dist/index.js agent-review import --report <audit-dir> --file <visual-review.json>
node apps/cli/dist/index.js business-grade lint --report <audit-dir>
node apps/cli/dist/index.js plan build --report <audit-dir>
node apps/cli/dist/index.js benchmark --report <audit-dir>
node apps/cli/dist/index.js standards update --report <audit-dir>
node apps/cli/dist/index.js suppressions init [file]
node apps/cli/dist/index.js suppressions apply --report <audit-dir> --file <file>
node apps/cli/dist/index.js export --report <audit-dir> --profile review
node apps/cli/dist/index.js export --report <audit-dir> --profile full
node apps/cli/dist/index.js export --report <audit-dir> --profile repo-import
node apps/cli/dist/index.js compare <before-audit-dir> <after-audit-dir>
```

## Stable Bundle Files

- `index.html`
- `report/workflow-manifest.json`
- `report/handoff.json`
- `report/report.md`
- `report/report.html`
- `report/index.md`
- `report/index.html`
- `report/findings.json`
- `report/score.json`
- `report/report-dashboard.json`
- `report/actionability.json`
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
- `report/design-benchmark.md`
- `report/standards-registry.json`
- `report/suppression-report.json`
- `report/validation.json`
- `report/quality-gate.json`
- `report/business-grade-gate.json`
- `report/grouped-issues.json`
- `report/screenshot-manifest.json`
- `report/agent-review-pack/review-pack-manifest.json`
- `report/agent-review-pack/gallery/index.html`
- `report/contact-sheets/first-viewports.png`
- `report/contact-sheets/pages/*.png`
- `report/contact-sheets/issues/*.png`
- `report/hosted/index.html`
- `report/agent-review-pack/`
- `report/contact-sheets/*.png`
- `report/agent-visual-review.json` when imported
- `report/priority-action-plan.md`
- `report/next-actions.md`
- `report/agent-execution-plan.md`
- `report/agent-instructions/*.md`

## Latest Audit Pointers

Every completed audit updates:

- `audit-reports/audit-index.json`
- `audit-reports/audit-index.sqlite`
- `audit-reports/latest-audit.json`
- `audit-reports/<site>/latest-audit.json`

These files are generated and ignored by Git. They exist so agents do not need to infer the newest timestamped folder.

Default storage is `audit-reports/<site-or-audit-name>/<timestamp>Z-<scan-id>/`. When an agent runs this CLI from inside another website repository, it should pass `--audit-root /path/to/design-review-workflow/audit-reports` so reports stay with the workflow repo instead of being scattered into the target repo.

Legacy `projects/<site>/audits/<id>/` bundles remain readable for compatibility but are not the default.

## Export Packages

Use export packages for transfer or cloud handoff:

- `review`: customer-readable report bundle.
- `full`: complete internal audit artifact bundle.
- `repo-import`: source-repo handoff package for implementation agents, with local absolute paths redacted by default.

Each export writes `export-manifest.json`, `checksums.sha256`, and `LICENSE-NOTICE.md`. The core workflow does not upload to cloud storage; connected agents may upload a generated package only when explicitly asked.

## Source Mapping

`--repo` is an explicit, read-only source mapping mode. It scans bounded frontend/design-relevant files, excludes generated folders, writes `repo-analysis.json` and `source-candidates.json`, and refreshes `implementation-plan.json`, `patch-plan.md`, and `changed-files.json` with proposal data.

The workflow must not silently assume the current directory is the target website repository. If no source repo is supplied, the bundle still contains placeholder source-mapping artifacts that tell agents how to attach one.

## Business-Grade Visual Review

`report lint --strict` validates the technical bundle. `business-grade lint` validates the business-grade claim.

Without an imported strict `AgentVisualReview`, reports remain `automated_scan` or `agent_review_pending`. A repo-capable multimodal agent must inspect the optimized review pack, write a completed visual review JSON with design verdict, style/taste, page reviews, and redesign actions, then validate and import it:

```bash
# Normal CLI runs already create the review pack. Use this only to refresh/backfill an existing audit.
node apps/cli/dist/index.js review-pack build --report <audit-dir>
node apps/cli/dist/index.js agent-review validate --report <audit-dir> --file agent-runs/<agent>/visual-review.json
node apps/cli/dist/index.js agent-review import --report <audit-dir> --file agent-runs/<agent>/visual-review.json
node apps/cli/dist/index.js business-grade lint --report <audit-dir>
```

The strict review artifact must cover every captured page, reference only known screenshots, contain no TODO/template text, include strengths and risks, and provide at least 3 redesign actions unless the site verdict is `no_major_redesign_needed` with detailed rationale. Automated reports do not provide subjective style/taste verdicts.

The recommended review order is machine-readable in `report/agent-review-pack/review-pack-manifest.json`:

1. `report/contact-sheets/first-viewports.png` and `report/contact-sheets/pages/*-first-viewports.png`
2. `report/contact-sheets/issues/*.png`
3. `report/contact-sheets/pages/*-flow.png`
4. Raw screenshots from `report/screenshot-manifest.json`

The audit-root `index.html` is the primary static report surface for agents and handoff. It links into JSON artifacts, screenshots, contact sheets, review gallery, grouped issues, gates, and implementation files without requiring the Express/Vite local cockpit. `report/agent-review-pack/gallery/index.html` is static and filterable by page, viewport, issue, screenshot kind, and source. `report/contact-sheets/all-pages.png` remains available for older agents as an overview sheet.

The workflow does not need additional API keys for this lane because the visual judgment is performed by the agent running the repo.
