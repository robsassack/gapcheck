# GapCheck

GapCheck is a Manifest V3 Chrome extension that compares a selected job posting against a saved resume using Chrome's built-in Gemini Nano model. It produces an on-device match score and organizes the posting's requirements into Covered, Partial, and Gaps sections with supporting resume evidence.

## Features

- Save a resume locally from the extension's options page.
- Select job-posting text on a webpage and analyze it from the side panel.
- Review a match score, concise summary, and requirement-by-requirement results.
- Keep the resume and analysis on the device with no API keys or server calls.

## Load in Chrome

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select this repo's project folder.
5. Pin GapCheck from the toolbar menu if you want quick access.

## Use GapCheck

1. Open GapCheck's options page and paste your resume.
2. Click Save resume.
3. Open a job posting and select the text you want to analyze.
4. Open the GapCheck side panel and click Analyze selected text.
5. Review the score, summary, covered requirements, partial matches, and gaps.

## Reload After Changes

Chrome does not automatically reload unpacked extensions after file changes.

After editing extension files, open `chrome://extensions` and click the reload icon on the GapCheck extension card. If the side panel or options page is already open, close and reopen it after reloading.

## Development Benchmark Runner

GapCheck includes a browser-based runner for the packaged Product Operations and
Web Developer benchmarks. After loading or reloading the unpacked extension:

1. Open `chrome://extensions` and copy the ID shown on the GapCheck extension card.
2. Replace `<extension-id>` in the URL below with that ID:

   ```text
   chrome-extension://<extension-id>/tests/benchmark-runner.html
   ```

3. Open the resulting URL in Chrome, select the benchmark families and
   repetition count, and click Run benchmarks.

Each Nano analysis can take one to two minutes. Keep the runner page open and
the computer awake until the queue finishes. See the
[benchmark fixture guide](tests/fixtures/README.md) for the fixture structure,
expected behavior, cancellation behavior, and report details.

## Built-In AI Requirement

GapCheck uses Chrome's built-in Prompt API with Gemini Nano for local analysis. It requires a supported desktop Chrome installation with the Prompt API available. The side panel checks model readiness, starts the model download from the Analyze action when needed, and displays download or unavailable states.

The initial model download can take time. If Chrome reports that the model is unavailable, follow the status shown in the side panel and confirm that the device and Chrome installation support the built-in Prompt API.

## Privacy

Neither your resume nor your analysis leaves your device. GapCheck stores the saved resume in Chrome's local extension storage and does not require an API key or make server calls for analysis.

## Current Limitations

- Match results are AI-generated and can vary between runs.
- The score is a directional comparison, not a hiring recommendation or guarantee.
- Job text must be selected manually; GapCheck does not automatically scrape the page.
- Resumes are pasted as text; PDF resume parsing is not included in version 1.0.

## Version

Current release: **1.0.0**
