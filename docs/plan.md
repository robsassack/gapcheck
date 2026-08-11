# GapCheck — Chrome Extension: Project Plan

## Concept

A Chrome extension that compares a selected job posting against a saved resume and outputs a gap analysis — what's covered, what's missing, overall match score. Portfolio project demonstrating on-device AI via Chrome's built-in Gemini Nano. Fully self-contained: no API keys, no server, nothing leaving the browser.

## UX Flow

1. User selects job-description text on a webpage.
2. User opens GapCheck from the Chrome toolbar or side-panel interface.
3. User clicks **Analyze selected text**.
4. Analysis runs and the results appear in the side panel.

No DOM scraping, no LinkedIn-specific selectors — selection-based capture keeps it site-agnostic.

## Architecture — Bounded Two-Stage Analysis Pipeline

All AI work happens through Chrome's built-in Prompt API (`LanguageModel`). No
embeddings API, remote model, or developer-operated backend is used. The
pipeline keeps model inputs and outputs bounded, validates model responses in
application code, and performs separate extraction and resume-evidence stages
so each call has one focused task.

```
Selected job text
        │
        ▼
Code removes recognized boilerplate and creates
paragraph-aware sections (≤ 6,000 chars each; ≤ 18,000 total)
        │
        ▼
Pass 1 — Extraction
Categorization + independent completeness review per section
Code grounds, consolidates, de-duplicates, and caps requirements at 20
        │
        ▼
Pass 2 — Evidence analysis ◄── Resume evidence (chrome.storage.local)
Bounded requirement batches + one consolidated audit
Model returns statuses, severities, and compact evidence IDs
        │
        ▼
Code validates and hydrates evidence, computes the score and summary
        │
        ▼
Side panel results
```

### Pass 1 — Extraction

- Recognized company, legal, equal-opportunity, E-Verify, accessibility, and
  agency boilerplate is removed before sectioning.
- Filtered text is split at paragraph-aware boundaries into sections of at
  most 6,000 characters and processed sequentially. At most 18,000 filtered
  characters are analyzed; the side panel discloses any excluded amount.
- Each section receives a categorization call followed by an independent
  completeness review. Structured output is constrained with JSON Schema.
- Code grounds extracted requirements against the source text, preserves
  source type and explicit qualifiers, consolidates fragments and duplicates,
  prioritizes eligibility items, and applies a final 20-requirement cap across
  the complete posting.
- Internal `SOURCE BULLET` labels help preserve source-item boundaries, but
  are private prompt metadata. Code strips any leaked marker or heading text
  before requirements can reach metadata, scoring, summaries, or the UI.
- Before the pipeline begins, create and immediately destroy a lightweight
  session to verify that Chrome can actually start its model process.
  `LanguageModel.availability()` can still report `"available"` while the
  browser-owned runtime is in crash or timeout backoff. Known session-runtime
  failures are not retried; the panel marks the session unavailable and directs
  the user to restart Chrome and inspect `chrome://on-device-internals`.
- Every model session is destroyed after use.

### Pass 2 — Resume Evidence Analysis

- Scored requirements are compared with normalized resume evidence in bounded
  batches of four. Output-limit failures retry with smaller batches while
  preserving requirement order.
- Model-facing resume bullets use compact, code-owned evidence IDs. The model
  returns only index-aligned statuses, evidence IDs, and severities; it does
  not reproduce requirement or resume text.
- One consolidated model audit reviews the combined batch results. Application
  code then validates citations, normalizes unsupported or overlooked
  classifications conservatively, maps valid IDs back to the original resume
  text, and reattaches code-owned requirement metadata.
- Work and application constraints are classified as `unknown` and excluded
  from the resume qualification score.
- JSON Schema constrains response shape, but every response is still parsed,
  validated, and sanity-checked. Model sessions are destroyed after use.

### Output shape

The application uses a single `matches[]` array with a `status` field
(`covered | partial | gap | unknown`) rather than separate covered and gap
arrays. Every requirement therefore has exactly one result. `unknown` is
reserved for work and application constraints that cannot be inferred from
resume silence and is excluded from the score.

**Pass 2 batch output (model-facing):**

