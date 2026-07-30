# Gapcheck — Chrome Extension: Project Plan

## Concept

A Chrome extension that compares a selected job posting against a saved resume and outputs a gap analysis — what's covered, what's missing, overall match score. Portfolio project demonstrating on-device AI via Chrome's built-in Gemini Nano. Fully self-contained: no API keys, no server, nothing leaving the browser.

## UX Flow

1. User selects job description text on any page (LinkedIn, Indeed, Greenhouse, anywhere)
2. Clicks the Gapcheck icon in the Chrome toolbar
3. Side panel opens, user hits "Capture selected text"
4. Analysis runs, results display in the side panel

No DOM scraping, no LinkedIn-specific selectors — selection-based capture keeps it site-agnostic.

## Architecture — Two-Pass Nano Pipeline

All AI work happens via Chrome's built-in Prompt API (`LanguageModel`). No embeddings API, no external calls.

**Why two passes instead of one:** Nano's practical context limit is ~2,000 tokens. A full resume plus a full job description in one prompt exceeds that and degrades output quality. Two focused passes on small inputs stays well within budget and produces more reliable structured output.

```
Captured job text (truncated to ≤ 6k chars)
        │
        ▼
Pass 1 — Extraction (teal)
Nano identifies requirement lines
responseConstraint → requirements[]
        │
        ▼
   requirements[]
        │
        ▼
Pass 2 — Analysis (purple) ◄── Resume bullets (chrome.storage.local)
Nano matches against resume
responseConstraint → matches[] + summary
        │
        ▼
   Final gap analysis
        │
        ▼
   Side panel results
```

### Pass 1 — Extraction (teal)

- **Input:** raw captured job text, truncated to ≤ 6,000 chars as a safety valve
- Fresh Nano session; system prompt instructs it to identify discrete requirement lines
- `responseConstraint` with JSON schema → returns categorized requirement and explicit-qualifier metadata
- Session destroyed after use
- Before the pipeline begins, create and immediately destroy a lightweight
  session to verify that Chrome can actually start its model process.
  `LanguageModel.availability()` can still report `"available"` while the
  browser-owned runtime is in crash or timeout backoff. Known session-runtime
  failures are not retried; the panel marks the session unavailable and directs
  the user to restart Chrome and inspect `chrome://on-device-internals`.
- Feeds only the raw job text into a fresh Nano session — its one job is to identify and return a clean array of discrete requirement lines, not to analyze anything yet. Because the output is short (target: ~20 items at 10–15 words each), this pass stays well within the token budget even for a long job posting. The essential requirements almost always appear early, which is why the character truncation is a reasonable safety valve rather than a lossy compromise.

### Pass 2 — Analysis (purple)

- **Input:** structured `requirements[]` from Pass 1 + `resumeBullets[]` from storage (both already condensed); only requirement text is model-visible in Pass 2
- Second fresh Nano session; system prompt instructs it to match requirements against bullets
- `responseConstraint` with JSON schema → returns structured gap analysis
- Session destroyed after use
- Receives two short, already-compact inputs — neither is raw text. Nano's job is to go requirement by requirement and determine whether a resume bullet covers it, then return a structured judgment. Using `responseConstraint` with a JSON schema on both passes constrains the response to valid JSON matching that schema — no regex on prose, no hallucinated formatting — though the result should still be `JSON.parse`d and sanity-checked (e.g. array lengths) rather than trusted blindly.

### Output shape

Revised to a single `matches[]` array with a `status` field (`covered | partial | gap`), rather than separate `covered[]` / `gaps[]` arrays. This guarantees every requirement gets exactly one entry (no chance of a requirement being dropped or double-counted between two separate arrays), and makes `partial` a one-line schema addition instead of a UI restructure.

**Pass 2 (model output):**

```js
{
  matches: [
    { requirement: "CI/CD pipeline experience", status: "covered", matchedBullets: ["Built Azure DevOps pipelines..."], severity: null },
    { requirement: "Kubernetes deployment", status: "gap", matchedBullets: [], severity: "high" },
    { requirement: "Terraform / IaC", status: "partial", matchedBullets: ["Some infra-as-code exposure via CDK"], severity: "medium" }
  ],
  summary: "Strong DevOps foundation, gaps in container orchestration and Terraform."
}
```

**Final result (after code computes the score):**

