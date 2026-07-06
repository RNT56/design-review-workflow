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

Configured providers are detected only when both API key and model env vars are set:

- `OPENAI_API_KEY` and `OPENAI_MODEL`
- `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`
- `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`
- `GEMINI_API_KEY` and `GEMINI_MODEL`

## Figma

Figma is still an external credentialed workflow. Planned local contract:

- Accept Figma file URL or file key.
- Store fetched file/node evidence under `extracted/figma/`.
- Generate findings through the same schema and QA gate.
- Never publish screenshots or design assets externally by default.

Implemented read-only command:

```bash
node apps/cli/dist/index.js figma fetch <file-key-or-url> --node <node-id>
```

This writes evidence under `projects/figma/` and requires `FIGMA_TOKEN`.

## Monitoring

Implemented local monitor command:

```bash
node apps/cli/dist/index.js monitor init monitor.yaml
node apps/cli/dist/index.js monitor run monitor.yaml
```

Monitor runs create normal audit snapshots and compare against the latest prior indexed audit for the same URL when one exists. Scheduling is intentionally external for now, for example cron, launchd, or CI.
