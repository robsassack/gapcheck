const resumeStatusValue = document.getElementById("resumeStatusValue");
const resumeStatusDot = document.querySelector("#resumeStatus .status-dot");
const openOptionsBtn = document.getElementById("openOptionsBtn");

const nanoStatusValue = document.getElementById("nanoStatusValue");
const nanoStatusDot = document.querySelector("#nanoStatus .status-dot");
const nanoStatusHint = document.getElementById("nanoStatusHint");

const captureBtn = document.getElementById("captureBtn");
const resultsBlock = document.getElementById("resultsBlock");
const capturedMeta = document.getElementById("capturedMeta");
const capturedPreview = document.getElementById("capturedPreview");

// --- Resume status -------------------------------------------------------

async function checkResumeStatus() {
  const { resumeBullets } = await chrome.storage.local.get("resumeBullets");
  if (resumeBullets && resumeBullets.length > 0) {
    resumeStatusDot.dataset.state = "ok";
    resumeStatusValue.textContent = `${resumeBullets.length} bullets saved`;
  } else {
    resumeStatusDot.dataset.state = "warn";
    resumeStatusValue.textContent = "Not set up";
  }
}

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// --- Gemini Nano availability ---------------------------------------------
// LanguageModel is the current global for Chrome's built-in Prompt API.
// It won't exist at all on Chrome builds/flags that don't have it enabled.

async function checkNanoAvailability() {
  if (typeof LanguageModel === "undefined") {
    nanoStatusDot.dataset.state = "error";
    nanoStatusValue.textContent = "Not found";
    nanoStatusHint.textContent =
      "Enable chrome://flags/#optimization-guide-on-device-model and chrome://flags/#prompt-api-for-gemini-nano, then relaunch Chrome.";
    return;
  }

  try {
    const availability = await LanguageModel.availability();

    switch (availability) {
      case "available":
        nanoStatusDot.dataset.state = "ok";
        nanoStatusValue.textContent = "Ready";
        nanoStatusHint.textContent = "";
        break;
      case "downloadable":
        nanoStatusDot.dataset.state = "warn";
        nanoStatusValue.textContent = "Not downloaded";
        nanoStatusHint.textContent =
          "The model downloads on first use. It can take a few minutes — check chrome://on-device-internals for progress.";
        break;
      case "downloading":
        nanoStatusDot.dataset.state = "warn";
        nanoStatusValue.textContent = "Downloading…";
        nanoStatusHint.textContent = "Check back shortly, or watch chrome://on-device-internals.";
        break;
      default:
        nanoStatusDot.dataset.state = "error";
        nanoStatusValue.textContent = "Unavailable";
        nanoStatusHint.textContent =
          "This device or Chrome build doesn't support the on-device model.";
    }
  } catch (err) {
    console.error(err);
    nanoStatusDot.dataset.state = "error";
    nanoStatusValue.textContent = "Error";
    nanoStatusHint.textContent = "See the side panel console for details.";
  }
}

// --- Capture selected text from the active tab -----------------------------

captureBtn.addEventListener("click", async () => {
  captureBtn.disabled = true;
  captureBtn.textContent = "Capturing…";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      throw new Error("No active tab found.");
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString(),
    });

    const text = (result || "").trim();

    if (!text) {
      capturedMeta.textContent = "No text was selected on the page.";
      capturedPreview.textContent = "";
      resultsBlock.hidden = false;
      return;
    }

    capturedMeta.textContent = `${text.length} characters captured`;
    capturedPreview.textContent = text;
    resultsBlock.hidden = false;
  } catch (err) {
    console.error(err);
    capturedMeta.textContent =
      "Couldn't read the page selection. Try a normal webpage; Chrome blocks capture on internal and extension pages.";
    capturedPreview.textContent = "";
    resultsBlock.hidden = false;
  } finally {
    captureBtn.disabled = false;
    captureBtn.textContent = "Capture selected text";
  }
});

// --- Init -------------------------------------------------------------------

checkResumeStatus();
checkNanoAvailability();

// Keep resume status fresh if it's edited in the options page while the panel is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.resumeBullets) {
    checkResumeStatus();
  }
});
