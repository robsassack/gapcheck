# Scoring Behavior and Known Limitations

This document records the production scoring contract after the Phase 6
calibration work. Benchmark ranges remain directional expectations rather than
guaranteed scores for an individual run.

## Production scoring behavior

GapCheck computes the match percentage in application code after Gemini Nano
classifies each scored job requirement:

```text
covered = 1
partial = 0.5
gap = 0
unknown = excluded

score = round(100 × sum(scored status values) / scored requirement count)
```

Every covered, partial, or gap item has equal influence. Requirement source
type, explicit qualifier, and severity do not change the production score.
Severity is shown for partial matches and gaps, while source metadata remains
available to the application and benchmark tooling.

Work and application constraints—such as location, work authorization,
schedule, travel, and application commitments—are returned as `unknown` and
excluded from the qualification score. Resume silence cannot establish these
conditions, and GapCheck defers explicit preference matches or conflicts to the
planned Phase 10 preference analysis.

Phase 6 compared the status-only score with source-weighted,
severity-weighted, and combined alternatives. All candidates preserved the
broad strong, medium, and clear-mismatch ordering, but the weighted formulas
did not consistently improve benchmark placement or intuition. Production
therefore retains the simpler status-only formula. The comparison matrix and
decision rationale are recorded in
[`requirement-aware-scoring-evaluation.md`](../tests/fixtures/requirement-aware-scoring-evaluation.md).

## Requirement extraction

Before extraction begins, GapCheck deterministically removes recognized
non-requirement content from the selected text. Company descriptions, equal
opportunity and E-Verify statements, application accessibility instructions,
and employment-agency notices are excluded using a combination of section
heading recognition and content patterns, so legal and marketing boilerplate
cannot be extracted or scored as candidate requirements. This filtering runs
once across the full selection, ahead of sectioning, so an excluded section
cannot leak back into analysis at a section boundary.

Pass 1 then processes the filtered text in paragraph-aware sections of at most
6,000 characters. It analyzes sections sequentially, combines their extracted
requirements, removes duplicates and related fragments, preserves source type
and explicit qualifier metadata, and then applies the 20-requirement cap to the
posting as a whole.

After the filtering step, the remaining analyzed text is bounded at 18,000
characters. If more text than this remains, the side panel reports how many
characters were analyzed and excluded; the reported counts describe the
filtered text rather than the raw selection, so they can differ from the
selection's original length when boilerplate was removed. Multi-section
progress is also shown while Pass 1 runs.

Every extracted requirement is additionally validated in application code
against the source text it came from. A requirement's content words must
substantially appear in the posting, and numeric values such as years of
experience must appear exactly, so the model cannot introduce requirements the
posting does not contain. If an extraction fails this grounding check
entirely, the analysis is retried rather than silently repaired.

Extraction prioritizes candidate qualifications and work constraints before
lower-priority responsibilities. Detected source bullets remain indivisible so
tools, alternatives, audiences, and compound capabilities from one source item
do not gain extra scoring weight merely because they could be split into
several fragments.

## Resume evidence analysis

Pass 2 handles scored requirements in bounded batches and performs one
consolidated evidence audit. Because practical on-device output limits vary by
model build and hardware, an output-limit failure is retried as successively
smaller batches while preserving requirement order. Model-facing resume
evidence uses code-owned IDs; returned IDs must exist in the supplied resume
and are mapped back to the original bullet text only after validation.

Code-owned normalization removes context-only or irrelevant citations,
preserves dated role context for duration requirements, allows a small set of
complementary bullets to prove compound requirements, and prevents partial
evidence from being promoted to full coverage. Fabricated or unrecognized
evidence remains invalid.

Malformed model output is retried once. Known truncation failures skip the
identical retry and use the smaller-batch fallback instead. A malformed
single-item response still produces a clear error rather than a partial or
silently repaired analysis. Ordinary model-runtime failures are not treated as
malformed output and provide Chrome restart and diagnostics guidance instead.

## Calibration interpretation

The benchmark families define directional score bands and important expected
classifications for strong, medium, and clear-mismatch resumes. Ordering and
evidence correctness matter more than an exact score from one run. See the
[`tests/fixtures`](../tests/fixtures/README.md) guide for the current families,
ranges, and regression signals.

Final targeted validation included:

- three pinned Product Operations strong-resume runs at 97%, with identical
  status-only scores and no Pass 1 or Pass 2 errors;
- a normal production side-panel run at 91%, with 14 covered, 3 partial, no
  gaps, and 2 unscored work constraints; and
- a roughly 9,000-character production run that retained a deliberately added
  pilot-license requirement after the first 6,000 characters and correctly
  classified it as an unsupported gap.

These results validate the targeted fixes but do not guarantee identical
scores on different Chrome versions, devices, postings, resumes, or model
runs.

## Known limitations

- Gemini Nano can vary requirement wording, grouping, classification, summary,
  and severity between runs. The same final `matches` array always produces the
  same code-owned score, but the model-generated array can vary.
- Status-only scoring gives every scored item equal influence. Required
  qualifications, preferred qualifications, and responsibilities are not
  weighted differently.
- Scores remain sensitive to extraction grouping. The extraction pipeline
  reduces fragmentation and duplicates, but semantically similar restatements
  can occasionally remain or related requirements can be grouped differently.
- The 20-requirement cap can omit material from unusually dense postings.
  Although extraction prioritizes eligibility items, cap trimming has been
  observed to occasionally drop a required qualification while retaining
  responsibilities. Reaching the cap is a review signal, not proof that every
  source requirement was retained.
- Boilerplate filtering is pattern-based. Postings with unrecognized section
  structures can retain some legal or company boilerplate, or, more rarely,
  exclude relevant text when it appears under an unrecognized heading, because
  an excluded section runs until the next recognized requirements heading.
- Grounding validation compares requirement wording against the posting's
  vocabulary. A legitimately extracted requirement can occasionally be dropped
  if the model rephrases it so heavily that it shares too little wording with
  the source.
- Text beyond the 18,000-character total safeguard is not analyzed. The side
  panel discloses the exclusion instead of silently truncating it.
- Long postings take longer because each section receives an extraction and a
  completeness pass before resume comparison begins.
- Work and application constraints cannot yet be reported as preference
  matches or conflicts; they remain unknown and unscored until Phase 10.
- Severity is model-generated, may vary by one level, and does not affect the
  current percentage. Missing partial or gap severity defaults to `medium`.
- Direct evidence can occasionally receive conservative partial credit. In the
  final Product Operations smoke test, direct SQL usage was cited correctly but
  remained partial rather than covered.
- Resume parsing depends on plain-text line and bullet structure. PDF import
  extracts the file's embedded text layer locally, but unusual reading order or
  complex layouts may need correction in the resume editor after import.
  Scanned or image-only PDFs are rejected because OCR is not included.
- Job text must be selected manually. GapCheck does not currently capture the
  full page automatically.
- Analysis requires a supported desktop Chrome installation with the built-in
  model available. Model downloads, runtime backoff, and device performance can
  affect availability and completion time.
