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
- `implementation-plan.json`: ticket-shaped implementation tasks with owners, acceptance criteria, evidence refs, and approval flags
- `actionability.json`: finding-level automation readiness and blockers
- `report-dashboard.json`: compact dashboard model for agents or UIs
- `validation.json`: report-lint result
- `quality-gate.json`: compact pass/warn/fail gate
