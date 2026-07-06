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
