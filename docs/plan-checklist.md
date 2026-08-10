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
  - [x] Probe actual session creation before analysis because Chrome can report `"available"` while its model process is in crash or timeout backoff
  - [x] Treat known model-process failures as non-retryable and show restart plus `chrome://on-device-internals` guidance
  - [x] Treat `"unavailable"` as a current Chrome runtime state rather than claiming the device is permanently unsupported
  - [x] Recheck temporary unavailability automatically and provide an in-panel session retry before showing advanced diagnostics
  - [x] If availability is `"downloadable"`, trigger `LanguageModel.create()` from the analyze action and show `downloadprogress` in the panel
  - [x] Show model-download percentage and finalization in the status row, poll externally active downloads, and mark completion as `"Ready"`
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
- [x] Add a compact benchmark-runner and debug-report workflow
  - [x] Load jobs and resumes from the packaged fixture directories
  - [x] Select benchmark families and repetition count
  - [x] Select targeted strong, medium, or clear-mismatch resume cases
  - [x] Support controlled, full-pipeline, Pass 1-only, and pinned Pass 2 test modes
  - [x] Run analyses sequentially with progress and elapsed time
  - [x] Capture Pass 1 requirements and full Pass 2 results
  - [x] Preserve individual analysis failures without stopping the queue
  - [x] Allow cancellation after the current analysis
  - [x] Copy a compact JSON or Markdown report
  - [x] Run the benchmark runner in Chrome and verify a complete queue
- [x] Run each benchmark repeatedly and record the observed variation
  - [x] Record the initial three-repetition Web Developer controlled-comparison baseline
    - [x] Pass 1 returned the same 11 grouped requirements in every repetition
    - [x] Strong scored 100, 95, and 95; medium scored 68, 68, and 73; clear mismatch scored 27, 14, and 32
    - [x] Evidence IDs eliminated exact-copy failures, but irrelevant real bullets still received credit
  - [x] Record a comparable Product Operations baseline
    - [x] Pass 1 returned the same 20 requirements in every repetition, but over-selected example tasks and omitted experience, domain, and work-constraint qualifications
    - [x] Medium scored 85 in every repetition and clear mismatch scored 0 in every repetition; medium exceeded its 40-70 target range
    - [x] Strong failed all three repetitions because its Pass 2 response repeated an evidence ID after retry
    - [x] Adjacent business-operations evidence received covered credit for several product- and software-context requirements
    - [x] First refinement rerun scored strong 93, medium 83, and clear mismatch 0 in every repetition; malformed output was resolved, but medium remained over-credited
    - [x] Final refinement rerun was stable and in range: strong 100, medium 68, and clear mismatch 0 in every repetition
- [x] Audit Pass 1 independently
  - [x] Label explicit source bullets and preserve wrapped compound bullets as single extraction candidates
  - [x] Recover sentence-like list boundaries under common requirement headings when page capture strips bullet markers
  - [x] Consolidate model fragments within each source item without merging unrelated lines from the same section
  - [x] Keep separate source sentences distinct when over-limit prose fragments are consolidated
  - [x] Compare extracted requirements across repeated runs
  - [x] Check for missing must-haves, duplicated requirements, and unstable grouping
- [x] Audit Pass 2 independently
  - [x] Reference resume evidence with code-owned bullet IDs and map valid IDs back to original bullet text
  - [x] Reject and retry unsupported or unrecognized matched-bullet evidence
  - [x] After retry, normalize unsupported statuses conservatively while rejecting fabricated bullets
  - [x] Normalize severity deterministically so covered uses `null` and missing partial/gap severity defaults to `medium`
  - [x] Check explicit resume evidence is not classified as a gap
  - [x] Check transferable evidence is consistently distinguished from direct evidence
  - [x] Check cited resume bullets genuinely support each classification
  - [x] Recover conservative partial credit when exact named skills or delivery practices are explicit but overlooked
  - [x] Exclude contact-only text and generic AI-tool usage from specialized technical evidence
  - [x] Promote a partial only when action-based evidence passes strict full-requirement coverage checks
- [x] Refine the prompt only for systematic errors reproduced across the benchmark set
  - [x] Make Pass 2 select and validate evidence before assigning a status
  - [x] Require evidence to demonstrate the same core capability, work domain, or a clearly established equivalent
  - [x] Remove or tightly qualify the instruction to prefer partial over gap
  - [x] Keep genuinely adjacent and transferable experience eligible for partial credit
