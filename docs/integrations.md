# Integrations

The repository now generates local artifacts that are ready for external systems without creating side effects.

## Ticketing

Each audit writes:

- `exports/ticket-backlog.json`
- `exports/github-issues.md`
- `exports/linear-import.csv`
- `exports/jira-import.csv`

These files are intentionally local. Live GitHub, Linear, or Jira writes require explicit credentials and should be added as separate commands with confirmation.

## Model Providers

The core package exposes `ModelRouter` and `LlmProvider`. Future provider-backed reviewers must:

- Produce the same `Finding` schema as deterministic reviewers.
- Save raw agent runs under `agent-runs/`.
- Pass deterministic QA validation before reaching reports.
- Keep provider credentials in `.env`, never in code or audit output.

## Figma

Figma is still an external credentialed workflow. Planned local contract:

- Accept Figma file URL or file key.
- Store fetched file/node evidence under `extracted/figma/`.
- Generate findings through the same schema and QA gate.
- Never publish screenshots or design assets externally by default.