```js
{
  matches: [
    { status: "covered", matchedBulletIds: ["R3"], severity: null },
    { status: "gap", matchedBulletIds: [], severity: "high" },
    { status: "partial", matchedBulletIds: ["R8"], severity: "medium" }
  ]
}
```

**Final application result (simplified):**

```js
{
  overallScore: 74,
  matches: [ /* requirement text and hydrated resume evidence */ ],
  summary: "Clear alignment: CI/CD pipeline experience. Main gaps: Kubernetes deployment."
}
```

`overallScore`, requirement text, source metadata, hydrated evidence strings,
and `summary` are application-owned. The model supplies bounded classification
judgments and citations by ID. This prevents it from rewriting source text or
introducing unsupported evidence in the final result. The same finalized
`matches[]` always produces the same score and summary, although model
classification can still vary between runs.

**Production scoring formula:**

```
score = average over all matches of:
  covered → 1
  partial → 0.5
  gap     → 0
```

Expressed as a percentage (e.g. `overallScore = Math.round(sum / matches.length * 100)`). This is pinned in code as `MATCH_STATUS_SCORES` plus `computeOverallScore(matches)`. Work and application constraints use `unknown` and are excluded. Severity is displayed but does not affect the production score.

The Phase 6 sensitivity audit confirms that this status-only mean is
count-sensitive: splitting one missing optional list into three gaps changed a
representative audit score from 42 to 31, while a combined partial requirement
versus three differently supported parts changed another from 50 to 43. The
production extraction contract therefore treats one source bullet, compound
list, or closely related prose qualification as one scoring theme and removes
duplicates and restatements. All four pinned benchmark sets remain below the
20-item cap (11, 15, 15, and 18 items), so the cap does not directly truncate
their representative scores. An extraction that reaches the cap remains a
review warning because eligibility-first ordering can exclude later
responsibilities. Future scoring proposals should prefer stable theme-level
influence, but this audit does not add heuristic text-similarity grouping or
change the v1 formula without a stable code-owned theme identifier. See
`tests/fixtures/score-sensitivity-audit.md` for the cases and decision boundary.

**Phase 6 requirement-aware scoring candidates:**

Keep the existing status values as the coverage signal:

```text
covered = 1
partial = 0.5
gap = 0
unknown = excluded
```

Compare these four formulas without changing the production score:

1. **Status-only:** the current unweighted mean.
2. **Source-weighted:** first average items within each present source-type
   bucket, then combine those bucket scores using required qualification `1.0`,
   core responsibility `0.75`, preferred qualification `0.5`, and work or
   application constraint `0`.
3. **Severity-weighted:** weighted mean using severity multipliers low `0.5`,
   medium `1.0`, and high `1.5` for partial matches and gaps. Covered matches
   use the neutral multiplier `1.0` because their normalized severity is
   `null`; unknown constraints use `0`.
4. **Combined:** calculate the severity-weighted mean within each source-type
   bucket, then combine the bucket scores using the source-type weights.

For the severity-weighted formula:

```text
score = round(100 × sum(status value × item weight) / sum(item weight))
```

Source-weighted formulas apply that same weighted-mean operation to the present
bucket scores. A zero total weight returns `0`. These are comparison
candidates, not adopted product behavior. Bucket normalization means a long
responsibility list cannot gain more total influence merely by containing more
items; the complete responsibility bucket has three-quarters of the influence
of the complete required-qualification bucket, and the complete preferred
bucket has half. Severity is an importance multiplier, not extra match credit:
a gap remains worth zero, while a high-severity gap has more influence on the
aggregate than a low-severity gap. Reject severity weighting if one-level
severity changes increase repeated-run spread, reverse
strong/medium/mismatch ordering, or produce less intuitive benchmark results.
Prefer the simplest formula that improves the complete benchmark set; do not
tune weights to one resume or role family.

**Phase 6 decision (2026-07-30): retain status-only scoring.** A pinned Pass 2
screen compared all four formulas across every benchmark family and resume
case. Source weighting lowered Junior Full-Stack strong from `80` to `72` and
Software Consultancy strong from `67` to `56`; combined weighting inherited
those regressions. Severity weighting moved nonzero results by at most two
points, rescued no result outside its directional range, and lowered two medium
results. It therefore failed the improvement gate before repeated stability
testing was warranted. Production continues to use
`computeOverallScore(matches)`. The comparison formulas remain isolated in the
benchmark tooling. See
`tests/fixtures/requirement-aware-scoring-evaluation.md` for the complete score
matrix and rationale.

