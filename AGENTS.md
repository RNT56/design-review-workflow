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
- axe-core accessibility basics where injection succeeds
- Browser navigation-timing performance basics

The following are planned seams, not completed product claims unless code and tests prove otherwise:

- External LLM-backed review agents
- Provider-specific model quality claims
- Full Lighthouse navigation reports
- True visual regression compare
- Figma analysis
- Login-area audits
- SaaS/cloud multi-user storage
- Jira, Linear, GitHub Issues, Notion, Slack, or Google Docs export
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
- The QA gate must remove or downgrade unsupported, generic, duplicate, or overclaiming findings.
- Any future LLM reviewer must produce the same `Finding` schema and pass the same deterministic QA gate.
- Use local files and `.env` for credentials. Never commit secrets.
- Keep generated `projects/*/audits/*` output out of Git except curated examples.

## Verification Expectations

Before closing implementation work, run the strongest feasible local checks:

- `npm run typecheck`
- `npm test`
- `npm run build`
- At least one smoke audit against a small local or public page when browser dependencies are installed

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
- Lighthouse navigation summaries
- Competitor benchmark mode hardening
- Compare command
- Better screenshot annotations
- External ticket/document exports
- SQLite project index

V2+:

- Figma prototype review
- CMS/platform-specific recommendations
- Design token export
- Presentation export
- Cloud/team product
- Continuous monitoring and launch gates
