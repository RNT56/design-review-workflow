# Architecture

The system is intentionally built as an evidence pipeline, not as a single agent that looks at a screenshot and writes prose.

```text
CLI / Local Web UI
  -> Audit Orchestrator
  -> Evidence Capture
  -> Structured Understanding
  -> Reviewer Agents
  -> Synthesis
  -> QA Gate
  -> Report Export
```

## Layers

### Audit Orchestrator

Interprets config, creates the project folder, coordinates capture, stores intermediate state, runs review, and writes reports.

### Evidence Capture

Uses Playwright to render public pages. It stores screenshots, page inventory, extracted text, DOM summaries, CSS signals, accessibility basics, and performance basics.

### Structured Understanding

Classifies pages by URL and visible evidence. Unknown pages remain `unknown` with lower confidence instead of being forced into a false category.

### Reviewer Agents

The MVP ships deterministic reviewers that emit the same structured `Finding` shape future LLM agents must emit. This lets the product work locally now while preserving the model-router seam.

### Synthesis And QA

Findings are deduplicated, scored, validated against evidence, and downgraded or removed if unsupported or generic.

### Reports

The report layer writes:

- `report/report.json`
- `report/report.md`
- `report/report.html`
- `report/report.pdf`
- `report/executive-summary.md`

## Storage Contract

Each audit is a reproducible local snapshot:

```text
projects/<site>/audits/<timestamp>-<mode>/
  audit-config.json
  audit-state.json
  crawl-map.json
  page-inventory.json
  screenshots/
    desktop/
    mobile/
    states/
  extracted/
    pages/
  agent-runs/
  synthesis/
  report/
```

## Extension Points

- `ModelRouter` and `LlmProvider` interfaces for future provider-backed agents
- Criteria library for review rules and scoring calibration
- Report generator boundaries for external document exports
- Project storage boundary for future SQLite/cloud indexing
