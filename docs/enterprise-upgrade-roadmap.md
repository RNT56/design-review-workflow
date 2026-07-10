# Enterprise Upgrade Roadmap

> Local tracking artifact. Do not stage or commit this file unless explicitly requested.

## Objective

Upgrade `design-review-workflow` into an enterprise-quality, local-first business-grade audit system while deferring hosted/team product layers and live enterprise integrations. The workflow must keep SEO analysis separate from `RNT56/SEO-workflow`, but it must support artifact-level references so design and SEO audits can be run independently or reviewed together.

The target product remains evidence-first:

```text
Evidence Capture
-> Structured Understanding
-> Specialized Reviews
-> Synthesis
-> QA Gate
-> Reports / Tickets / Exports
```

## Enterprise Readiness Definition

An audit can be described as enterprise-ready only when all of the following are true:

| Area | Requirement | Acceptance Gate |
| --- | --- | --- |
| Capture | Desktop and mobile pages, first viewport, full page, scroll reveal stabilized, and safe interaction states are captured. | `report lint --strict`, screenshot manifest coverage checks, interaction manifest checks. |
| Business-grade review | A valid `AgentVisualReview` is imported, or the workflow honestly reports `agent_review_pending` with provider/manual limitations. | `business-grade lint --report <audit-dir>`. |
| Evidence depth | Performance, accessibility detail, privacy/tracking signals, resources, request chains, and interaction evidence are generated without overclaiming legal compliance or SEO scope. | Enterprise artifact assertions and report lint. |
| QA | Unsupported claims, generic findings, duplicate issues, unknown screenshots, and TODO/template text fail gates. | Unit tests plus strict lints. |
| Deliverables | Markdown, HTML, PDF, JSON, review pack, contact sheets, executive summary, ticket-ready recommendations, and local exports are complete. | Export profile tests and checksum validation. |
| Operations | Runs are resumable where possible, errors are classified, retries are bounded, and monitor/CI gates are deterministic. | `npm run enterprise:verify`. |
| SEO seam | Related SEO workflow status is linked as evidence, not merged into design findings. | `related-workflows.json` schema and export tests. |

## Deferred Scope

The following remain explicitly out of scope for this local-first enterprise upgrade:

- Hosted multi-user storage, billing, tenancy, team roles, shared dashboards, and browser-based collaboration.
- Live Jira, Linear, GitHub Issues, Notion, Slack, Google Docs, S3, Google Drive, Dropbox, or warehouse writes.
- Full SEO auditing inside this repository.
- Legal WCAG, privacy, security, or compliance certification.
- Login-protected audits that require entering real personal data or completing purchases.
- Automatic competitor research without explicit user-provided competitor URLs or related artifact paths.

## Phase 0 - Documentation Checkpoint

| Task | Output | Acceptance |
| --- | --- | --- |
| Create roadmap docs | `docs/enterprise-upgrade-roadmap.md`, `docs/enterprise-architecture.md`, `docs/enterprise-task-ledger.md`, `docs/seo-workflow-interoperability.md` | Files exist locally, include "do not stage" note, and are not staged. |
| Map product boundaries | Deferred scope, non-goals, enterprise readiness definition | No doc claims hosted/team/live integration behavior. |
| Define artifact seams | Related workflow schema, business-grade mode semantics, enterprise artifact inventory | Docs describe commands, artifacts, failure modes, and gates. |

Verification:

```bash
git status --short
```

## Phase 1 - Turnkey Business-Grade Review

### Target Behavior

`run --business-grade --format json` should become a turnkey business-grade path:

- `--review-mode auto` attempts provider-backed multimodal visual review when credentials are configured.
- `--review-mode manual` builds the review pack and leaves the audit in `agent_review_pending`.
- `--review-mode hybrid` attempts provider-backed review and records that stakeholder/manual signoff is still recommended.
- Provider success automatically runs generate, validate, import, and `business-grade lint`.
- Provider absence or failure never creates false business-grade claims; it records a classified limitation and leaves a clear pending state.
- Raw provider output and validation diagnostics remain retained in the audit folder for inspection.

### Implementation Tasks

| Task | Files | Acceptance |
| --- | --- | --- |
| Add review mode CLI option | `apps/cli/src/index.ts` | `--review-mode auto|manual|hybrid` is available on `run`. |
| Add review mode schema | `packages/core/src/schemas/audit.ts` | Invalid modes fail early with useful errors. |
| Wire provider-backed lane | CLI run path plus existing agent review modules | Provider success imports `agent-visual-review.json` and reruns business-grade gate. |
| Classify provider failure | CLI closeout JSON and report metadata | Errors identify no-provider, auth/config, network/timeout, schema/validation, or unknown. |
| Preserve manual fallback | Run path and agent instructions | No-provider audits remain `agent_review_pending` and point to review-pack instructions. |
| Update handoff artifacts | `workflow-manifest.json`, `handoff.json`, `agent-instructions/*` | Downstream agents can tell whether review is complete, pending, failed, or hybrid signoff. |
| Add tests | CLI/core tests | Mock provider success, no-provider pending, provider failure, manual mode, hybrid mode. |

