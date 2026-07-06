# Scoring

The scorecard is a decision aid, not the single source of truth. Prioritized findings and implementation recommendations remain the most important output.

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
