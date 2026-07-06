# Agent Compatibility

The workflow should be usable by repo-capable agents such as Codex, Claude Code, opencode, OpenClaw, Hermes, and similar coding agents.

## Contract

Inputs:

- Workflow repo
- Public URL
- Optional context flags

Output:

- Local audit bundle
- Workflow manifest
- Handoff JSON
- Strict report validation result
- Quality gate JSON
- Agent execution plan
- Implementation plan
- Evidence index
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
node apps/cli/dist/index.js workflow --format json
node apps/cli/dist/index.js latest [site-or-url]
node apps/cli/dist/index.js doctor
node apps/cli/dist/index.js report lint <audit-dir> --strict
node apps/cli/dist/index.js plan build --report <audit-dir>
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
- `report/implementation-plan.json`
- `report/validation.json`
- `report/quality-gate.json`
- `report/priority-action-plan.md`
- `report/next-actions.md`
- `report/agent-execution-plan.md`
- `report/agent-instructions/*.md`

## Latest Audit Pointers

Every completed audit updates:

- `projects/latest-audit.json`
- `projects/<site>/latest-audit.json`

These files are generated and ignored by Git. They exist so agents do not need to infer the newest timestamped folder.
