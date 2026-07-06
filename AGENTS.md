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

Required outputs for the MVP:

- Workflow manifest
- Agent handoff JSON
- Validation and quality-gate JSON
- Markdown report
- HTML report
- PDF report
- JSON automation export
- Scorecard
- Prioritized findings
- Screenshot references
- Redesign briefing
- Ticket-ready recommendations

## Current Implementation Boundary

The implemented MVP is deterministic and local-first:

- TypeScript monorepo
- CLI audit runner
- Local web UI
- Project-folder storage under `projects/`
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
- Local project index under `projects/index.json`
- SQLite-backed local project index under `projects/index.sqlite` with JSON fallback
- Regression compare command with score deltas, finding deltas, and screenshot pixel diffs where screenshots are compatible
- Environment-configured LLM provider adapters for future reviewer use
- Read-only Figma evidence fetch command gated by `FIGMA_TOKEN`
- Local monitor runs from YAML/JSON configuration
- One-command agent runner via `scripts/agent-run.sh` and `npm run agent`
- Primary `run` command for audit, validation, and agent handoff
- Strict report lint, quality gate files, generated workflow manifest, handoff JSON, evidence index, implementation plan, and agent handoff instructions
- Latest-audit pointers under `projects/latest-audit.json` and `projects/<site>/latest-audit.json`
- axe-core accessibility basics where injection succeeds
- Browser navigation-timing performance basics plus Lighthouse summaries where local Chrome/Lighthouse succeeds

The following are planned seams, not completed product claims unless code and tests prove otherwise:

- External LLM-backed review agents
- Provider-specific model quality claims
- Continuous scheduled monitoring
- Figma analysis beyond read-only evidence fetch
- Login-area audits
- SaaS/cloud multi-user storage
- Live Jira, Linear, GitHub Issues, Notion, Slack, or Google Docs writes
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

## Agentic Workflow Contract

Primary fresh-clone command:

```bash
bash scripts/agent-run.sh <public-url>
```

Primary built CLI command:

```bash
node apps/cli/dist/index.js run <public-url>
```

Every completed audit must produce a self-contained agent bundle under `report/`:

- `workflow-manifest.json`
- `handoff.json`
- `validation.json`
- `quality-gate.json`
- `agent-execution-plan.md`
- `implementation-plan.json`
- `evidence-index.json`
- `actionability.json`
- `findings.json`
- `score.json`
- `report-dashboard.json`
- `agent-instructions/README.md`
- `agent-instructions/codex.md`
- `agent-instructions/claude-code.md`
- `agent-instructions/opencode.md`
- `agent-instructions/openclaw.md`
- `agent-instructions/hermes.md`

The report bundle is the stable interface for downstream agents. Agents should read `workflow-manifest.json` first, then `handoff.json`, then `agent-execution-plan.md`.

## Repository Layout

```text
apps/
  cli/          Command-line entrypoint.
  web/          Local web UI and local API server.
packages/
  core/         Capture, schemas, storage, review, synthesis, reports.
docs/           Architecture, scoring, schemas, prompts, eval plan.
examples/       Example audit config.
projects/       Local audit outputs. Keep generated audit folders untracked.
```

## Implementation Rules

- Prefer deterministic capture and structured schemas over free-form prose.
- Keep model names and provider choices in config/adapters, never hard-coded through core logic.
- Save intermediate artifacts in the audit project folder so failures are inspectable.
- Reports must reference existing screenshot/evidence files only.
- Agent handoff files must be generated under `report/agent-instructions/`.
- `workflow-manifest.json` and `handoff.json` must be machine-readable and must not require scraping Markdown.
- Every normal audit must write `validation.json` and `quality-gate.json`.
- `report lint --strict` must fail unsupported report bundles.
- The QA gate must remove or downgrade unsupported, generic, duplicate, or overclaiming findings.
- Any future LLM reviewer must produce the same `Finding` schema and pass the same deterministic QA gate.
- Use local files and `.env` for credentials. Never commit secrets.
- Keep generated `projects/*/audits/*` output out of Git except curated examples.
- Keep `projects/index.sqlite`, `projects/index.json`, and `projects/figma/` out of Git.

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