- [x] Improve evidence selection and matched-bullet relevance
  - [x] Treat unrelated-domain activity and generic word overlap as no evidence
  - [x] Prevent names, contact details, employer names, and job titles from serving as the sole evidence for a match
  - [x] Require full or nearly full evidence before marking a compound requirement covered
  - [x] Re-run the Web Developer benchmarks and confirm warehouse evidence no longer supports web-specific requirements
  - [x] Re-run Product Operations to confirm the refinement does not suppress legitimate transferable evidence
- [x] Add representative score-calibration benchmarks using synthetic content
  - [x] Add a fictional junior full-stack benchmark covering frontend, backend, cloud, DevOps, and optional technology experience
  - [x] Add a fictional software-consultancy benchmark covering collaborative development practices, testing, client work, and non-resume-verifiable constraints
  - [x] Use invented employers, candidates, responsibilities, qualifications, and resume evidence rather than copied or lightly anonymized real material
  - [x] Pin expected requirement themes, important classifications, and acceptable score ranges
  - [x] Run controlled and repeated comparisons to distinguish extraction variation from classification variation
- [x] Classify extracted requirements by source type
  - [x] Distinguish required qualifications, preferred qualifications, core responsibilities, and work or application constraints
  - [x] Preserve explicit source qualifiers such as required, preferred, desirable, plus, and not required
  - [x] Keep source-type metadata code-owned after extraction and available to scoring
  - [x] Add schema validation and malformed-output handling for requirement metadata
- [x] Separate non-resume-verifiable constraints from qualification evidence
  - [x] Identify availability, location, work arrangement, travel, schedule, and interview or trial-period commitments
  - [x] Treat a resume's silence about those constraints as unknown rather than a gap
  - [x] Exclude unknown constraints from the resume qualification score
  - [x] Preserve extracted constraints for the Phase 10 preference-fit analysis
  - [x] Test explicit resume matches, explicit conflicts, and missing information; confirm all remain unknown and unscored until Phase 10 preference-fit analysis
- [x] Audit score sensitivity to requirement extraction and grouping
  - [x] Compare scores when closely related requirements are split versus combined
  - [x] Confirm optional lists and compound requirements do not receive disproportionate influence
  - [x] Check that the 20-item cap and eligibility-first ordering do not materially distort representative scores
  - [x] Prefer stable theme-level influence over sensitivity to exact requirement count
  - [x] Confirm the corrected representative rerun remained directionally stable (`42%` with 12 extracted items; `39%` with 14)
- [x] Evaluate requirement-aware scoring
  - [x] Pin proposed source-type weights and a severity formula in the plan before changing code
  - [x] Ensure preferred qualifications influence the score less than required qualifications
  - [x] Ensure responsibilities do not overwhelm candidate qualifications
  - [x] Compare status-only, source-weighted, severity-weighted, and combined formulas against every benchmark
  - [x] Reject the change if severity variation makes scores less stable or less intuitive (rejected at the earlier improvement gate; no stability rerun needed)
  - [x] If adopted, implement the formula as a pure code-owned function (not adopted; retain the existing pure status-only function)
  - [x] Add deterministic browser-run tests for all statuses, source types, severities, and zero-weight or excluded constraints
- [x] Improve long job-posting handling
  - [x] Replace first-6,000-character truncation with paragraph-aware bounded chunks
  - [x] Extract requirements from every chunk sequentially
  - [x] Merge and deduplicate requirements across chunks before applying the 20-item cap
  - [x] Preserve source-type and qualifier metadata during consolidation
  - [x] Add a bounded total-input safeguard with a visible warning if text is excluded
  - [x] Add regression tests for important requirements appearing after character 6,000
  - [x] Show useful progress while multiple Pass 1 chunks are processed
  - [x] Re-run the long-input production browser test
- [x] Re-run malformed-output, long-input, and manual browser tests
- [x] Document the resulting scoring behavior and known limitations
- [x] Add a Cancel analysis button for the current side-panel analysis
  - [x] Abort the active model prompt/session without clearing the last completed result
  - [x] Restore the analyze controls and show a clear cancelled state

---

## Phase 7 — PDF Resume Import