**Schema and validation details:**
- `matchedBullets` is a `string[]`, not a single nullable string — a requirement may be supported by two weaker bullets together, and an empty array is cleaner to handle than `null`.
- Keep `matchedBullets` as the application-facing result, but use compact code-owned `matchedBulletIds` in the model-facing Pass 2 schema. Constrain those IDs to the supplied resume evidence and map them back to the original bullet strings after validation so the model never has to reproduce full evidence text exactly.
- `severity` is a nullable field present on every model-facing item. Covered requirements use `null`.
- The severity scale is pinned as `low | medium | high`, and applies to `partial` matches as well as `gap` matches — a partial match on a "must-have" requirement is more significant than a partial on a "nice-to-have."
- Normalize severity deterministically in code before validating Pass 2 output: `covered` always becomes `null`; `partial` or `gap` with a missing or `null` severity becomes `medium`; and valid model-provided `low | medium | high` values remain unchanged. This normalization does not affect the current status-only score.
- Pass 1 returns separate eligibility and responsibility arrays. Application code consolidates them and enforces the final 20-requirement limit before Pass 2.
- Pass 1 returns each requirement with a constrained explicit qualifier (`required`, `preferred`, `desirable`, `plus`, `not-required`, or `null`). Application code derives and freezes one of four source types: required qualification, preferred qualification, core responsibility, or work/application constraint. Pass 2 cannot rewrite this metadata; code reattaches it to each index-aligned match so it is available to later scoring experiments.
- Before Pass 1, label detected source bullets and join their wrapped continuation lines. Also recover complete sentence-like list items under headings such as “What You’ll Do,” “What We’re Looking For,” “Responsibilities,” and “Qualifications” when captured page text has lost its visual bullet markers. The extraction prompt treats each label as indivisible and returns at most one requirement from each source item, preserving compound `and` / `or` qualifications instead of splitting them into separate requirements. If a model still returns fragments, code consolidates every fragment mapped to the same source item independently rather than merging unrelated lines from the surrounding section.
- Pass 2's schema caps `matches[]` at the batch size. The system prompt explicitly instructs the model to return one item for each provided requirement in the same order, since JSON Schema alone can constrain shape but not this one-to-one correspondence.

The results UI derives its sections by filtering `matches[]`: `covered` = `status === "covered"`, `gaps` = `status === "gap"`, and `partial` gets its own third visual bucket rather than being folded into either of the other two.

## Tech Stack

- Manifest V3 Chrome extension
- Vanilla JS with `// @ts-check` + JSDoc types
- `@types/chrome` and `@types/dom-chromium-ai` as dev dependencies (editor-only, no build step)
- `chrome.storage.local` for resume storage
- No bundler, no Vite — all plain files, loaded unpacked during development
- Extensions Reloader (Chrome Web Store) for one-click extension reload during dev

## Prompt API Notes (updated August 2026)

- Chrome extensions can use the Prompt API from Chrome 138. The global is
  `LanguageModel`, not the older `window.ai.languageModel` pattern.
- Stable extension use does not require the earlier Prompt API or on-device
  model experiment flags.
- Current supported systems are Windows 10/11, macOS 13+, Linux, and qualifying
  Chromebook Plus devices. Android, iOS, and other ChromeOS devices are not
  supported by the foundation-model APIs.
- Chrome currently requires at least 22 GB of free profile-volume storage and
  either more than 4 GB of GPU VRAM or at least 16 GB of system RAM with four
  CPU cores. An unmetered connection is required for the initial model
  download. Current model details are visible at `chrome://on-device-internals`.
