# Manual Nano fixtures for Phase 4 smoke testing

Use `prose-heavy-product-ops-job.txt` as the job description, then compare it
against each resume fixture:

- `product-ops-strong-match-resume.txt`: should produce a high score, roughly
  75% or higher, with most substantive requirements covered or partially
  covered.
- `product-ops-no-overlap-resume.txt`: should produce a low score, with most
  substantive requirements marked as gaps.

Avoid treating these as exact-score assertions. Nano output can vary, so these fixtures are intended to catch obvious regressions in requirement extraction, matching, scoring, and result rendering.
