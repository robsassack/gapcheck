// Makes clicking the toolbar icon open the side panel directly,
// instead of requiring a popup click first.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Failed to set side panel behavior:", error));
