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
- Browser navigation-timing performance basics and Lighthouse summaries where local Chrome succeeds
- Rule-based page classification
- Criteria-backed deterministic reviewer findings
- Synthesis, dedupe, QA validation, scorecard, quick wins
- Redesign briefing
- Ticket-ready recommendation objects
- Local ticket export bundle
- Manual competitor benchmark output
- Basic annotated screenshots
- Compare command with score/finding deltas and compatible screenshot diffs
- Markdown, HTML, PDF, and JSON exports

## MVP Gaps To Close Before Internal Production Use

- Run the smoke suite against a curated local/public test set.
- Calibrate findings and score penalties against human review.
- Harden crawler behavior for consent banners, SPAs, and failed pages.
- Add stronger mobile-specific extraction instead of desktop-derived tap-target heuristics.
- Add more criteria-library coverage for website and page types.

## Planned V1

- LLM provider adapters used for specialized reviewers
- Prompt versioning and model comparison
- Competitor benchmark hardening
- Regression compare with screenshot diffs
- External ticket/document exports
- SQLite project index

## Planned V2+

- Figma prototype review
- CMS/platform-specific recommendations
- Design token export
- Presentation export
- Cloud/team product
- Continuous monitoring and launch gates