### Closeout Commands

```bash
node apps/cli/dist/index.js run <url> --business-grade --format json --review-mode auto
node apps/cli/dist/index.js agent-review validate --report <audit-dir> --file <visual-review.json>
node apps/cli/dist/index.js business-grade lint --report <audit-dir>
npm test -- --runInBand
```

## Phase 2 - Enterprise Evidence Depth

### Artifacts

| Artifact | Purpose | Compliance Boundary |
| --- | --- | --- |
| `report/performance-audit.json` | Browser timing, Core Web Vitals candidates, Lighthouse/run status, slow resource hints. | Do not claim backend profiling or full Lighthouse if Lighthouse did not run. |
| `report/accessibility-detail.json` | Axe basics, DOM label/form/button/link issues, contrast candidates when available. | Do not claim WCAG certification. |
| `report/privacy-tracking.json` | Third-party scripts, cookies/storage summary, trackers/cross-origin evidence, client-side risk signals. | Do not claim legal privacy compliance. |
| `report/resource-audit.json` | Largest assets, script/style/image counts, request-chain candidates, render-blocking candidates. | Do not claim bundle internals unless source maps or bundle analysis exist. |
| `report/interaction-states.json` | Modals, drawers, menus, tabs, accordions, carousels, popovers, filters, non-mutating validation states. | Do not submit forms, purchases, or personal data. |
| `report/enterprise-readiness.json` | Consolidated local readiness summary, missing gates, limitations, and next actions. | Must report pending/partial states honestly. |

### Implementation Tasks

| Task | Files | Acceptance |
| --- | --- | --- |
| Extend browser evidence model | Capture and extraction modules | Resource, privacy, accessibility, and interaction evidence is structured and stable. |
| Add derived report artifacts | `packages/core/src/report/*` | All enterprise JSON artifacts are written for normal runs. |
| Add lint requirements | `packages/core/src/validation/report-lint.ts` | Strict lint fails missing enterprise artifacts. |
| Update report UI | HTML/local dashboard | Evidence drawers link derived artifacts without overwhelming primary report. |
| Add tests | Capture/report lint/export tests | Fixture reports prove artifact presence and schema shape. |

### Closeout Commands

```bash
node apps/cli/dist/index.js report lint <audit-dir> --strict
npm test -- packages/core/src/validation/report-lint.test.ts
```

## Phase 3 - SEO-Workflow Artifact Seam

### Target Behavior

The design workflow can link to SEO workflow outputs without duplicating SEO analysis:

```bash
node apps/cli/dist/index.js run https://example.com \
  --business-grade \
  --related-workflow seo:/path/to/seo-audit
```

The design report writes `report/related-workflows.json` with:

- Related workflow kind, label, path, manifest/report paths, status, score, and limitations.
- Validation warnings when the referenced artifact is missing, unreadable, or unsupported.
- Export inclusion in `review`, `full`, and `repo-import` profiles.

### Implementation Tasks

| Task | Files | Acceptance |
| --- | --- | --- |
| Parse related workflow specs | CLI and schema | `kind:path` syntax supports `seo` initially and rejects unsafe/unknown syntax. |
| Inspect related artifacts | Core report helper | Reads metadata opportunistically without depending on SEO-workflow internals. |
| Generate related-workflows artifact | Report bundle | `report/related-workflows.json` exists on all runs, with empty array when unused. |
| Surface linked status | HTML/Markdown/export manifests | Reports say "linked SEO evidence" and do not merge SEO findings. |
| Add export coverage | `packages/core/src/report/export.ts` | Related workflow metadata is included and local paths are redacted for repo import. |
| Add tests | CLI/report/export tests | Valid SEO path, missing path, and malformed specs are covered. |

## Phase 4 - Evals And Release Gates

### Fixture Corpus

Create and maintain fixture sites for:

- SaaS landing/product.
- Portfolio.
- Ecommerce.
- Local service.
- Blog/editorial.
- Docs/knowledge base.
- Public dashboard/product surface.
- Interaction-heavy page with dialogs, drawers, filters, menus, carousels, accordions, tabs, and validation states.
- Performance-heavy page with large media, third-party scripts, blocking resources, and delayed reveal animations.
- Accessibility-issue page with missing labels, poor heading order, weak button names, and color/contrast candidates.

