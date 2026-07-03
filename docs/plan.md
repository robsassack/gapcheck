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
- `responseConstraint` with JSON schema → returns `{ requirements: string[] }`
- Session destroyed after use
- Feeds only the raw job text into a fresh Nano session — its one job is to identify and return a clean array of discrete requirement lines, not to analyze anything yet. Because the output is short (target: ~20 items at 10–15 words each), this pass stays well within the token budget even for a long job posting. The essential requirements almost always appear early, which is why the character truncation is a reasonable safety valve rather than a lossy compromise.

### Pass 2 — Analysis (purple)

- **Input:** `requirements[]` from Pass 1 + `resumeBullets[]` from storage (both already condensed)
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

Expressed as a percentage (e.g. `overallScore = Math.round(sum / matches.length * 100)`). This is a v1 baseline — weighting by `severity` (e.g. a `gap` on a high-severity requirement counting more than a low-severity one) is a reasonable v2 refinement, but isn't required to ship.

**Schema details to pin down before building:**
- `matchedBullets` is a `string[]`, not a single nullable string — a requirement may be supported by two weaker bullets together, and an empty array is cleaner to handle than `null`.
- `severity` should be a nullable/optional field present on every item (not conditionally present), since the JSON Schema passed to `responseConstraint` wants a consistent shape across all array items.
- Decide the `severity` scale up front (e.g. `low | medium | high`) and apply it to `partial` matches too, not just `gap` — a partial match on a "must-have" requirement is more significant than a partial on a "nice-to-have."
- Pass 1's schema should set `maxItems` on the `requirements[]` array to keep Pass 2's input bounded.
- Pass 2's schema should require exactly one `matches` item per requirement where possible; the system prompt should also explicitly instruct the model to "return one `matches` item for each provided requirement, in the same order," since JSON Schema alone can constrain shape but not this kind of one-to-one correspondence.

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

**Out (stretch/v2):**
- PDF resume upload/parsing
- Auto-scraping the job page DOM
- History of saved analyses
- Resume rewriting suggestions

## Current State

Scaffold is complete and loadable as an unpacked extension. What works:

- Side panel opens on toolbar icon click (`sidePanel.setPanelBehavior`)
- `LanguageModel.availability()` check with human-readable status and dot indicator in the panel
- Resume paste/save/bullet-split on the options page (`chrome.storage.local`)
- "Capture selected text" grabs `window.getSelection()` from the active tab and previews it
- Storage change listener keeps the panel's resume status in sync with the options page

**Nothing is built yet:** no Nano `.create()` or `.prompt()` calls, no two-pass pipeline, no results UI.

**Next step:** Build `nano.js` — the two-pass pipeline — and wire in an Analyze button to the side panel.

## Open Questions / Things to Pressure-Test Before Building

1. **Confirm the exact `maxItems` value for Pass 1's `requirements[]` schema.** The plan calls for capping the array via `maxItems` (see schema details above), but the concrete number isn't pinned yet — a verbose posting could still push Nano toward over-extraction (splitting a single compound requirement into several lines) even with a cap in place. Settle on a specific value (e.g. 15–20) and pair it with an explicit instruction like "the most important N requirements."

2. **Pass 2 input budget isn't just `requirements[]`.** `resumeBullets[]` is a second variable-length input competing for the same ~2K token window. A resume with 20–30 bullets (common for someone with a decade of experience) is worth sanity-checking against total token count, not just a short-resume case.

3. **Determinism/consistency.** On-device small models can vary run-to-run more than a hosted large model for the same input. Since `overallScore` is now code-computed from `matches[]`, the score itself is stable given a fixed `matches[]` output — but the underlying `status` classifications (covered vs. partial vs. gap) can still vary between runs on the same input. Worth deciding whether that's fine as "directionally useful," or whether temperature reduction / few-shot examples in the system prompt are needed to tighten consistency.
