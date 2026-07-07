# Agent Compatibility

The workflow should be usable by repo-capable agents such as Codex, Claude Code, opencode, OpenClaw, Hermes, and similar coding agents.

## Contract

Inputs:

- Workflow repo
- Public URL
- Optional context flags
- Optional explicit target website source repo via `--repo <path>`
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
- Screenshot manifest and contact sheets
- Standards registry
- Suppression ledger
- Agent-specific instructions
- Human-readable and machine-readable report files

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
node apps/cli/dist/index.js workflow --format json
node apps/cli/dist/index.js latest [site-or-url]
node apps/cli/dist/index.js doctor
node apps/cli/dist/index.js report lint <audit-dir> --strict
node apps/cli/dist/index.js review-pack build --report <audit-dir>
node apps/cli/dist/index.js agent-review import --report <audit-dir> --file <visual-review.json>
node apps/cli/dist/index.js business-grade lint --report <audit-dir>
node apps/cli/dist/index.js plan build --report <audit-dir>
node apps/cli/dist/index.js benchmark --report <audit-dir>
node apps/cli/dist/index.js standards update --report <audit-dir>
node apps/cli/dist/index.js suppressions init [file]
node apps/cli/dist/index.js suppressions apply --report <audit-dir> --file <file>
node apps/cli/dist/index.js compare <before-audit-dir> <after-audit-dir>
```

## Stable Bundle Files

- `report/workflow-manifest.json`
- `report/handoff.json`
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
- `report/hosted/index.html`
- `report/agent-review-pack/` when built
- `report/contact-sheets/*.png` when built
- `report/agent-visual-review.json` when imported
- `report/priority-action-plan.md`
- `report/next-actions.md`
- `report/agent-execution-plan.md`
- `report/agent-instructions/*.md`

## Latest Audit Pointers

Every completed audit updates:

- `projects/latest-audit.json`
- `projects/<site>/latest-audit.json`

These files are generated and ignored by Git. They exist so agents do not need to infer the newest timestamped folder.

## Source Mapping

`--repo` is an explicit, read-only source mapping mode. It scans bounded frontend/design-relevant files, excludes generated folders, writes `repo-analysis.json` and `source-candidates.json`, and refreshes `implementation-plan.json`, `patch-plan.md`, and `changed-files.json` with proposal data.

The workflow must not silently assume the current directory is the target website repository. If no source repo is supplied, the bundle still contains placeholder source-mapping artifacts that tell agents how to attach one.

## Business-Grade Visual Review

`report lint --strict` validates the technical bundle. `business-grade lint` validates the business-grade claim.

Without an imported `AgentVisualReview`, reports remain `automated_scan` or `agent_review_pending`. A repo-capable multimodal agent must inspect `report/contact-sheets/*.png` and the screenshots listed in `report/screenshot-manifest.json`, write a completed visual review JSON, then import it:

```bash
node apps/cli/dist/index.js review-pack build --report <audit-dir>
node apps/cli/dist/index.js agent-review import --report <audit-dir> --file agent-runs/<agent>/visual-review.json
node apps/cli/dist/index.js business-grade lint --report <audit-dir>
```

The workflow does not need additional API keys for this lane because the visual judgment is performed by the agent running the repo.
