# Development Plan

The attached blueprint is sound as a product architecture, but it spans MVP through later product generations. This repository therefore treats the plan as staged work.

## MVP Now

Implemented or targeted in the current codebase:

- TypeScript monorepo
- CLI and local web UI
- Local project-folder storage
- Public URL audit intake
- Same-domain crawl up to configured max pages
- Desktop and mobile Playwright screenshots
- DOM, text, links, buttons, forms, sections, components, CSS signals
- Basic interaction capture for common mobile navigation state
- axe-core accessibility basics when injection succeeds
- Browser navigation-timing performance basics, with Lighthouse-grade audits left to a dedicated external performance pass
- Rule-based page classification
- Criteria-backed deterministic reviewer findings
- Synthesis, dedupe, QA validation, scorecard, quick wins
- Redesign briefing
- Ticket-ready recommendation objects
- Local ticket export bundle
- Manual competitor benchmark output
- Basic annotated screenshots
- Compare command with score/finding deltas and compatible screenshot diffs
- SQLite-backed local audit index with JSON fallback
- Local monitor command for repeated checks and comparisons
- Read-only Figma evidence fetch seam
- Environment-configured model provider adapters
- Markdown, HTML, PDF, and JSON exports
- Agent-native report bundle with manifest, handoff, validation, quality gate, actionability, implementation plan, and agent-specific instructions
- Design workflow artifacts: evidence JSONL, route templates, visual-system inventory, experience timing, standards registry, suppression ledger, benchmark, patch plan, changed-file proposal, manual actions, and remaining user decisions
- Read-only `--repo` source mapping for candidate files and source-backed implementation planning
- Existing-audit utilities: `report lint`, `plan build`, `benchmark`, `standards update`, and non-destructive `suppressions`
- Local web UI cockpit for overview, findings, implementation queue, evidence, and agent bundle links

## MVP Gaps To Close Before Internal Production Use

- Run the smoke suite against a curated local/public test set.
- Calibrate findings and score penalties against human review.
- Harden crawler behavior for consent banners, SPAs, and failed pages.
- Add stronger mobile-specific extraction instead of desktop-derived tap-target heuristics.
- Add more criteria-library coverage for website and page types.
- Wire model-backed reviewers into the QA gate after provider-specific evals exist.
- Promote local monitor configs into a scheduled service or CI workflow.
- Add a curated cross-framework fixture set for source candidate calibration.

## Planned V1

- LLM provider adapters used for specialized reviewers
- Prompt versioning and model comparison
- Competitor benchmark hardening
- External ticket/document exports
- Scheduled monitor service or CI launch gate

## Planned V2+

- Figma prototype review
- CMS/platform-specific recommendations
- Design token export
- Presentation export
- Cloud/team product
- Continuous monitoring and launch gates
