# Synthetic calibration baseline — 2026-07-27

## Controlled comparison

Three controlled repetitions used one shared Pass 1 extraction per family and
repetition.

| Family | Strong | Medium | Clear mismatch | Extraction behavior |
| --- | ---: | ---: | ---: | --- |
| Junior Full-Stack | 59, 59, 59 | 41, 41, 41 | 0, 0, 0 | Eleven identical requirements; DevOps and optional-technology themes were omitted every time |
| Software Consultancy | 70, 70, 70 | 20, 20, 20 | 0, 0, 0 | Fifteen identical requirements in every repetition |

The identical repetitions showed no observed run-to-run variation. Junior
Full-Stack had systematic extraction omissions, while both families contained
systematic classification and evidence-selection errors.

## Pinned Pass 2 comparison

One pinned-requirement run targeted strong and medium resumes.

| Family | Strong | Medium |
| --- | ---: | ---: |
| Junior Full-Stack | 60 | 13 |
| Software Consultancy | 60 | 23 |

Pinned requirements did not resolve the low strong scores or evidence errors.
Observed failures included job titles and date lines used as capability
evidence, unrelated bullets cited for testing and work constraints, direct
technical and collaborative evidence overlooked, and incomplete evidence
marked covered.

## Attribution and response

- Extraction was stable across the controlled repetitions, although the Junior
  Full-Stack omissions were systematic.
- Pass 2 classification and evidence selection were the primary correctness
  problem.
- Work authorization, location, work arrangement, travel, and schedule silence
  must be represented as unknown and excluded from the qualification score.
- Code-owned citation cleanup must reject context-only and unrelated evidence,
  recover strong direct evidence conservatively, and enforce compound testing
  and collaboration completeness.

This baseline predates the constraint and evidence-normalization fixes. Use a
single pinned strong/medium rerun per family after the fixes, then one
controlled all-case repetition if the pinned classifications are sound.