```js
{
  overallScore: 74, // computed in code from matches[], not returned by the model
  matches: [ /* as above */ ],
  summary: "Strong DevOps foundation, gaps in container orchestration and Terraform."
}
```

`overallScore` is code-owned, not model-owned. Pass 2 returns `matches[]` and `summary` only; the extension computes the score from the `matches[]` breakdown. This gives stable, reproducible scoring across repeated runs on the same input, rather than trusting a raw number Nano might vary on run to run.

**Initial scoring formula (pin this down before coding, so scoring stays a product decision rather than something improvised inside `nano.js`):**

```
score = average over all matches of:
  covered → 1
  partial → 0.5
  gap     → 0
```

Expressed as a percentage (e.g. `overallScore = Math.round(sum / matches.length * 100)`). This is pinned in code as `MATCH_STATUS_SCORES` plus `computeOverallScore(matches)`. Severity weighting is an explicit v2 stretch, not a v1 requirement.

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

**Phase 6 requirement-aware scoring candidates (pin before comparison code):**

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

**Schema details to pin down before building:**
- `matchedBullets` is a `string[]`, not a single nullable string — a requirement may be supported by two weaker bullets together, and an empty array is cleaner to handle than `null`.
- Keep `matchedBullets` as the application-facing result, but use compact code-owned `matchedBulletIds` in the model-facing Pass 2 schema. Constrain those IDs to the supplied resume evidence and map them back to the original bullet strings after validation so the model never has to reproduce full evidence text exactly.
- `severity` should be a nullable field present on every item (not conditionally present), since the JSON Schema passed to `responseConstraint` wants a consistent shape across all array items. Use `null` for covered requirements.
- The severity scale is pinned as `low | medium | high`, and applies to `partial` matches as well as `gap` matches — a partial match on a "must-have" requirement is more significant than a partial on a "nice-to-have."
- Normalize severity deterministically in code before validating Pass 2 output: `covered` always becomes `null`; `partial` or `gap` with a missing or `null` severity becomes `medium`; and valid model-provided `low | medium | high` values remain unchanged. This normalization does not affect the current status-only score.
- Pass 1's schema should set `maxItems: 20` on the `requirements[]` array to keep Pass 2's input bounded.
- Pass 1 returns each requirement with a constrained explicit qualifier (`required`, `preferred`, `desirable`, `plus`, `not-required`, or `null`). Application code derives and freezes one of four source types: required qualification, preferred qualification, core responsibility, or work/application constraint. Pass 2 cannot rewrite this metadata; code reattaches it to each index-aligned match so it is available to later scoring experiments.
- Before Pass 1, label detected source bullets and join their wrapped continuation lines. Also recover complete sentence-like list items under headings such as “What You’ll Do,” “What We’re Looking For,” “Responsibilities,” and “Qualifications” when captured page text has lost its visual bullet markers. The extraction prompt treats each label as indivisible and returns at most one requirement from each source item, preserving compound `and` / `or` qualifications instead of splitting them into separate requirements. If a model still returns fragments, code consolidates every fragment mapped to the same source item independently rather than merging unrelated lines from the surrounding section.
- Pass 2's schema caps `matches[]` at 20 to mirror Pass 1's requirement cap. The system prompt explicitly instructs the model to "return one `matches` item for each provided requirement, in the same order," since JSON Schema alone can constrain shape but not this kind of one-to-one correspondence.

The results UI derives its sections by filtering `matches[]`: `covered` = `status === "covered"`, `gaps` = `status === "gap"`, and `partial` gets its own third visual bucket rather than being folded into either of the other two.

## Tech Stack

- Manifest V3 Chrome extension
- Vanilla JS with `// @ts-check` + JSDoc types
- `@types/chrome` and `@types/dom-chromium-ai` as dev dependencies (editor-only, no build step)
- `chrome.storage.local` for resume storage
- No bundler, no Vite — all plain files, loaded unpacked during development
- Extensions Reloader (Chrome Web Store) for one-click extension reload during dev

## Prompt API Notes (as of mid-2026)

