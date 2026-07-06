# Agentic Website Design Review

Local-first website design review workflow for evidence-backed UX, visual design, conversion, mobile, accessibility-basic, and performance-perception audits.

The repository starts with a deterministic MVP: it crawls public pages, captures desktop and mobile evidence, extracts page signals, creates structured findings, validates them, scores the site, and exports Markdown, HTML, PDF, and JSON reports.

## Quick Start

```bash
npm install
npx playwright install chromium
npm run build
npm run audit -- https://example.com --mode quick
```

For agent handoff from a fresh clone:

```bash
bash scripts/agent-run.sh https://example.com
```

Audit outputs are written to `projects/<site>/audits/<timestamp>-<mode>/`.

Run the local UI:

```bash
npm run web
```

Then open the printed local URL.

## CLI

```bash
npm run audit -- https://example.com --mode full --max-pages 15 --pdf --html --json
npm run quick -- https://example.com
npm run full -- https://example.com --competitor https://competitor.example
npm run validate -- ./projects/example-com/audits/latest/report/report.json
npm run build
node apps/cli/dist/index.js compare ./projects/example-com/audits/before ./projects/example-com/audits/after
npm run build
node apps/cli/dist/index.js monitor init monitor.yaml
node apps/cli/dist/index.js monitor run monitor.yaml
node apps/cli/dist/index.js providers status
node apps/cli/dist/index.js doctor
node apps/cli/dist/index.js report lint ./projects/example-com/audits/<audit-id> --strict
node apps/cli/dist/index.js plan build --report ./projects/example-com/audits/<audit-id>
```

## What The MVP Does

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
- Competitor benchmark output when competitor URLs are supplied
- Local ticket export files for GitHub Issues, Linear, Jira, and JSON backlog
- Audit compare artifacts with subscore deltas and screenshot diffs where dimensions match
- SQLite-backed local audit index with JSON fallback
- Local monitor runs from YAML/JSON config
- Read-only Figma evidence fetch command when `FIGMA_TOKEN` is configured
- Environment-configured model provider adapters
- One-command agent runner for repo-capable agents
- Strict report lint and quality-gate files
- Agent execution plan and agent-specific instructions

## What It Does Not Claim Yet

- No login-area audits
- No purchases or personal-data submission
- No full WCAG, SEO, analytics, privacy, bundle, or server-performance audit
- No production LLM provider calls yet
- No true Lighthouse report yet
- No Figma or external ticketing integrations yet
- No live writes to external ticketing systems without explicit credentials and a dedicated command
- No model call is made unless both provider API key and model env vars are configured

See [AGENTS.md](./AGENTS.md) for the source-of-truth implementation contract.
See [AGENT-RUNBOOK.md](./AGENT-RUNBOOK.md) for handing this workflow to another agent.

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
```

The generated `projects/*/audits/*` folders are ignored by Git. Keep only intentional samples under `examples/`.
