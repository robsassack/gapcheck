# GapCheck

GapCheck is a Chrome extension for comparing a selected job posting against a saved resume and surfacing a gap analysis. The current repo is a plain Manifest V3 scaffold: it loads as an unpacked extension, opens a side panel, saves resume bullets locally, and captures selected page text.

The Nano analysis pipeline is planned but not implemented yet.

## Load in Chrome

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Click Load unpacked.
4. Select this project folder:

   ```text
   /Users/rob/Documents/dev/gapcheck
   ```

5. Pin GapCheck from the toolbar menu if you want quick access.

## Reload After Changes

Chrome does not automatically reload unpacked extensions after file changes.

After editing extension files, open `chrome://extensions` and click the reload icon on the GapCheck extension card. If the side panel or options page is already open, close and reopen it after reloading.

## Built-In AI Requirement

GapCheck is designed to use Chrome's built-in Prompt API with Gemini Nano for local analysis. The extension should handle model readiness in the side panel: checking `LanguageModel.availability()`, triggering the model download from the Analyze button when needed, and showing download or unavailable states.

No API keys or server calls are planned for the v1 analysis flow.
