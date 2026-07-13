# Gapcheck — Development Checklist

A phase-by-phase build checklist derived from `gapcheck-plan.md`. Check items off as you go.

---

## Phase 0 — Scaffold (Complete)

- [x] Manifest V3 extension loadable unpacked
- [x] Side panel opens on toolbar icon click (`sidePanel.setPanelBehavior`)
- [x] `LanguageModel.availability()` check with human-readable status + dot indicator in panel
- [x] Options page: paste resume as plain text, saved as bullet array to `chrome.storage.local`
- [x] "Capture selected text" grabs `window.getSelection()` from active tab and previews it
- [x] Storage change listener keeps panel's resume status in sync with options page

---

## Phase 1 — Schema Design (Do This Before Writing `nano.js`)

Pin these down on paper/in a schema file first — retrofitting after the pipeline is wired up is more expensive than deciding now.

- [x] Write the Pass 1 JSON Schema: `{ requirements: string[] }`
  - [x] Set `maxItems` on `requirements[]` (`20`)
  - [x] Draft the system prompt instruction to pair with the cap: return at most 20 requirements, prioritizing the most important concrete requirements if more are present
- [x] Write the Pass 2 JSON Schema: `{ matches: Match[], summary: string }`
  - [x] Define `Match` shape: `{ requirement: string, status: "covered" | "partial" | "gap", matchedBullets: string[], severity: "low" | "medium" | "high" | null }`
  - [x] Confirm `matchedBullets` and `severity` are present (not conditionally omitted) on every item, per `responseConstraint`'s need for a consistent shape
  - [x] Decide the `severity` scale and confirm it applies to `partial` as well as `gap`
  - [x] Draft the system prompt instruction: "return one `matches` item for each provided requirement, in the same order" (JSON Schema alone won't enforce this one-to-one correspondence)
- [x] Pin the v1 scoring formula as a code-level constant/function, separate from the prompt work:
  - [x] `covered = 1`, `partial = 0.5`, `gap = 0`, averaged and expressed as a percentage
  - [x] Note severity-weighting as an explicit v2 stretch, not a v1 requirement

---

## Phase 2 — `nano.js` Pipeline

- [x] Pass 1 (extraction)
  - [x] Truncate captured job text to ≤ 6,000 chars
  - [x] Create fresh `LanguageModel` session with extraction system prompt
  - [x] Call `.prompt()` with `responseConstraint` set to the Pass 1 schema
  - [x] `JSON.parse` the result; sanity-check it's an array within the `maxItems` bound
  - [x] `.destroy()` the session in a `finally` block
- [x] Pass 2 (analysis)
  - [x] Create fresh `LanguageModel` session with analysis system prompt
  - [x] Pass in `requirements[]` (from Pass 1) + `resumeBullets[]` (from `chrome.storage.local`)
  - [x] Call `.prompt()` with `responseConstraint` set to the Pass 2 schema
  - [x] `JSON.parse` the result; sanity-check `matches.length === requirements.length`
  - [x] `.destroy()` the session in a `finally` block
- [x] Scoring
  - [x] Implement the pinned scoring function as a pure function taking `matches[]` and returning `overallScore`
  - [x] Add a browser-run scoring test fixture against hand-built `matches[]` cases (all covered, all gap, mixed, empty)
- [x] Error handling
  - [x] Handle `LanguageModel.availability()` states other than `"available"` gracefully (e.g. block the analyze action, show a download-in-progress message)
  - [x] If availability is `"downloadable"`, trigger `LanguageModel.create()` from the analyze action and show `downloadprogress` in the panel
  - [x] Handle malformed/unparseable model output without crashing the panel (retry once, then show an error state)
  - [x] Handle empty selection / empty resume with a clear inline message instead of silently failing

---

## Phase 3 — Results UI

- [x] Replace the separate capture/analyze testing flow with one primary "Analyze selected text" action
  - [x] Read the current page selection from the active tab
  - [x] Preview the captured text in the collapsible dropdown
  - [x] Trigger Pass 1, Pass 2, and scoring from the same click
- [x] Loading state while Pass 1 / Pass 2 are running (these are on-device calls and won't be instant)
- [x] Render `overallScore` prominently
- [x] Render three filtered sections from `matches[]`:
  - [x] Covered (`status === "covered"`) — show `matchedBullets`
  - [x] Partial (`status === "partial"`) — show `matchedBullets` + `severity`
  - [x] Gaps (`status === "gap"`) — show `severity`
- [x] Render `summary` text
- [x] Empty-state handling (no job text captured yet, no resume saved yet)

---

## Phase 4 — Manual Testing Pass

- [x] Test against a short, well-structured job posting (clean bullet-list requirements)
- [x] Test against a long, prose-heavy job posting (requirements buried in paragraphs)
- [x] Test against a posting near/over the 6,000-char truncation limit
- [x] Test with a short resume (5–10 bullets)
- [x] Test with a long resume (20–30 bullets) — check Pass 2 stays within Nano's token budget
- [x] Test with a resume that has zero overlap with the posting (all gaps)
- [x] Test with a resume that fully covers the posting (all covered)
- [x] Re-run the same job + resume pair multiple times — check `matches[]` status classifications for run-to-run consistency (expected to vary somewhat on-device; confirm it's within a tolerable range)
- [x] Test on each supported OS if possible (Windows, macOS, Linux), since the Prompt API is desktop-only

---

## Phase 5 — Polish / Pre-Release

- [x] Confirm `chrome://on-device-internals` download-progress messaging is surfaced somewhere if the model isn't downloaded yet
- [x] Review copy/wording on empty states, error states, and the availability-status indicator
- [x] Confirm no network calls are made anywhere in the extension (matches the "nothing leaves the browser" claim)
- [x] Write/update the extension's README or store listing description
- [x] Final pass on `// @ts-check` + JSDoc types — no type errors across `nano.js` and panel scripts

---

## Phase 6 — Analysis Quality and Calibration

- [x] Establish a benchmark set
  - [x] Define the shared benchmark jobs
    - [x] Revise the Product Operations job to stay below the Pass 1 character limit
    - [x] Revise the Web Developer job as a second role family
    - [x] Identify the stable requirement themes each benchmark should exercise
  - [x] Prepare the Product Operations benchmark resumes
    - [x] Revise the strong-match resume to use natural, non-mirrored evidence
    - [x] Add a deliberately mixed medium-match resume
    - [x] Review and rename the clear-mismatch resume
  - [x] Prepare the Web Developer benchmark resumes
    - [x] Add a strong-match resume with direct front-end evidence
    - [x] Add a medium-match resume with adjacent website experience
    - [x] Add a clear-mismatch resume with no development experience
  - [x] Document expected benchmark behavior
    - [x] Assign a directional score range to each benchmark
    - [x] Document important expected classifications
    - [x] Document acceptable classification variation
    - [x] Document clear regression signals
  - [x] Confirm each fixture is realistic and internally consistent
- [ ] Add a compact benchmark-runner and debug-report workflow
  - [ ] Load jobs and resumes from the packaged fixture directories
  - [ ] Select benchmark families and repetition count
  - [ ] Run analyses sequentially with progress and elapsed time
  - [ ] Capture Pass 1 requirements and full Pass 2 results
  - [ ] Preserve failures without stopping the queue
  - [ ] Allow cancellation
  - [ ] Export or copy a compact report
- [ ] Add a compact debug-report workflow that captures requirements, statuses, severities, matched bullets, and final score
- [ ] Run each benchmark repeatedly and record the observed variation
- [ ] Audit Pass 1 independently
  - [ ] Compare extracted requirements across repeated runs
  - [ ] Check for missing must-haves, duplicated requirements, and unstable grouping
- [ ] Audit Pass 2 independently
  - [ ] Check explicit resume evidence is not classified as a gap
  - [ ] Check transferable evidence is consistently distinguished from direct evidence
  - [ ] Check cited resume bullets genuinely support each classification
- [ ] Refine the prompt only for systematic errors reproduced across the benchmark set
- [ ] Improve evidence selection and matched-bullet relevance
- [ ] Evaluate severity-weighted scoring
  - [ ] Pin a proposed formula in the plan before changing code
  - [ ] Compare the current and proposed formulas against every benchmark
  - [ ] Reject the change if severity variation makes scores less stable or less intuitive
  - [ ] If adopted, implement the formula as a pure code-owned function
  - [ ] Add deterministic browser-run tests for all statuses and severities
- [ ] Re-run malformed-output, long-input, and manual browser tests
- [ ] Document the resulting scoring behavior and known limitations

---

## Phase 7 — Saved Analysis History

- [ ] Define a versioned local analysis-record schema
  - [ ] Include an ID, creation timestamp, score, summary, requirements, and matches
  - [ ] Allow optional job title, company, source URL, and captured-text metadata
  - [ ] Define a bounded retention limit
- [ ] Save successful analyses only
- [ ] Add a history view with newest analyses first
- [ ] Render enough metadata to identify each saved analysis
- [ ] Let users reopen an analysis without rerunning Nano
- [ ] Add delete-one and clear-all actions with confirmation where appropriate
- [ ] Handle empty history and storage errors with inline states
- [ ] Ignore or safely migrate malformed and older record versions
- [ ] Confirm saved history remains in local extension storage
- [ ] Test save, reopen, delete, clear-all, retention, and schema migration behavior
- [ ] Update privacy and usage documentation

---

## Phase 8 — Job Preferences and Fit Context

- [ ] Define optional preference fields
  - [ ] Location
  - [ ] Remote, hybrid, or on-site work arrangement
  - [ ] Compensation range
  - [ ] Benefits
  - [ ] Employment type
  - [ ] Free-form user priorities
- [ ] Allow each preference category to be disabled or left unset
- [ ] Store preferences locally and add edit/reset controls
- [ ] Define structured model output for preference matches, conflicts, and unknowns
- [ ] Keep preference fit separate from the resume qualification score
- [ ] Treat missing job-posting information as unknown rather than a mismatch
- [ ] Render preference results in a distinct section
- [ ] Handle empty preferences and malformed preference output gracefully
- [ ] Test complete, partial, absent, and contradictory posting information
- [ ] Confirm preferences do not alter existing qualification classifications or scoring

---

## Phase 9 — Resume Improvement Suggestions

- [ ] Define structured suggestion output derived from partial matches and gaps
- [ ] Distinguish missing resume evidence from genuinely missing experience
- [ ] Instruct the model never to fabricate skills, credentials, accomplishments, or metrics
- [ ] Generate suggestions only after a successful analysis
- [ ] Present suggestions as optional guidance without changing the saved resume
- [ ] Add copy controls for individual suggestions
- [ ] Add clear AI-generated-content guidance
- [ ] Handle no-suggestion and malformed-output cases
- [ ] Test strong matches, weakly evidenced experience, transferable experience, and true gaps
- [ ] Verify suggestions stay grounded in the saved resume and analyzed posting

---

## Phase 10 — PDF Resume Import

- [ ] Select a local PDF text-extraction approach compatible with Manifest V3
- [ ] Review dependency license, packaged size, and content-security-policy needs
- [ ] Add a local PDF file picker to the options page
- [ ] Extract PDF text without uploading the file
- [ ] Preview extracted text before replacing the saved resume
- [ ] Feed confirmed text through the existing normalization and bullet parser
- [ ] Preserve pasted text as a fallback and existing saved data until import is confirmed
- [ ] Handle encrypted, malformed, empty, and image-only PDFs with clear errors
- [ ] Test representative single-column, multi-column, and long resumes
- [ ] Confirm no network calls are introduced
- [ ] Update README usage, privacy, and limitations

---

## Phase 11 — Automatic Job-Page Capture

- [ ] Add an explicit user-triggered "Use page text" action
- [ ] Continue to prefer selected text when a selection exists
- [ ] Extract readable page content without site-specific selectors in the initial implementation
- [ ] Reduce navigation, footer, cookie-banner, and unrelated page text where practical
- [ ] Preview captured page text before analysis
- [ ] Apply the existing job-text length limit and truncation messaging
- [ ] Handle restricted pages, sparse content, and script-injection failures
- [ ] Preserve manual selection as a fallback
- [ ] Review whether current host permissions can be narrowed
- [ ] Test common job boards and generic company career pages
- [ ] Reconfirm local-only privacy behavior and update usage documentation