- `LanguageModel.availability()` returns `"available"`, `"downloadable"`, `"downloading"`, or `"unavailable"`
- When availability is `"downloadable"`, call `LanguageModel.create()` from a user-initiated action (the Analyze button) to trigger the model download; attach a `downloadprogress` monitor and show progress/ready messaging in the side panel
- `responseConstraint` accepts a JSON Schema and constrains the response to valid JSON matching that schema (not a hard guarantee of "typed" output) — use this on both passes, and still `JSON.parse` the result plus validate/sanity-check counts (e.g. array lengths) afterward
- Each model call creates a fresh session and calls `.destroy()` in a `finally` block when done
- The Prompt API uses Gemini Nano in Chrome. The model is downloaded separately
  on first use, and Chrome states that prompts are processed locally without
  sending them to Google or a third party.

See Chrome's current [Prompt API documentation](https://developer.chrome.com/docs/ai/prompt-api)
for the authoritative availability and device requirements.

## v1 Scope

**In:**
- Side panel UI (toolbar icon → side panel)
- Options page: paste resume as plain text, saved as array of bullets to `chrome.storage.local`
- Analyze selected text from the active tab via `chrome.scripting.executeScript`
- `nano.js` module: bounded extraction, completeness review, evidence analysis,
  consolidated audit, and code-owned normalization
- Results UI: overall score, with three buckets — covered requirements (with matched bullets), partial matches (with matched bullets and severity), and flagged gaps (with severity)
- PDF resume import with a local extraction preview and pasted-text fallback

**Deferred until after v1:**
- History of saved analyses
- Job preferences and fit context
- Resume improvement suggestions
- Automatic job-page capture

## Current State

Version 1.0.0 is implemented and its production package was submitted to the
Chrome Web Store for review on August 10, 2026. Phases 0–7 and the Store
preparation, upload, and submission portions of Phase 8 are complete. The
fresh-install and representative-environment checks remain open as
post-submission validation items. The current product includes:

- Side panel opens on toolbar icon click (`sidePanel.setPanelBehavior`)
- `LanguageModel.availability()` check with human-readable status and dot indicator in the panel
- Resume paste/save/bullet-split on the options page (`chrome.storage.local`)
- A single "Analyze selected text" action that captures `window.getSelection()`, previews it, and runs both Nano passes
- Storage change listener keeps the panel's resume status in sync with the options page
- `nano.js` filters and sections job text, extracts and reviews requirements,
  analyzes evidence in bounded batches, audits the combined classifications,
  and computes the final score and summary in code
- Local PDF import with an extraction preview, explicit confirmation, file
  limits, and helpful errors for unsupported documents
- A results view with the code-owned score, summary, and expanded Covered, Partial, and Gaps sections
- Model availability, download progress, malformed-output retry, and actionable empty/error states
- Local-only resume storage and analysis with no API keys or server calls
- README includes the current analysis screenshot from
  `store-assets/screenshots/01-resume-analysis.png`

The v1 score remains directional because Nano's extracted requirements and
classifications can vary between runs. The deterministic scoring and summary
functions produce the same result for the same finalized `matches[]`. Optional
additional stability work is tracked as post-release Phase 8.5 calibration and
does not block the initial Store submission.

A manual production regression found a `25%` result whose breakdown contained
contradictory duplicates (an explicitly evidenced language was both covered and
a gap), separately scored closely related engineering-tool fragments, and
sixteen unrelated responsibilities collapsed into one partial item. The source posting had
sentence-like list lines but no retained bullet characters. Pass 1 now recovers
those implicit list boundaries and consolidates fragments only within their
source item. Pass 2 also treats technical-skills lines as substantive evidence
and conservatively restores partial credit when explicit source-control,
delivery-pipeline, containerization, deployment, or named-language evidence was
overlooked. Regression tests confirm that unmentioned specialized platforms and
reliability engineering remain gaps.

The first corrected rerun scored `42%` and removed the direct-evidence gaps, but
still combined several independent “About the role” sentences into one partial
and accepted generic AI-tool usage as evidence for specialized governance and
service-reliability requirements. Over-limit prose consolidation now groups fragments by source
sentence rather than by an entire paragraph. Contact-only lines and generic
capitalized terms such as “AI” and “Software” cannot serve as named technical
evidence. Unsupported specialized partials are normalized to gaps, while a
partial is promoted to covered only when action-based evidence passes the same
strict full-coverage check used to validate covered classifications. A simple
named capability such as Python can be covered by direct action evidence;
skills-only Docker evidence remains partial, and compound lifecycle evidence
remains partial when a required stage is only implicit.

