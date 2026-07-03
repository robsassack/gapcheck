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

- [ ] Pass 1 (extraction)
  - [ ] Truncate captured job text to ≤ 6,000 chars
  - [ ] Create fresh `LanguageModel` session with extraction system prompt
  - [ ] Call `.prompt()` with `responseConstraint` set to the Pass 1 schema
  - [ ] `JSON.parse` the result; sanity-check it's an array within the `maxItems` bound
  - [ ] `.destroy()` the session in a `finally` block
- [ ] Pass 2 (analysis)
  - [ ] Create fresh `LanguageModel` session with analysis system prompt
  - [ ] Pass in `requirements[]` (from Pass 1) + `resumeBullets[]` (from `chrome.storage.local`)
  - [ ] Call `.prompt()` with `responseConstraint` set to the Pass 2 schema
  - [ ] `JSON.parse` the result; sanity-check `matches.length === requirements.length`
  - [ ] `.destroy()` the session in a `finally` block
- [ ] Scoring
  - [ ] Implement the pinned scoring function as a pure function taking `matches[]` and returning `overallScore`
  - [ ] Unit-test it against a few hand-built `matches[]` fixtures (all covered, all gap, mixed, empty)
- [ ] Error handling
  - [ ] Handle `LanguageModel.availability()` states other than `"available"` gracefully (e.g. block the Analyze button, show a download-in-progress message)
  - [ ] If availability is `"downloadable"`, trigger `LanguageModel.create()` from the Analyze button click and show `downloadprogress` in the panel
  - [ ] Handle malformed/unparseable model output without crashing the panel (retry once, then show an error state)
  - [ ] Handle empty selection / empty resume with a clear inline message instead of silently failing

---

## Phase 3 — Results UI

- [ ] Wire an "Analyze" button into the side panel that triggers the two-pass pipeline
- [ ] Loading state while Pass 1 / Pass 2 are running (these are on-device calls and won't be instant)
- [ ] Render `overallScore` prominently
- [ ] Render three filtered sections from `matches[]`:
  - [ ] Covered (`status === "covered"`) — show `matchedBullets`
  - [ ] Partial (`status === "partial"`) — show `matchedBullets` + `severity`
  - [ ] Gaps (`status === "gap"`) — show `severity`
- [ ] Render `summary` text
- [ ] Empty-state handling (no job text captured yet, no resume saved yet)

---

## Phase 4 — Manual Testing Pass

- [ ] Test against a short, well-structured job posting (clean bullet-list requirements)
- [ ] Test against a long, prose-heavy job posting (requirements buried in paragraphs)
- [ ] Test against a posting near/over the 6,000-char truncation limit
- [ ] Test with a short resume (5–10 bullets)
- [ ] Test with a long resume (20–30 bullets) — check Pass 2 stays within Nano's token budget
- [ ] Test with a resume that has zero overlap with the posting (all gaps)
- [ ] Test with a resume that fully covers the posting (all covered)
- [ ] Re-run the same job + resume pair multiple times — check `matches[]` status classifications for run-to-run consistency (expected to vary somewhat on-device; confirm it's within a tolerable range)
- [ ] Test on each supported OS if possible (Windows, macOS, Linux), since the Prompt API is desktop-only

---

## Phase 5 — Polish / Pre-Release

- [ ] Confirm `chrome://on-device-internals` download-progress messaging is surfaced somewhere if the model isn't downloaded yet
- [ ] Review copy/wording on empty states, error states, and the availability-status indicator
- [ ] Confirm no network calls are made anywhere in the extension (matches the "nothing leaves the browser" claim)
- [x] Write/update the extension's README or store listing description
- [ ] Final pass on `// @ts-check` + JSDoc types — no type errors across `nano.js` and panel scripts

---

## Explicit Out-of-Scope for v1 (Do Not Start These)

- [ ] PDF resume upload/parsing
- [ ] Auto-scraping the job page DOM
- [ ] History of saved analyses
- [ ] Resume rewriting suggestions
- [ ] Severity-weighted scoring (v2 stretch, formula noted in Phase 1)
