# Enterprise Task Ledger

> Local tracking artifact. Do not stage or commit this file unless explicitly requested.

## Status Legend

| Status | Meaning |
| --- | --- |
| Planned | Not started. |
| In Progress | Implementation started in the local working tree. |
| Blocked | Needs external input, credentials, or deferred scope decision. |
| Verification Pending | Code exists but gates have not passed. |
| Done | Implemented, tested, and documented. |

## Workstreams

| ID | Workstream | Goal |
| --- | --- | --- |
| WS0 | Documentation checkpoint | Maintain this local roadmap set as the implementation tracker. |
| WS1 | Business-grade automation | Make provider-backed visual review turnkey with honest fallback states. |
| WS2 | Enterprise evidence | Generate deeper performance, accessibility, privacy, resource, and interaction artifacts. |
| WS3 | SEO artifact seam | Link SEO-workflow outputs without merging products. |
| WS4 | Evals and release gates | Add enterprise verification and fixture/eval coverage. |
| WS5 | Client deliverables | Improve executive and stakeholder-ready outputs. |
| WS6 | Local operations | Add resumability, classification, monitor thresholds, redaction, and retention controls. |

## Task Table

| ID | WS | Task | Owner Role | Deliverable | Acceptance Gate | Status |
| --- | --- | --- | --- | --- | --- | --- |
| ENT-000 | WS0 | Create uncommitted roadmap docs | Repo agent | Four docs in `/docs` | `git status --short` shows files unstaged | Done |
| ENT-001 | WS1 | Add `reviewMode` schema | Core engineer | `auto`, `manual`, `hybrid` enum | Typecheck and invalid mode tests | Done |
| ENT-002 | WS1 | Add CLI `--review-mode` | CLI engineer | Run command option | CLI help and mode parsing test | Done |
| ENT-003 | WS1 | Automate provider lane | CLI/core engineer | Generate, validate, import, lint sequence | Mock provider success integration test | Done |
| ENT-004 | WS1 | Classify provider errors | CLI/core engineer | Provider review closeout object | No-provider and bad-output tests | Done |
| ENT-005 | WS1 | Update handoff metadata | Report engineer | Handoff and manifest show review state | Snapshot/assertion tests | Done |
| ENT-006 | WS1 | Retain raw provider output | Model integration engineer | Raw output and validation paths | Provider fixture test | Done |
| ENT-007 | WS2 | Add performance audit artifact | Capture/report engineer | `report/performance-audit.json` | Report lint and schema assertion | Done |
| ENT-008 | WS2 | Add accessibility detail artifact | Capture/report engineer | `report/accessibility-detail.json` | Axe/basic DOM fixture test | Done |
| ENT-009 | WS2 | Add privacy/tracking artifact | Capture/report engineer | `report/privacy-tracking.json` | Third-party script/cookie fixture test | Done |
| ENT-010 | WS2 | Add resource audit artifact | Capture/report engineer | `report/resource-audit.json` | Large-resource fixture test | Done |
| ENT-011 | WS2 | Harden interaction evidence | Capture engineer | Safe interactions across common controls | Modal/tabs/menu/carousel fixture smoke | Done |
| ENT-012 | WS2 | Add enterprise readiness artifact | Report engineer | `report/enterprise-readiness.json` | Enterprise verify reads it | Done |
| ENT-013 | WS2 | Add strict lint coverage | QA engineer | Required enterprise file assertions | `report lint --strict` test | Done |
| ENT-014 | WS3 | Parse `--related-workflow` | CLI engineer | `kind:path` parser | Valid/malformed spec tests | Done |
| ENT-015 | WS3 | Generate related workflow metadata | Report engineer | `report/related-workflows.json` | Missing and available path tests | Done |
| ENT-016 | WS3 | Surface SEO linked status | Report engineer | Markdown/HTML/export references | Snapshot/report test | Done |
| ENT-017 | WS3 | Include metadata in exports | Export engineer | Review/full/repo-import include related metadata | Export tests and checksum validation | Done |
| ENT-018 | WS4 | Add enterprise verify command | CLI/core engineer | `enterprise verify --report <dir>` | Passing/failing fixture tests | Done |
| ENT-019 | WS4 | Add `npm run enterprise:verify` | Build engineer | Package script | Local command runs deterministic gate | Done |
| ENT-020 | WS4 | Build fixture corpus | QA engineer | Fixture manifest and expected assertions | Corpus manifest test | Done |
| ENT-021 | WS4 | Add provider quality evals | QA/model engineer | Schema/evidence/claim/actionability checks | Bad-provider fixtures fail | Done |
| ENT-022 | WS4 | Add score drift eval | QA engineer | Compare thresholds | Enterprise verify baseline option | Done |
| ENT-023 | WS5 | Generate executive summary | Report engineer | `report/executive-summary.md` | Export and link tests | Done |
| ENT-024 | WS5 | Generate stakeholder recommendations | Report engineer | `report/stakeholder-recommendations.md` | Acceptance criteria included | Done |
| ENT-025 | WS5 | Generate evidence-linked issue trail | Report engineer | Grouped issue trail with screenshot links | Unknown screenshots fail lint | Done |
| ENT-026 | WS5 | Add before/after comparison section | Compare/report engineer | Comparison artifact and report section | Compatible snapshot test | Done |
| ENT-027 | WS5 | Add branded local export metadata | Export engineer | Optional branding metadata in export manifest | Export profile test | Done |
| ENT-028 | WS6 | Add resumable audit step state | Core engineer | Resume metadata in `audit-state.json` | Failure state classification | Done |
| ENT-029 | WS6 | Add retry policy config | Core engineer | Bounded retries per capture/provider/export step | Retry settings and provider/capture use | Done |
| ENT-030 | WS6 | Add timeout classification | Core engineer | Distinct timeout classes in closeout JSON | Classified failures | Done |
| ENT-031 | WS6 | Add monitor thresholds | Monitoring engineer | Score/finding/launch-gate thresholds | Monitor test | Done |
| ENT-032 | WS6 | Add privacy redaction controls | Export/report engineer | Redaction config and tests | Path/cookie/secret redaction defaults | Done |
| ENT-033 | WS6 | Add retention controls | Storage engineer | Retention settings and cleanup plan | Non-destructive dry-run test | Done |
| ENT-034 | All | Update docs and AGENTS contract after code lands | Repo maintainer | Stable docs reflect implementation | User approval to commit docs | Done |

