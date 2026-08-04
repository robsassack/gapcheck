# GapCheck Privacy Policy

**Effective date:** August 3, 2026

GapCheck is a Chrome extension that compares text selected from a job posting
with a resume saved in the extension. GapCheck is designed to process this
information locally on the user's device.

This policy explains what information GapCheck handles, why it handles that
information, where it is stored, and the controls available to users.

## Information GapCheck handles

GapCheck handles the following information only when a user provides it or
requests the related feature:

- **Resume text.** A user may paste resume text or select a local PDF from
  which GapCheck extracts text.
- **Selected webpage text.** When the user clicks **Analyze selected text**,
  GapCheck reads only the text currently selected in the active webpage.
- **Analysis data.** GapCheck generates extracted job requirements, resume
  evidence matches, a summary, and a match score from the resume and selected
  job-posting text.

GapCheck does not automatically read entire webpages, monitor browsing
history, or capture page content in the background.

## How GapCheck uses information

GapCheck uses resume text and selected job-posting text solely to provide the
user-requested resume-to-job comparison.

PDF text extraction and AI analysis occur locally on the user's device. AI
analysis uses Chrome's built-in on-device Prompt API and does not require a
GapCheck server or API key. GapCheck does not use this information for
advertising, tracking, profiling, or unrelated purposes. Its results are
informational and are not hiring decisions or guarantees.

## Local storage and retention

GapCheck stores the following information in `chrome.storage.local`:

- The raw resume text the user confirms and saves.
- Parsed resume evidence lines derived from that text.

The saved resume remains in the user's Chrome extension storage until the
user replaces or clears it, or uninstalls GapCheck.

When a user selects a PDF, GapCheck reads the file locally and holds its bytes
and extracted-text preview temporarily in the options page. The PDF file
itself is not saved by GapCheck. Extracted text replaces the saved resume only
after the user clicks **Use and save this resume**. Canceling the import or
closing the options page without confirming does not replace the saved
resume.

Selected webpage text and generated analysis results are held in the active
side-panel interface. GapCheck 1.0.0 does not save them as analysis history.
They are discarded when the extension page is closed or replaced and are not
available to the developer.

## Data transmission, collection, and sharing

GapCheck does not transmit resume text, PDF contents, selected webpage text,
or analysis results to the developer or to third parties. GapCheck has no
developer-operated backend, user accounts, analytics, advertising, or remote
telemetry. It does not sell or share user information.

Chrome may download the built-in AI model needed to provide its on-device
Prompt API. GapCheck does not include resume or job-posting content in a model
download request.

GapCheck's use of information received from Chrome APIs adheres to the Chrome
Web Store User Data Policy, including its Limited Use requirements. GapCheck
uses that information only to provide its disclosed, user-facing resume
comparison feature. It does not transfer the information for advertising,
creditworthiness, lending, data brokerage, or other unrelated purposes, and
it does not permit humans to read the information except when a user
voluntarily includes specific information in a support request.

If a user voluntarily contacts the developer, the developer will receive the
contact information and message contents the user chooses to provide. That
information will be used only to respond to the request, maintain necessary
support records, or comply with law. Users should not send resumes or other
sensitive content in support messages.

## Extension permissions

GapCheck uses these Chrome extension permissions:

- **`sidePanel`:** Displays GapCheck's controls and results in Chrome's side
  panel.
- **`storage`:** Saves the confirmed resume locally in the extension's Chrome
  profile.
- **`scripting`:** Reads the current selection after the user clicks
  **Analyze selected text**.
- **Website access (`<all_urls>`):** Allows the persistent side panel to work
  with user-selected job-posting text across websites and after tab changes.

Website access is exercised only after the user requests analysis. The
injected selection-reading function returns `window.getSelection().toString()`;
it does not read the full page or modify the page. Chrome-protected pages,
including `chrome://` pages and the Chrome Web Store, cannot be analyzed.

More detail is available in the project's
[permissions audit](docs/permissions.md).

## User controls and deletion

Users can:

- Replace the saved resume from GapCheck's options page.
- Clear the resume textarea and click **Save resume** to replace the stored
  resume with empty content.
- Cancel a PDF import before saving it.
- Uninstall GapCheck to remove its local extension storage.

Because GapCheck does not transmit this content to the developer, the
developer cannot view, recover, or remotely delete it.

## Diagnostic logging

Diagnostic logging is disabled by default. If a user explicitly enables
GapCheck's developer-console debug mode, local console logs may contain
selected job text, resume evidence, prompts, model output, or analysis data.
These logs are not transmitted by GapCheck. Users should disable debug mode
and clear the console before sharing diagnostic output.

## Security

GapCheck limits exposure by processing information locally and not
transmitting user content. Information stored by GapCheck is still subject to
the security of the user's device, operating system, and Chrome profile. No
method of storage can be guaranteed to be completely secure.

## Children's privacy

GapCheck is a general-purpose job-search utility and is not directed to
children under 13. GapCheck does not knowingly collect personal information
from children or other users through the extension because it does not
transmit user content to the developer.

## Changes to this policy

This policy may be updated when GapCheck's functionality or data practices
change. The effective date above will be updated when the policy changes.
Material changes will be disclosed through the extension or its Chrome Web
Store listing as appropriate.

## Contact

For privacy questions about GapCheck, contact:

Rob Sassack
<rsassack25@gmail.com>
