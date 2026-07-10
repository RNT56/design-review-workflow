# Scoring

The scorecard is a decision aid, not the single source of truth. Prioritized findings and implementation recommendations remain the most important output.

The `design-review-workflow.scoring.v2` numeric score is status-independent. The same findings and evidence produce the same number in `automated_scan`, `agent_review_pending`, and `business_grade`; status changes coverage, confidence, and which subjective claims are permitted, not the quality baseline.

Each dimension starts from a neutral evidence baseline of 85. Deduplicated finding groups subtract severity- and confidence-weighted penalties, while repeated instances of the same root cause use a saturating prevalence factor instead of a linear page-count penalty. No finding detected does not mean 100: the score remains provisional when evidence coverage is incomplete.

Scorecards expose `rubricVersion`, `provisional`, per-dimension `coverage`, and overall coverage counts. Comparisons reject mismatched scoring rubrics, capture scopes, targets, or viewport contracts unless exploratory incompatible output is explicitly requested.

## Dimensions

| Dimension | Weight |
| --- | ---: |
| Visual Design Quality | 15% |
| UX Clarity & Navigation | 15% |
| Conversion Readiness | 15% |
| Mobile Experience | 12% |
| Brand Fit & Trust | 12% |
| Content Design / UX Writing | 10% |
| Accessibility Basics | 8% |
| Performance Perception | 8% |
| Design System Consistency | 5% |

## Finding Priority

Priority is calculated from severity, impact, confidence, page importance, and effort:

```text
priorityScore =
  impactWeight * 0.35 +
  severityWeight * 0.25 +
  confidenceWeight * 0.15 +
  pageImportanceWeight * 0.15 +
  lowEffortBonus * 0.10
```

Ranges:

| Score | Label |
| ---: | --- |
| 90-100 | Critical Priority |
| 75-89 | High Priority |
| 50-74 | Medium Priority |
| 25-49 | Low Priority |
| 0-24 | Backlog |

## QA Gate

A finding is removed or downgraded when it:

- Has no URL
- Has no evidence reference
- Mentions a page, section, screenshot, metric, or competitor not present in captured evidence
- Uses generic advice without a concrete recommendation
- Duplicates a stronger finding
- Overclaims beyond MVP scope
- Lacks viewport context where viewport matters

## Business-Grade Gate

`business-grade lint` fails unless the report includes:

- `businessGradeStatus: business_grade`
- Imported `report/agent-visual-review.json`
- Reviewed screenshot references that exist in `report/screenshot-manifest.json`
- Page-by-page visual notes
- Site-level and page-level copywriting/messaging notes
- Actionable grouped issues with evidence, recommendations, and acceptance criteria
- No unsupported analytics, heatmap, revenue, user-behavior, competitor, or market claims
