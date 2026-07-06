# Agent Compatibility

The workflow should be usable by repo-capable agents such as Codex, Claude Code, opencode, OpenClaw, Hermes, and similar coding agents.

## Contract

Inputs:

- Workflow repo
- Public URL
- Optional context flags

Output:

- Local audit bundle
- Strict report validation result
- Agent execution plan
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
node apps/cli/dist/index.js doctor
node apps/cli/dist/index.js report lint <audit-dir> --strict
node apps/cli/dist/index.js plan build --report <audit-dir>
node apps/cli/dist/index.js compare <before-audit-dir> <after-audit-dir>
```

## Stable Bundle Files

- `report/index.md`
- `report/index.html`
- `report/findings.json`
- `report/score.json`
- `report/report-dashboard.json`
- `report/actionability.json`
- `report/validation.json`
- `report/quality-gate.json`
- `report/priority-action-plan.md`
- `report/agent-execution-plan.md`
- `report/agent-instructions/*.md`
