# Permissions Audit

This document records the permissions required by GapCheck 1.0.0 and the
reason each permission is part of the production manifest. It is also the
basis for the permission explanations used in the Chrome Web Store listing.

## Single purpose

GapCheck compares job requirements with a locally saved resume. When the user
clicks **Analyze selected text**, the extension reads the text that the user
has selected in the active page and analyzes it on-device. It does not
automatically capture page content or monitor browsing activity.

## Required permissions

### `sidePanel`

GapCheck presents its analysis controls and results in Chrome's side panel.
The background service worker configures the extension's toolbar action to
open that panel.

### `storage`

GapCheck saves the user's normalized resume in `chrome.storage.local`. The
resume remains on the device and can be replaced or cleared by the user. No
sync storage is used.

### `scripting`

When the user clicks **Analyze selected text**, GapCheck calls
`chrome.scripting.executeScript()` in the active tab. The injected function
only evaluates `window.getSelection().toString()` and returns the selected
text. GapCheck does not inject a persistent content script, modify the page,
or read the full page.

### Host access: `<all_urls>`

Job postings can appear on any website, so selection capture cannot be
limited to a known set of hosts. Broad host access lets the persistent side
panel capture a selection from the active job-posting tab after the user has
switched tabs or opened the panel through Chrome's side-panel interface.

Access is exercised only after the user clicks **Analyze selected text**. The
extension reads only the current selection, uses it for the requested local
analysis, and does not transmit it. Chrome-protected pages, including
`chrome://` pages and the Chrome Web Store, remain inaccessible.

## Why `activeTab` is not used

`activeTab` was considered because it provides temporary host access without
an install-time warning. It would support selection capture when the user
first invokes GapCheck through its toolbar action on that page.

It does not fully support the current persistent-side-panel workflow. Its
grant is tied to an explicit extension invocation and a particular tab and
origin; it is not available on another tab merely because the GapCheck side
panel is already open. Using it would require the user to invoke the toolbar
action again for each new tab or origin before clicking **Analyze selected
text**. It may also fail when the panel is opened through Chrome's side-panel
interface rather than the extension action.

The production manifest therefore retains `<all_urls>` for the existing
user-facing workflow, not for future functionality. If GapCheck changes its
workflow to require a fresh toolbar invocation on every analyzed page, this
decision should be revisited and `<all_urls>` should be replaced with
`activeTab`.

## Chrome Web Store disclosure text

> GapCheck requests access to webpages so it can read only the text you have
> explicitly selected when you click **Analyze selected text**. This access
> allows its persistent side panel to work on job postings across websites and
> after you switch tabs. GapCheck does not automatically read pages, monitor
> browsing activity, or transmit selected text; analysis runs on your device.

## Policy basis

This audit applies the Chrome Web Store requirement to request the narrowest
permissions necessary for the extension's current functionality. Relevant
official references:

- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [The `activeTab` permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [The Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

