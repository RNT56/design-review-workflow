# Schemas

Runtime schemas live in `packages/core/src/schemas`. This document summarizes the important contracts for agents and integrations.

## AuditConfig

Primary fields:

- `auditId`
- `mode`: `quick_scan` or `full_audit`
- `url`
- `maxPages`
- `language`
- `brandContext`
- `competitors`
- `viewports`
- `crawl`
- `interactions`
- `outputs`
- `modelRouter`
- `scoring`

## PageEvidence

Captured evidence includes:

- `pageId`
- `url`
- `normalizedUrl`
- `title`
- `language`
- `pageType`
- `businessImportance`
- `screenshots`
- `text`
- `structure`
- `cssSignals`
- `performance`
- `accessibility`

## Finding

Every final finding must include:

- `findingId`
- `title`
- `category`
- `severity`
- `priorityScore`
- `impact`
- `effort`
- `confidence`
- `evidence`
- `observation`
- `whyItMatters`
- `recommendation`
- `implementation`

## TicketRecommendation

Generated tickets are exportable objects, not external tickets:

- `title`
- `role`
- `priority`
- `effort`
- `sourceFindingIds`
- `problem`
- `goal`
- `scope`
- `acceptanceCriteria`
- `definitionOfDone`
- `evidenceRefs`

## Agent Bundle Files

Every completed audit writes machine-readable agent contracts under `report/`:

- `workflow-manifest.json`: repository contract, safety rules, commands, target metadata, artifact map, and quality gate snapshot
- `handoff.json`: closeout-ready summary, report paths, read order, top findings, and quality gate snapshot
- `evidence-index.json`: reviewed pages, screenshot paths, annotations, accessibility basics, and performance basics
- `evidence.jsonl`: line-delimited page, finding, and annotation evidence events
- `implementation-plan.json`: ticket-shaped implementation tasks with owners, acceptance criteria, evidence refs, and approval flags
- `actionability.json`: finding-level automation readiness and blockers
- `report-dashboard.json`: compact dashboard model for agents or UIs
- `repo-analysis.json`: read-only source repo framework/file inventory, or a placeholder when no repo is supplied
- `source-candidates.json`: per-finding candidate source files with confidence and reason
- `changed-files.json`: proposal-only changed-file queue derived from medium/high confidence candidates
- `route-templates.json`: reviewed URL/page-type grouping for route-level design work
- `visual-system.json`: observed color, background, font, size, and radius signals
- `experience-timing.json`: browser navigation-timing and optional Lighthouse-shaped summary
- `standards-registry.json`: design-review rule registry and risk boundaries
- `suppression-report.json`: non-destructive suppression ledger
- `design-benchmark.json`: machine-readable handoff readiness benchmark
- `design-benchmark.md`: human-readable handoff readiness benchmark
- `validation.json`: report-lint result
- `quality-gate.json`: compact pass/warn/fail gate

## Source Candidate

Source candidates are proposal data, not edits:

- `path`
- `kind`: `route`, `component`, `style`, `content`, `config`, `test`, or `unknown`
- `confidence`: `high`, `medium`, or `low`
- `reason`
- `score`

Agents must verify the candidate file against live evidence before editing and must run the target repository's own verification after changes.