### Eval Commands

| Command | Purpose |
| --- | --- |
| `npm run enterprise:verify` | Typecheck, unit/integration tests, build, doctor, then a full ten-route local fixture audit. |
| `node apps/cli/dist/index.js enterprise fixtures --run` | Execute the local SaaS-through-accessibility fixture corpus and strict bundle assertions. |
| `node apps/cli/dist/index.js enterprise verify --report <audit-dir>` | Verify report completeness, artifact shape, screenshot coverage, and business-grade status. |
| `node apps/cli/dist/index.js compare <baseline> <candidate>` | Regression comparison for compatible snapshots. |
| `node apps/cli/dist/index.js business-grade lint --report <audit-dir>` | Enforce imported visual review quality. |

### Eval Gates

| Gate | Must Check |
| --- | --- |
| Completeness | Required files, checksums, report bundle shape, export profiles. |
| Visual review quality | Schema validity, evidence references, visual specificity, unsupported claims, actionability. |
| Capture coverage | First viewport, full page, mobile/desktop, interaction states, review pack sheet mappings. |
| Scoring drift | Require compatible scoring rubric, target, scope, viewport and capture contracts before score deltas. |
| False positives | Track stable finding fingerprints; require suppression reasons, owners and expiry state. |
| Provider quality | Validate model output against schema, screenshot references, TODO text, overclaims, and missing recommendations. |

## Phase 5 - Client-Grade Deliverables

| Deliverable | Content |
| --- | --- |
| Executive summary | Site readiness, top opportunities, risk summary, evidence-linked highlights, limitations. |
| Stakeholder recommendations | Prioritized owner-ready action plan with acceptance criteria and impact framing. |
| Evidence-linked issue trail | Grouped root cause, screenshots, page evidence, affected routes, recommended fix path. |
| Before/after comparison | Baseline/candidate changes, score deltas, screenshot diffs where compatible. |
| Branded export profile | Local-only export profile with client-safe naming, optional logo/brand context, checksums. |
| Repo-import handoff | Redacted local source mapping, patch plan, changed-file proposal, and implementation instructions. |

Acceptance:

- Reports remain useful when opened as static files.
- Raw screenshot drawers stay collapsed by default.
- All evidence links resolve locally.
- Exports include manifests and checksums.
- Client-safe exports redact local absolute paths by default.

## Phase 6 - Local Operations

| Capability | Requirement | Boundary |
| --- | --- | --- |
| Resumable runs | Audit state captures completed steps and failure point. | Re-run can resume safe idempotent steps; raw screenshots remain immutable. |
| Retry policies | Capture/provider/export retries are bounded and classified. | Never infinite retry; never hide failed evidence. |
| Timeout classification | Navigation, render readiness, provider, export, and report timeouts are distinct. | Closeout JSON lists exact class and step. |
| Monitor launch gates | Configurable thresholds fail CI when scores regress or high-priority issues appear. | No hosted scheduler. |
| Privacy redaction | Exports redact absolute paths, secrets, cookies, and sensitive payloads. | Keep local internal artifacts inspectable unless retention says otherwise. |
| Retention controls | Configurable screenshot/provider-payload/export retention policy. | Defaults preserve evidence; destructive cleanup requires explicit command. |

## Risks And Controls

| Risk | Control |
| --- | --- |
| Provider hallucination | Strict `AgentVisualReview` schema, screenshot ID validation, unsupported claim checks. |
| False business-grade claims | `business-grade lint` remains authoritative; `agent_review_pending` state is explicit. |
| SEO scope creep | Link SEO artifacts only; do not import SEO findings into design findings. |
| Overwhelming reports | Executive summary first, evidence trails linked, raw evidence collapsed. |
| Flaky browser capture | Render readiness stabilization, deterministic retries, classified failures, fixture smoke tests. |
| Sensitive data leakage | Redaction defaults for exports, no real form submissions, local-only storage. |
| Eval drift | Fixture corpus, snapshot shape tests, score drift thresholds. |

## Definition Of Done

The enterprise local upgrade is complete when:

1. Documentation checkpoint exists and remains unstaged unless explicitly requested.
2. `run --business-grade --format json --review-mode auto` completes provider-backed import when credentials exist and reports pending state when they do not.
3. Enterprise artifacts are generated for normal report bundles and enforced by strict lint.
4. Related SEO workflow artifacts can be linked without merging SEO findings.
5. Enterprise verify/eval gates exist and are runnable locally.
6. Export profiles include new metadata and checksums.
7. Monitor/CI gates are deterministic and support thresholds.
8. Verification passes:

```bash
npm run typecheck
npm test
npm run build
npm run doctor
npm run enterprise:verify
```