The final representative rerun scored `39%`: one covered, nine partial, and
four gaps across fourteen extracted requirements. This is directionally
consistent with the preceding `42%` result: weighted match points increased
from `5.0` to `5.5`, while the extracted-item denominator increased from twelve
to fourteen. The final breakdown covered Python, avoided contradictory
explicit-skill gaps, kept contact details out of evidence, and no longer merged
independent prose sentences. Remaining partials reflect transferable overlap
without claiming the posting's specialized platforms, domain-governance, or
service-reliability experience as covered. The observed three-point
movement is accepted as normal extraction/classification variation; further
job-specific normalization would risk reducing generality.

## Release and Post-v1 Roadmap

### Phase 6 — Analysis Quality and Calibration (complete)

Build a repeatable benchmark set, separate Pass 1 extraction issues from Pass 2 classification issues, and improve evidence selection only where testing shows systematic errors. Evaluate severity-weighted scoring after classification quality is stable; adopt it only if it improves the benchmark results without increasing run-to-run instability.

The implemented scoring contract, final calibration interpretation, long-input
behavior, and accepted limitations are recorded in
[`scoring-behavior.md`](scoring-behavior.md).

### Phase 7 — PDF Resume Import (complete)

Extract text from a locally selected PDF, preview it, and feed it through the existing resume-normalization path without uploading the file. Keep pasted text as a fallback and clearly reject encrypted, malformed, empty, or image-only PDFs that cannot be processed.

Implementation decision: use the pinned Apache-2.0-licensed Mozilla PDF.js
6.1.200 display build and worker, bundled locally under `vendor/pdfjs`. The two
runtime modules add roughly 3 MB before packaging. Extraction receives only an
in-memory `Uint8Array`, disables WebAssembly and dynamic evaluation, and does
not require remote scripts, network fetches, or a relaxed extension content
security policy. OCR remains explicitly out of scope.

### Phase 8 — Chrome Web Store Release (submitted for review)

The production-only package, permission audit, store listing, privacy
disclosures, and Dashboard validation are complete, and version 1.0.0 has been
submitted for review. Fresh-install and representative-environment validation
remain useful follow-up checks while the submission is pending; they are not a
reason to withdraw the submitted package.

The optional post-release benchmark-calibration protocol is recorded in
[`plan-checklist.md`](plan-checklist.md). It retains the complete one-repetition
controlled baseline and offers a staged alternative to a multi-hour repeated
matrix. The remaining repeated Pass 1 and pinned Pass 2 audits do not block the
initial Store upload or submission; use them when preparing an accuracy update
or investigating user feedback. Keep on-device model calls sequential.

The production permission rationale, including the decision to retain
`<all_urls>` instead of `activeTab` for the persistent side-panel workflow, is
recorded in [`permissions.md`](permissions.md).

The verified user-facing privacy policy is maintained in
[`../PRIVACY.md`](../PRIVACY.md), published from the public repository, and
linked from the Chrome Web Store privacy disclosures.

### Phase 9 — Saved Analysis History

Store successful analysis records locally using a versioned, bounded schema. Let users reopen, delete, or clear saved analyses while keeping malformed or older records from breaking the side panel.

### Phase 10 — Job Preferences and Fit Context

Add optional local preferences for factors such as location, work arrangement, compensation, benefits, and employment type. Show preference matches, conflicts, and unknowns separately from the resume qualification score so the existing percentage retains its meaning.

### Phase 11 — Resume Improvement Suggestions

Generate suggestions from partial matches and gaps while distinguishing weak resume evidence from genuinely missing experience. Suggestions must never invent skills, credentials, accomplishments, or metrics and must not overwrite the saved resume.

### Phase 12 — Automatic Job-Page Capture

Add an explicit, user-triggered page-text fallback while continuing to prefer selected text. Start with site-agnostic readable-content extraction, preview the result before analysis, preserve manual selection, and review whether the extension's host permissions can be narrowed.

The implementation-ready task breakdown and acceptance checks for these phases live in `docs/plan-checklist.md`.