- Global is `LanguageModel` — not `window.ai.languageModel` (older pattern)
- Requires two Chrome flags: `#optimization-guide-on-device-model` and `#prompt-api-for-gemini-nano`
- Desktop only: Windows 10/11, macOS 13+, Linux — no mobile support yet
- ~4GB model download on first use; check progress at `chrome://on-device-internals`
- `LanguageModel.availability()` returns `"available"`, `"downloadable"`, `"downloading"`, or `"unavailable"`
- When availability is `"downloadable"`, call `LanguageModel.create()` from a user-initiated action (the Analyze button) to trigger the model download; attach a `downloadprogress` monitor and show progress/ready messaging in the side panel
- `responseConstraint` accepts a JSON Schema and constrains the response to valid JSON matching that schema (not a hard guarantee of "typed" output) — use this on both passes, and still `JSON.parse` the result plus validate/sanity-check counts (e.g. array lengths) afterward
- Each pass should create a fresh session and call `.destroy()` in a `finally` block when done
- Distributing as a packaged extension gives stable API access without an origin trial token

## v1 Scope

**In:**
- Side panel UI (toolbar icon → side panel)
- Options page: paste resume as plain text, saved as array of bullets to `chrome.storage.local`
- Capture selected text from active tab via `chrome.scripting.executeScript`
- `nano.js` module: two-pass pipeline with extraction and analysis sessions
- Results UI: overall score, with three buckets — covered requirements (with matched bullets), partial matches (with matched bullets and severity), and flagged gaps (with severity)

**Deferred until after v1:**
- Analysis calibration and optional severity-weighted scoring
- History of saved analyses
- Job preferences and fit context
- Resume improvement suggestions
- PDF resume import
- Automatic job-page capture

## Current State

Version 1.0 is implemented in the unpacked extension. Phases 0–5 of the development checklist are complete. The current product includes:

- Side panel opens on toolbar icon click (`sidePanel.setPanelBehavior`)
- `LanguageModel.availability()` check with human-readable status and dot indicator in the panel
- Resume paste/save/bullet-split on the options page (`chrome.storage.local`)
- A single "Analyze selected text" action that captures `window.getSelection()`, previews it, and runs both Nano passes
- Storage change listener keeps the panel's resume status in sync with the options page
- `nano.js` runs the two-pass Prompt API pipeline: Pass 1 extracts requirements, Pass 2 compares them to saved resume bullets, and code computes `overallScore`
- A results view with the code-owned score, summary, and expanded Covered, Partial, and Gaps sections
- Model availability, download progress, malformed-output retry, and actionable empty/error states
- Local-only resume storage and analysis with no API keys or server calls
- README includes a side panel screenshot from `assets/Screenshot_20260720_004538.png`

The v1 score remains directional because Nano's extracted requirements and classifications can vary between runs. The deterministic scoring function produces the same score for the same `matches[]`; improving model consistency is the first post-v1 phase.

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

## Post-v1 Roadmap

### Phase 6 — Analysis Quality and Calibration

Build a repeatable benchmark set, separate Pass 1 extraction issues from Pass 2 classification issues, and improve evidence selection only where testing shows systematic errors. Evaluate severity-weighted scoring after classification quality is stable; adopt it only if it improves the benchmark results without increasing run-to-run instability.

### Phase 7 — Saved Analysis History

Store successful analysis records locally using a versioned, bounded schema. Let users reopen, delete, or clear saved analyses while keeping malformed or older records from breaking the side panel.

### Phase 8 — Job Preferences and Fit Context

Add optional local preferences for factors such as location, work arrangement, compensation, benefits, and employment type. Show preference matches, conflicts, and unknowns separately from the resume qualification score so the existing percentage retains its meaning.

### Phase 9 — Resume Improvement Suggestions

Generate suggestions from partial matches and gaps while distinguishing weak resume evidence from genuinely missing experience. Suggestions must never invent skills, credentials, accomplishments, or metrics and must not overwrite the saved resume.

### Phase 10 — PDF Resume Import

Extract text from a locally selected PDF, preview it, and feed it through the existing resume-normalization path without uploading the file. Keep pasted text as a fallback and clearly reject encrypted, malformed, empty, or image-only PDFs that cannot be processed.

### Phase 11 — Automatic Job-Page Capture

Add an explicit, user-triggered page-text fallback while continuing to prefer selected text. Start with site-agnostic readable-content extraction, preview the result before analysis, preserve manual selection, and review whether the extension's host permissions can be narrowed.

The implementation-ready task breakdown and acceptance checks for these phases live in `docs/plan-checklist.md`.
