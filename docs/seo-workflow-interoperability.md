# SEO-Workflow Interoperability

> Local tracking artifact. Do not stage or commit this file unless explicitly requested.

## Purpose

`design-review-workflow` and `SEO-workflow` should remain separate products that can be run independently. This repository should not duplicate full SEO crawling, technical SEO scoring, metadata analysis, keyword analysis, indexing diagnostics, schema validation, or search ranking recommendations.

Instead, design audits can optionally link to a local SEO audit artifact bundle so a reviewer or downstream agent can see related SEO status in context.

## Non-Merge Principle

Design findings and SEO findings stay separate:

- Design findings remain in `report/findings.json`.
- SEO findings remain in the SEO workflow artifact bundle.
- The design workflow writes `report/related-workflows.json` with references and summary metadata only.
- Design scores are not recalculated from SEO scores.
- Exports may include the related metadata file, not copied SEO internals unless a future explicit export-merge feature is requested.

## CLI Contract

Initial syntax:

```bash
node apps/cli/dist/index.js run https://example.com \
  --business-grade \
  --related-workflow seo:/absolute/path/to/seo-audit
```

Multiple related workflows should be accepted eventually:

```bash
node apps/cli/dist/index.js run https://example.com \
  --related-workflow seo:/path/to/seo-audit \
  --related-workflow seo:/path/to/second-seo-audit
```

Initial supported kind:

| Kind | Meaning |
| --- | --- |
| `seo` | Local SEO-workflow audit artifact bundle. |

Rejected syntax:

- Missing kind: `/path/to/seo-audit`.
- Missing path: `seo:`.
- Unknown kind: `analytics:/path`.
- Remote URL as artifact path unless a future connector/export mode explicitly supports it.

## Generated Artifact

`report/related-workflows.json` should be present for every design audit. Empty example:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-08T00:00:00.000Z",
  "workflows": []
}
```

SEO-linked example:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-08T00:00:00.000Z",
  "workflows": [
    {
      "kind": "seo",
      "label": "SEO audit",
      "inputPath": "/Users/mt/Programming/Schtack/SEO-workflow/audit-reports/example/latest",
      "status": "available",
      "score": 84,
      "scoreLabel": "seo",
      "manifestPath": "/Users/mt/Programming/Schtack/SEO-workflow/audit-reports/example/latest/workflow-manifest.json",
      "reportPath": "/Users/mt/Programming/Schtack/SEO-workflow/audit-reports/example/latest/index.html",
      "limitations": [
        "Linked SEO evidence is not merged into design findings.",
        "SEO checks were produced by the related workflow, not by design-review-workflow."
      ]
    }
  ]
}
```

Missing artifact example:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-08T00:00:00.000Z",
  "workflows": [
    {
      "kind": "seo",
      "label": "SEO audit",
      "inputPath": "/missing/seo-audit",
      "status": "missing",
      "limitations": [
        "The related workflow path was not found.",
        "No SEO metadata was imported."
      ]
    }
  ]
}
```

## Metadata Discovery Order

When inspecting a related SEO path, the design workflow should look for metadata in this order:

1. `workflow-manifest.json`.
2. `report/workflow-manifest.json`.
3. `score.json`.
4. `report/score.json`.
5. `quality-gate.json`.
6. `report/quality-gate.json`.
7. `index.html` or `report/index.html` as human-readable report entrypoints.

The seam must be tolerant:

- If a file is absent, continue to the next candidate.
- If JSON is unreadable, record a warning and continue.
- If no metadata is found but the directory exists, report `status: "available"` with limited metadata.
- If the path is missing, report `status: "missing"` and do not fail the design audit by default.

## Report Behavior

Design reports should show related SEO status in a clearly separated section:

- "Related workflow evidence"
- Kind: SEO
- Status: available/missing/unreadable/unsupported
- Score/status when found
- Link to local SEO report when available
- Limitation text that SEO findings are linked evidence only

The report must not:

- Add SEO issues to design findings.
- Change design severity/priority because of SEO score.
- Claim the design workflow ran SEO checks.
- Copy private SEO source files into exports unless an explicit merged-export feature is later designed.

## Export Behavior

| Export Profile | Related Workflow Inclusion |
| --- | --- |
| `review` | Include `report/related-workflows.json`; do not copy SEO audit files. |
| `full` | Include `report/related-workflows.json`; do not copy SEO audit files by default. |
| `repo-import` | Include redacted related workflow metadata; redact local absolute paths by default. |

## Validation

`report lint --strict` should require `report/related-workflows.json` to exist and be valid JSON. It should not fail merely because a related workflow path is missing unless strict related-workflow enforcement is explicitly requested later.

`enterprise verify` should warn for missing related workflow paths and fail only when:

- The related workflow spec is syntactically invalid.
- `--require-related-workflows` or an equivalent future strict flag is used.
- The report claims linked SEO status but `related-workflows.json` is absent.

## Test Plan

| Test | Expected |
| --- | --- |
| No related workflows | `related-workflows.json` contains an empty `workflows` array. |
| Valid SEO directory with score | Status `available`, score extracted, report path discovered. |
| Missing SEO directory | Status `missing`, limitations recorded, design audit still succeeds. |
| Malformed CLI spec | CLI exits with useful validation error. |
| Unknown kind | CLI exits with useful validation error. |
| Repo-import export | Local absolute paths are redacted. |
| Report lint strict | Missing `related-workflows.json` fails; missing external SEO path warns only. |

## Future Extension Points

The artifact seam can later support:

- Multiple SEO baselines for before/after comparison.
- Optional merged executive appendix for client exports.
- Explicit import of selected SEO summary metrics into a combined launch readiness dashboard.
- Connector-mediated upload or retrieval if the user explicitly authorizes it.

Those are not part of this implementation pass.
