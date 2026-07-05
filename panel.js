const resumeStatusValue = document.getElementById("resumeStatusValue");
const resumeStatusDot = document.querySelector("#resumeStatus .status-dot");
const openOptionsBtn = document.getElementById("openOptionsBtn");

const nanoStatusValue = document.getElementById("nanoStatusValue");
const nanoStatusDot = document.querySelector("#nanoStatus .status-dot");
const nanoStatusHint = document.getElementById("nanoStatusHint");

const captureBtn = document.getElementById("captureBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const analysisStatus = document.getElementById("analysisStatus");
const analysisOutput = document.getElementById("analysisOutput");
const resultsBlock = document.getElementById("resultsBlock");
const capturedDetails = document.getElementById("capturedDetails");
const capturedMeta = document.getElementById("capturedMeta");
const capturedPreview = document.getElementById("capturedPreview");

let capturedJobText = "";
let savedResumeBulletCount = 0;
let nanoAvailability = "unknown";
let isAnalyzing = false;

/**
 * @param {string} label
 * @param {unknown} data
 */
function panelDebugLog(label, data) {
  if (!window.GapcheckNano || !window.GapcheckNano.isDebugEnabled()) {
    return;
  }

  console.log(`[GapCheck debug] ${label}`, data);
}

/**
 * @param {string} message
 * @param {"info" | "ok" | "warn" | "error"} state
 */
function setAnalysisStatus(message, state = "info") {
  analysisStatus.textContent = message;
  analysisStatus.dataset.state = state;
}

/**
 * @param {boolean} [preserveStatus]
 */
function updateAnalyzeButtonState(preserveStatus = false) {
  const hasJobText = capturedJobText.length > 0;
  const hasResume = savedResumeBulletCount > 0;
  const modelCanRun =
    nanoAvailability === "available" ||
    nanoAvailability === "downloadable" ||
    nanoAvailability === "downloading";

  analyzeBtn.disabled = isAnalyzing || !hasJobText || !hasResume || !modelCanRun;

  if (isAnalyzing) {
    analyzeBtn.textContent = "Analyzing...";
  } else if (nanoAvailability === "downloadable" || nanoAvailability === "downloading") {
    analyzeBtn.textContent = "Download model & analyze";
  } else {
    analyzeBtn.textContent = "Analyze selected text";
  }

  if (isAnalyzing || preserveStatus) {
    return;
  }

  if (!hasJobText) {
    setAnalysisStatus("Capture job text before analyzing.", "warn");
  } else if (!hasResume) {
    setAnalysisStatus("Add resume bullets before analyzing.", "warn");
  } else if (!modelCanRun) {
    setAnalysisStatus("The on-device model is not ready on this browser.", "error");
  } else if (nanoAvailability === "downloadable") {
    setAnalysisStatus("The on-device model will download when you analyze.", "warn");
  } else if (nanoAvailability === "downloading") {
    setAnalysisStatus("The on-device model is still downloading.", "warn");
  } else {
    setAnalysisStatus("Ready to analyze.", "ok");
  }
}

// --- Resume status -------------------------------------------------------

async function checkResumeStatus() {
  const { resumeBullets } = await chrome.storage.local.get("resumeBullets");
  if (resumeBullets && resumeBullets.length > 0) {
    savedResumeBulletCount = resumeBullets.length;
    resumeStatusDot.dataset.state = "ok";
    resumeStatusValue.textContent = `${resumeBullets.length} bullets saved`;
  } else {
    savedResumeBulletCount = 0;
    resumeStatusDot.dataset.state = "warn";
    resumeStatusValue.textContent = "Not set up";
  }

  updateAnalyzeButtonState();
}

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// --- Gemini Nano availability ---------------------------------------------
// LanguageModel is the current global for Chrome's built-in Prompt API.
// It won't exist at all on Chrome builds/flags that don't have it enabled.

async function checkNanoAvailability() {
  if (typeof LanguageModel === "undefined") {
    nanoAvailability = "not-found";
    nanoStatusDot.dataset.state = "error";
    nanoStatusValue.textContent = "Not found";
    nanoStatusHint.textContent =
      "Enable chrome://flags/#optimization-guide-on-device-model and chrome://flags/#prompt-api-for-gemini-nano, then relaunch Chrome.";
    updateAnalyzeButtonState(true);
    return;
  }

  try {
    const availability = await LanguageModel.availability();
    nanoAvailability = availability;

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
    nanoAvailability = "error";
    nanoStatusDot.dataset.state = "error";
    nanoStatusValue.textContent = "Error";
    nanoStatusHint.textContent = "See the side panel console for details.";
  } finally {
    updateAnalyzeButtonState();
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
      capturedJobText = "";
      capturedMeta.textContent = "No text was selected on the page.";
      capturedPreview.textContent = "";
      capturedDetails.open = false;
      resultsBlock.hidden = false;
      updateAnalyzeButtonState();
      return;
    }

    capturedJobText = text;
    capturedMeta.textContent = `${text.length} characters captured`;
    capturedPreview.textContent = text;
    capturedDetails.open = false;
    resultsBlock.hidden = false;
    updateAnalyzeButtonState();
    panelDebugLog("Captured selected text", {
      charCount: text.length,
      text,
    });
  } catch (err) {
    console.error(err);
    capturedJobText = "";
    capturedMeta.textContent =
      "Couldn't read the page selection. Try a normal webpage; Chrome blocks capture on internal and extension pages.";
    capturedPreview.textContent = "";
    capturedDetails.open = false;
    resultsBlock.hidden = false;
    updateAnalyzeButtonState();
  } finally {
    captureBtn.disabled = false;
    captureBtn.textContent = "Capture selected text";
  }
});

