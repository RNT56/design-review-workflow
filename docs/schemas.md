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
- `source`: `deterministic`, `agent_visual`, or `merged`
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

## AgentVisualReview

Business-grade reports require an imported visual review from the repo-capable multimodal agent running the workflow:

- `schemaVersion`: `design-review-workflow.agent-visual-review.v1`
- `reviewer`
- `reviewedAt`
- `auditId`
- `designVerdict`: readiness, style/taste, audience fit, brand fit, strongest qualities, weakest risks, redesign direction, rationale, confidence, limitations
- `screenshotsReviewed`
- `pageReviews`: one completed review per captured page, covering first viewport, hierarchy, composition, navigation, CTA clarity, mobile, trust/proof, visual-system coherence, accessibility basics, style/taste, and redesign advice
- `visualFindings`: defect-style visual findings when evidence supports them
- `redesignActions`: prioritized evidence-linked redesign recommendations
- `strengths`
- `risks`
- `confidence`
- `limitations`

All screenshot references must match IDs or paths in `report/screenshot-manifest.json`. The import step rejects unknown screenshot references, TODO/template text, shallow generic verdicts, unsupported analytics/user-behavior/revenue/heatmap/competitor claims, and missing redesign advice. A strict import needs at least 3 redesign actions unless `designVerdict.readiness` is `no_major_redesign_needed` with detailed rationale.

## ScreenshotManifest

`report/screenshot-manifest.json` is the raw screenshot inventory plus derived review-pack metadata:

- `id`
- `pageId`
- `url`
- `viewport`
- `kind`
- `path`
- `pixelWidth` and `pixelHeight` read from the actual PNG
- `aspectRatio`
- `displayRole`: `first_viewport`, `full_page_flow`, `state_capture`, `annotated`, or `raw`
- `pageTitle`
- `pageType`
- `groups`: page, viewport, kind, display role, and issue memberships when applicable
- `sheetRefs`: generated contact-sheet paths that include this screenshot

Raw screenshots remain unchanged. Contact sheets and gallery files are derived surfaces over these entries.

## ReviewPackManifest

`report/agent-review-pack/review-pack-manifest.json` is the visual-review source of truth:

- `schemaVersion`
- `auditId`
- `generatedAt`
- `gallery.path`
- `recommendedReviewOrder`
- `sheets`
- `statistics`

Agents should follow `recommendedReviewOrder`: first viewports, grouped issue evidence, page-flow sheets, then raw screenshots. `contact-sheets/all-pages.png` is a compatibility overview, not the primary inspection artifact.

## GroupedIssue

Grouped issues merge duplicate deterministic and agent visual findings into root-cause recommendations:

- `issueId`
- `title`
- `category`
- `severity`
- `priorityScore`
- `source`
- `affectedPages`
- `sourceFindingIds`
- `sourceReviewIds`
- `evidenceRefs`
- `observation`
- `recommendation`
- `acceptanceCriteria`

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
- `business-grade-gate.json`: pass/fail gate for business-grade claims
- `grouped-issues.json`: root-cause issue inventory
- `screenshot-manifest.json`: page screenshot IDs, paths, actual PNG dimensions, display roles, groups, sheet refs, and absolute local paths for agent review
- `agent-review-pack/review-pack-manifest.json`: generated sheet inventory and recommended visual review order
- `agent-review-pack/gallery/index.html`: static filterable screenshot and sheet gallery
- `contact-sheets/first-viewports.png`: first-viewport overview sheet
- `contact-sheets/pages/*.png`: per-page first-viewport and page-flow sheets
- `contact-sheets/issues/*.png`: grouped issue evidence sheets
- `agent-visual-review.json`: imported multimodal agent review when present
- `../index.html`: primary audit-root static dashboard; no server required
- `hosted/index.html`: secondary standalone static report with copied screenshot assets

## Export Manifest

When `export --profile review|full|repo-import` runs, the audit root receives:

- `export-manifest.json`: package metadata with target URL, audit ID, profile, format, artifact list, SHA-256 hashes, validation status, privacy notes, and license notice pointer
- `checksums.sha256`: hashes for exported package entries
- `exports/*.zip` or a directory export

Export packages also contain `LICENSE-NOTICE.md`. Local absolute paths are redacted from text artifacts by default unless explicitly disabled.

## Source Candidate

Source candidates are proposal data, not edits:

- `path`
- `kind`: `route`, `component`, `style`, `content`, `config`, `test`, or `unknown`
- `confidence`: `high`, `medium`, or `low`
- `reason`
- `score`

Agents must verify the candidate file against live evidence before editing and must run the target repository's own verification after changes.