- [x] Select a local PDF text-extraction approach compatible with Manifest V3
- [x] Review dependency license, packaged size, and content-security-policy needs
- [x] Add a local PDF file picker to the options page
- [x] Extract PDF text without uploading the file
- [x] Preview extracted text before replacing the saved resume
- [x] Feed confirmed text through the existing normalization and bullet parser
- [x] Preserve pasted text as a fallback and existing saved data until import is confirmed
- [x] Handle encrypted, malformed, empty, and image-only PDFs with clear errors
- [x] Test generated single-column, multi-column, and long resume PDFs
- [x] Confirm no network calls are introduced
- [x] Update README usage, privacy, and limitations
- [x] Run a manual Chrome options-page smoke test with a real resume PDF

---

## Phase 8 — Chrome Web Store Release

- [x] Review current Chrome Web Store policies and developer-account requirements
- [x] Audit manifest permissions and document why broad page access is required
  - [x] Record the `<all_urls>` decision, `activeTab` alternative, and Store disclosure in [`permissions.md`](permissions.md)
- [x] Prepare a production package that excludes development-only tests and documentation
- [x] Validate manifest metadata, icons, versioning, and minimum Chrome requirements
- [x] Prepare the store description and screenshots; decide on optional promotional assets
  - [x] Finalize and record the detailed store description
  - [x] Prepare a current 1280×800 PDF-import screenshot
  - [x] Recapture the 1280×800 analysis screenshot with the latest scoring behavior
  - [x] Defer the 440×280 small promotional tile unless the live Dashboard requires it or post-release discovery work warrants it
  - [x] Skip the optional 1400×560 marquee promotional image for the initial release
- [ ] Complete privacy disclosures for local resume storage, selected page text, and on-device analysis
  - [x] Draft and verify the public-facing privacy policy in [`../PRIVACY.md`](../PRIVACY.md)
  - [ ] Publish the policy at a stable public URL and complete the Store privacy questionnaire
- [ ] Run a fresh-install smoke test, including first-time model download and PDF import
- [ ] Test the packaged build on representative supported desktop environments
- [ ] Upload the production package and resolve automated validation findings
- [ ] Submit for review and record the release process for future updates

---

## Phase 8.5 — Optional Post-Release Benchmark Calibration

- [x] Record a one-repetition controlled-comparison baseline across all four benchmark families and all three resume cases
  - [x] Confirm strong, medium, and clear-mismatch ordering is preserved
  - [x] Confirm every analysis completes without a Pass 1 or Pass 2 runtime error
  - [x] Record the observed Pass 1 omissions, requirement-limit warnings, score-range warnings, and analysis durations
- [ ] Run **Pass 1 audit only** for all four benchmark families with three repetitions
  - [ ] Compare each family’s extracted themes, grouping, omissions, and requirement-limit behavior across repetitions
  - [ ] Treat a theme omitted in at least two of three repetitions as a systematic Pass 1 issue rather than ordinary model variation
- [ ] Run **Pass 2 audit with pinned requirements** for three repetitions on the currently uncertain cases
  - [ ] Junior Full-Stack / Strong
  - [ ] Product Operations / Medium
  - [ ] Confirm fixture-specific target ranges and important classifications hold without unsupported evidence or ordering reversals
- [ ] Review the staged reports as post-release calibration evidence
  - [ ] Accept the staged protocol when results are stable and no shared-pipeline regression is indicated
  - [ ] Run a complete three-repetition controlled comparison only when targeted results are inconclusive, reveal cross-family risk, or follow another shared analysis-pipeline change
  - [ ] Keep local Nano calls sequential; do not parallelize benchmark model sessions on the same device

This phase is optional and does not block the initial Chrome Web Store upload or
submission. The completed one-repetition controlled baseline, deterministic
regression suite, successful browser rerun, and validated production package
provide sufficient confidence for the initial release. Complete the remaining
items when calibrating a post-release accuracy update or investigating user
feedback.

Expected additional runtime for the staged protocol is approximately 20 minutes
on the current test machine: about 11–12 minutes for the repeated Pass 1 audit
and 8–10 minutes for the two targeted pinned Pass 2 cases. This preserves
model-call quality while avoiding a roughly one-hour full repeated matrix when
the targeted results provide sufficient release confidence.

---

## Phase 9 — Saved Analysis History

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

## Phase 10 — Job Preferences and Fit Context

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

## Phase 11 — Resume Improvement Suggestions

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

## Phase 12 — Automatic Job-Page Capture

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