// --- Analyze captured text -------------------------------------------------

analyzeBtn.addEventListener("click", async () => {
  if (isAnalyzing) {
    return;
  }

  analysisOutput.hidden = true;
  analysisOutput.textContent = "";

  if (!capturedJobText) {
    setAnalysisStatus("Capture job text before analyzing.", "error");
    updateAnalyzeButtonState(true);
    return;
  }

  if (savedResumeBulletCount === 0) {
    setAnalysisStatus("Add resume bullets before analyzing.", "error");
    updateAnalyzeButtonState(true);
    return;
  }

  isAnalyzing = true;
  updateAnalyzeButtonState();

  try {
    setAnalysisStatus("Checking on-device model...", "info");
    await checkNanoAvailability();

    if (nanoAvailability === "downloadable" || nanoAvailability === "downloading") {
      setAnalysisStatus("Downloading on-device model...", "info");
      await window.GapcheckNano.ensureLanguageModelReady((progressPercent) => {
        setAnalysisStatus(`Downloading on-device model: ${Math.round(progressPercent)}%`, "info");
      });
      await checkNanoAvailability();
    }

    if (nanoAvailability !== "available") {
      throw new Error("The on-device model is not available yet.");
    }

    setAnalysisStatus("Extracting requirements...", "info");
    const requirements = await window.GapcheckNano.extractRequirementsFromJobText(capturedJobText);

    if (requirements.length === 0) {
      throw new Error("No concrete requirements were found in the captured text.");
    }

    setAnalysisStatus("Comparing requirements to resume...", "info");
    const analysis = await window.GapcheckNano.analyzeRequirementsWithSavedResume(requirements);
    const overallScore = window.GapcheckNano.computeOverallScore(analysis.matches);

    const result = {
      overallScore,
      requirements,
      matches: analysis.matches,
      summary: analysis.summary,
    };

    analysisOutput.textContent = JSON.stringify(result, null, 2);
    analysisOutput.hidden = false;
    setAnalysisStatus(`Analysis complete: ${overallScore}% match.`, "ok");
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Analysis failed.";
    setAnalysisStatus(message, "error");
  } finally {
    isAnalyzing = false;
    updateAnalyzeButtonState(true);
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