## Acceptance Checklist

- [x] Roadmap docs exist and remain unstaged.
- [x] `--review-mode` is available and validated.
- [x] Business-grade auto mode imports provider review when credentials exist.
- [x] No-provider runs remain honest `agent_review_pending`.
- [x] Provider errors are classified in closeout JSON.
- [x] Enterprise evidence artifacts are always generated for report bundles.
- [x] `report/related-workflows.json` is generated for all runs.
- [x] SEO artifacts are linked only as related evidence.
- [x] Exports include related workflow metadata and enterprise artifacts.
- [x] `enterprise verify` fails incomplete or overclaiming bundles.
- [x] `npm run enterprise:verify` exists.
- [x] Monitor thresholds support deterministic CI launch gates.
- [x] Client deliverables include executive summary and stakeholder recommendations.
- [x] Capture/provider retries, classified failures, and audit-state step metadata are implemented.
- [x] Export branding metadata and sensitive-value redaction controls are implemented.
- [x] Retention planning is implemented as a non-destructive dry run.
- [x] Typecheck, tests, build, doctor, and enterprise verify pass.

## Verification Matrix

| Feature | Unit | Integration | Smoke | Manual Review |
| --- | --- | --- | --- | --- |
| Review modes | Mode parser and schema tests | Mock provider success/failure | Public/local audit with no provider | Confirm closeout JSON and report state. |
| Enterprise artifacts | Artifact builders | Report lint required files | Fixture audit | Open static report and verify links. |
| Related workflows | Spec parser | Generated artifact and export | Link local SEO bundle | Confirm no SEO findings merge. |
| Evals | Verifier checks | Fixture pass/fail | `npm run enterprise:verify` | Review failure messages. |
| Monitor gates | Threshold evaluator | Monitor config | CI command | Confirm deterministic exit code. |
| Redaction | Redactor unit tests | Export tests | Repo-import export | Inspect for absolute paths/secrets. |

## Risk Register

| Risk | Probability | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| Provider review output is generic or unsupported | Medium | High | Schema + business-grade lint + quality evals | Model integration engineer |
| Enterprise artifacts become noisy | Medium | Medium | Executive summary first, details linked, raw evidence collapsed | Report engineer |
| SEO seam creates product confusion | Medium | High | Artifact labels, no finding import, docs and tests | Repo maintainer |
| Browser fixture flakiness | Medium | Medium | Deterministic local fixtures and retry classification | QA engineer |
| Strict lint breaks legacy reports | Medium | Medium | Versioned schema, useful remediation errors | Core engineer |
| Sensitive local paths leak in exports | Low | High | Redaction tests and repo-import defaults | Export engineer |
| Scope creeps into hosted product | Medium | High | Keep deferred list in AGENTS/docs and reject live writes | Repo maintainer |

## Next Implementation Order

1. ENT-000 through ENT-005: review mode and business-grade closeout semantics.
2. ENT-014 through ENT-017: related workflow seam, because it is additive and low risk.
3. ENT-007 through ENT-013: enterprise evidence artifacts and lint coverage.
4. ENT-018 through ENT-019: enterprise verify command and package script.
5. ENT-031: monitor launch-gate thresholds.
6. ENT-023 through ENT-027: client-grade deliverable polish.
7. ENT-020 through ENT-022 and ENT-028 through ENT-033: fixture corpus and deeper local operations.

## Deferred Decision Log

| Decision | Current Answer | Revisit Trigger |
| --- | --- | --- |
| Should enterprise verify require imported visual review? | Yes for `business_grade`; allow explicit pending state for no-provider local runs. | User asks for CI mode that tolerates pending review. |
| Should SEO scores affect design score? | No. | Explicit merge-product feature request. |
| Should exports upload to cloud storage? | No. | User explicitly authorizes a connector/upload workflow. |
| Should login audits be supported? | Optional sandbox-auth support only, no real personal data. | User provides sandbox credentials and target constraints. |
| Should Lighthouse be bundled? | Prefer optional dependency/external command with graceful fallback. | Dependency policy changes or CI image includes Chrome/Lighthouse. |
