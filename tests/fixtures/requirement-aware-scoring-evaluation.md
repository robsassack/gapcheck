# Requirement-aware scoring evaluation

Status: complete — retain status-only production scoring.

Production continues to use the status-only score.

## Candidate formulas

| Formula | Coverage value | Aggregation |
| --- | --- | --- |
| Status only | covered `1`, partial `0.5`, gap `0` | Mean of scored items |
| Source weighted | Same | Mean within each source bucket, then required `1.0`, responsibility `0.75`, preferred `0.5` |
| Severity weighted | Same | Item-weighted mean using low `0.5`, medium `1.0`, high `1.5` for partial and gap |
| Combined | Same | Severity-weighted mean within each source bucket, then apply source weights |

Unknown work and application constraints have zero weight in every formula.

## Required runner protocol

Use all four benchmark families, all three resume cases, and three repetitions.
The runner derives all four scores from each `matches[]`, so no separate run is
needed for each formula.

1. Run **Controlled comparison** and copy the Markdown report below.
2. Run **Pass 2 audit with pinned requirements** and copy the Markdown report
   below.
3. Review every formula for strong > medium > clear mismatch ordering and the
   existing directional target ranges.
4. Compare repeated-run ranges. Treat a severity or combined spread wider than
   status-only as evidence against severity weighting.
5. Inspect material score changes against the requirement-level statuses. In
   particular, verify that preferred gaps and long responsibility lists do not
   dominate required qualifications.

## Controlled comparison report

Not required after the pinned screen rejected every candidate. A controlled run
would add extraction variation but would not change the candidate formulas'
failure to improve the fixed-requirement comparison.

## Pinned Pass 2 report

One repetition covered all four families and all three resume cases on
2026-07-30:

| Family | Resume | Status | Source | Severity | Combined | Target |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Product Operations | Strong | 56 | 56 | 57 | 59 | 75-100 |
| Product Operations | Medium | 38 | 36 | 36 | 34 | 40-70 |
| Product Operations | Clear mismatch | 0 | 0 | 0 | 0 | 0-25 |
| Web Developer | Strong | 91 | 90 | 93 | 91 | 80-100 |
| Web Developer | Medium | 50 | 49 | 50 | 50 | 40-70 |
| Web Developer | Clear mismatch | 0 | 0 | 0 | 0 | 0-20 |
| Junior Full-Stack | Strong | 80 | 72 | 80 | 72 | 80-100 |
| Junior Full-Stack | Medium | 30 | 26 | 30 | 25 | 40-70 |
| Junior Full-Stack | Clear mismatch | 0 | 0 | 0 | 0 | 0-20 |
| Software Consultancy | Strong | 67 | 56 | 67 | 57 | 75-100 |
| Software Consultancy | Medium | 25 | 21 | 24 | 20 | 35-70 |
| Software Consultancy | Clear mismatch | 0 | 0 | 0 | 0 | 0-20 |

Every formula preserved strong > medium > clear mismatch ordering. Status-only
and severity-weighted each placed seven of twelve results in their directional
ranges; source-weighted and combined each placed six.

## Decision

Retain status-only scoring:

- Source weighting did not improve a target-range miss. It lowered Junior
  Full-Stack strong by eight points and Software Consultancy strong by eleven,
  moving or keeping both below target. It also lowered every nonzero medium
  result except Web Developer by at least two points.
- Bucket normalization met the mechanical requirement that long responsibility
  lists not dominate qualifications, but it amplified Pass 2 errors in the
  smaller required-qualification bucket. For example, direct full-stack and
  client evidence remained incorrectly partial or gap in otherwise strong
  resumes, and source weighting gave those errors more aggregate influence.
- Severity weighting changed no Junior Full-Stack score, changed Web Developer
  medium by zero, and moved all other nonzero scores by only one or two points.
  It rescued no out-of-range result and moved Product Operations medium and
  Software Consultancy medium farther below target.
- The severity labels were not intuitive enough to justify that negligible
  movement. The clear Software Consultancy mismatch assigned high severity to
  several responsibilities but low severity to its production-experience,
  source-control, testing, and client-work qualifications.
- Combined weighting inherited the source-weighted regressions and rescued no
  result.

Because severity weighting failed the improvement gate in the fixed-requirement
screen, additional repetitions are unnecessary: stability cannot make a
non-improving formula preferable to the simpler deterministic status-only
score. The comparison helpers and runner output remain available for future
calibration, but they are not used by the extension UI.
