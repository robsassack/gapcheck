const resumeStatusValue = document.getElementById("resumeStatusValue");
const resumeStatusDot = document.querySelector("#resumeStatus .status-dot");
const openOptionsBtn = document.getElementById("openOptionsBtn");

const nanoStatusValue = document.getElementById("nanoStatusValue");
const nanoStatusDot = document.querySelector("#nanoStatus .status-dot");
const nanoStatusHint = document.getElementById("nanoStatusHint");

const analyzeBtn = document.getElementById("analyzeBtn");
const analysisStatus = document.getElementById("analysisStatus");
const analysisProgress = document.getElementById("analysisProgress");
const progressStep = document.getElementById("progressStep");
const progressTitle = document.getElementById("progressTitle");
const resultsBlock = document.getElementById("resultsBlock");
const resultEmpty = document.getElementById("resultEmpty");
const emptyStateTitle = document.getElementById("emptyStateTitle");
const emptyStateMessage = document.getElementById("emptyStateMessage");
const scoreResult = document.getElementById("scoreResult");
const overallScoreValue = document.getElementById("overallScoreValue");
const scoreContext = document.getElementById("scoreContext");
const summaryText = document.getElementById("summaryText");
const coveredSection = document.getElementById("coveredSection");
const partialSection = document.getElementById("partialSection");
const gapSection = document.getElementById("gapSection");
const coveredCount = document.getElementById("coveredCount");
const partialCount = document.getElementById("partialCount");
const gapCount = document.getElementById("gapCount");
const coveredList = document.getElementById("coveredList");
const partialList = document.getElementById("partialList");
const gapList = document.getElementById("gapList");
const capturedDetails = document.getElementById("capturedDetails");
const capturedMeta = document.getElementById("capturedMeta");
const capturedPreview = document.getElementById("capturedPreview");

let capturedJobText = "";
let savedResumeBulletCount = 0;
let nanoAvailability = "unknown";
let isAnalyzing = false;
let scoreAnimationFrame = 0;
let hasRenderedAnalysis = false;

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
 * @param {string} title
 * @param {string} step
 */
function showAnalysisProgress(title, step) {
  progressTitle.textContent = title;
  progressStep.textContent = step;
  analysisProgress.hidden = false;
}

function hideAnalysisProgress() {
  analysisProgress.hidden = true;
}

/**
 * @param {number} score
 */
function getScoreLevel(score) {
  if (score >= 75) {
    return "high";
  }

  if (score >= 50) {
    return "mid";
  }

  return "low";
}

/**
 * @param {number} score
 */
function getScoreContext(score) {
  if (score >= 75) {
    return "Strong match";
  }

  if (score >= 50) {
    return "Moderate match";
  }

  return "Needs work";
}

/**
 * @param {number} targetScore
 */
function animateScore(targetScore) {
  if (scoreAnimationFrame) {
    cancelAnimationFrame(scoreAnimationFrame);
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    overallScoreValue.textContent = String(targetScore);
    return;
  }

  const durationMs = 750;
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    const easedProgress = 1 - (1 - progress) ** 3;
    overallScoreValue.textContent = String(Math.round(targetScore * easedProgress));

    if (progress < 1) {
      scoreAnimationFrame = requestAnimationFrame(tick);
    } else {
      scoreAnimationFrame = 0;
    }
  }

  overallScoreValue.textContent = "0";
  scoreAnimationFrame = requestAnimationFrame(tick);
}

function clearMatchLists() {
  coveredList.replaceChildren();
  partialList.replaceChildren();
  gapList.replaceChildren();
}

/**
 * @param {string} title
 * @param {string} message
 */
function showEmptyState(title, message) {
  if (scoreAnimationFrame) {
    cancelAnimationFrame(scoreAnimationFrame);
    scoreAnimationFrame = 0;
  }

  resultsBlock.hidden = false;
  resultEmpty.hidden = false;
  emptyStateTitle.textContent = title;
  emptyStateMessage.textContent = message;
  scoreResult.hidden = true;
  coveredSection.hidden = true;
  partialSection.hidden = true;
  gapSection.hidden = true;
  clearMatchLists();
  hasRenderedAnalysis = false;
}

function hideEmptyState() {
  resultEmpty.hidden = true;
}

/**
 * @param {HTMLElement} list
 * @param {string} message
 */
function renderEmptyMatchList(list, message) {
  const emptyMessage = document.createElement("p");
  emptyMessage.className = "match-empty";
  emptyMessage.textContent = message;
  list.append(emptyMessage);
}

/**
 * @param {string | null} severity
 */
function formatSeverity(severity) {
  if (!severity) {
    return "";
  }

  return `${severity[0].toUpperCase()}${severity.slice(1)} severity`;
}

/**
 * @param {HTMLElement} list
 * @param {{ requirement: string, matchedBullets: string[], severity: string | null }[]} matches
 * @param {"covered" | "partial" | "gap"} status
 */
function renderMatchList(list, matches, status) {
  list.replaceChildren();

  if (matches.length === 0) {
    const emptyCopy =
      status === "covered"
        ? "No requirements were marked fully covered."
        : status === "partial"
          ? "No partial matches were found."
          : "No gaps were flagged.";
    renderEmptyMatchList(list, emptyCopy);
    return;
  }

  for (const match of matches) {
    const item = document.createElement("article");
    item.className = "match-item";

    const requirement = document.createElement("p");
    requirement.className = "match-requirement";
    requirement.textContent = match.requirement;
    item.append(requirement);

    if (status !== "covered") {
      const severity = document.createElement("span");
      severity.className = `severity-pill severity-${match.severity || "unknown"}`;
      severity.textContent = formatSeverity(match.severity) || "Severity not set";
      item.append(severity);
    }

    if (status !== "gap" && match.matchedBullets.length > 0) {
      const bullets = document.createElement("ul");
      bullets.className = "matched-bullets";

      for (const bulletText of match.matchedBullets) {
        const bullet = document.createElement("li");
        bullet.textContent = bulletText;
        bullets.append(bullet);
      }

      item.append(bullets);
    }

    list.append(item);
  }
}

/**
 * @param {{ overallScore: number, matches: { requirement: string, status: "covered" | "partial" | "gap", matchedBullets: string[], severity: string | null }[], summary: string }} result
 */
function renderAnalysisResult(result) {
  const coveredMatches = result.matches.filter((match) => match.status === "covered");
  const partialMatches = result.matches.filter((match) => match.status === "partial");
  const gapMatches = result.matches.filter((match) => match.status === "gap");

  hideEmptyState();
  resultsBlock.hidden = false;
  scoreResult.hidden = false;
  coveredSection.hidden = false;
  partialSection.hidden = false;
  gapSection.hidden = false;

  scoreResult.dataset.scoreLevel = getScoreLevel(result.overallScore);
  scoreContext.textContent = getScoreContext(result.overallScore);
  summaryText.textContent = result.summary;
  animateScore(result.overallScore);

  coveredCount.textContent = String(coveredMatches.length);
  partialCount.textContent = String(partialMatches.length);
  gapCount.textContent = String(gapMatches.length);

  renderMatchList(coveredList, coveredMatches, "covered");
  renderMatchList(partialList, partialMatches, "partial");
  renderMatchList(gapList, gapMatches, "gap");
  hasRenderedAnalysis = true;
}

/**
 * @param {boolean} [preserveStatus]
 */
function updateAnalyzeButtonState(preserveStatus = false) {
  const hasResume = savedResumeBulletCount > 0;
  const modelCanRun =
    nanoAvailability === "available" ||
    nanoAvailability === "downloadable" ||
    nanoAvailability === "downloading";

  analyzeBtn.disabled = isAnalyzing || !hasResume || !modelCanRun;

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

  if (!hasResume) {
    setAnalysisStatus("Add resume bullets before analyzing.", "warn");
    if (!hasRenderedAnalysis) {
      showEmptyState(
        "Resume needed",
        "Add resume bullets before running a match analysis.",
      );
    }
  } else if (!modelCanRun) {
    setAnalysisStatus("The on-device model is not ready on this browser.", "error");
    if (!hasRenderedAnalysis) {
      showEmptyState(
        "On-device model unavailable",
        "The match results will appear here once the model can run.",
      );
    }
  } else if (nanoAvailability === "downloadable") {
    setAnalysisStatus("The on-device model will download when you analyze.", "warn");
    if (!hasRenderedAnalysis) {
      showEmptyState(
        "Ready after model download",
        "Highlight a job description, then analyze it. The model will download first.",
      );
    }
  } else if (nanoAvailability === "downloading") {
    setAnalysisStatus("The on-device model is still downloading.", "warn");
    if (!hasRenderedAnalysis) {
      showEmptyState(
        "Model downloading",
        "Highlight a job description now; results will appear after the model is ready.",
      );
    }
  } else {
    setAnalysisStatus("Ready to analyze.", "ok");
    if (!hasRenderedAnalysis) {
      showEmptyState(
        "Ready for a job description",
        "Highlight the job description on the page, then run the analysis.",
      );
    }
  }
}

async function captureSelectedTextFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) {
    throw new Error("No active tab found.");
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString(),
  });

  return (result || "").trim();
}

/**
 * @param {string} text
 */
function updateCapturedPreview(text) {
  capturedJobText = text;
  capturedMeta.textContent = `${text.length} characters captured`;
  capturedPreview.textContent = text;
  capturedDetails.open = false;
  resultsBlock.hidden = false;
}

/**
 * @param {string} message
 */
function clearCapturedPreview(message) {
  capturedJobText = "";
  capturedMeta.textContent = message;
  capturedPreview.textContent = "";
  capturedDetails.open = false;
  resultsBlock.hidden = false;
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

// --- Analyze selected text -------------------------------------------------

analyzeBtn.addEventListener("click", async () => {
  if (isAnalyzing) {
    return;
  }

  hideAnalysisProgress();

  if (savedResumeBulletCount === 0) {
    setAnalysisStatus("Add resume bullets before analyzing.", "error");
    showEmptyState(
      "Resume needed",
      "Add resume bullets before running a match analysis.",
    );
    updateAnalyzeButtonState(true);
    return;
  }

  isAnalyzing = true;
  updateAnalyzeButtonState();

  let hasFreshCapture = false;

  try {
    showAnalysisProgress("Analyzing selected text", "Reading selection from the active tab...");
    setAnalysisStatus("Reading selected job text...", "info");
    const selectedText = await captureSelectedTextFromActiveTab();

    if (!selectedText) {
      clearCapturedPreview("No text was selected on the page.");
      showEmptyState(
        "No job text selected",
        "Highlight the job description on the page, then run the analysis again.",
      );
      throw new Error("Highlight the job description on the page first.");
    }

    updateCapturedPreview(selectedText);
    showEmptyState(
      "Analysis running",
      "Results will appear here when the on-device model finishes.",
    );
    hasFreshCapture = true;
    panelDebugLog("Captured selected text", {
      charCount: selectedText.length,
      text: selectedText,
    });

    setAnalysisStatus("Checking on-device model...", "info");
    showAnalysisProgress("Analyzing selected text", "Checking on-device model...");
    await checkNanoAvailability();

    if (nanoAvailability === "downloadable" || nanoAvailability === "downloading") {
      setAnalysisStatus("Downloading on-device model...", "info");
      showAnalysisProgress("Preparing on-device model", "Downloading model...");
      await window.GapcheckNano.ensureLanguageModelReady((progressPercent) => {
        const roundedProgress = Math.round(progressPercent);
        setAnalysisStatus(`Downloading on-device model: ${roundedProgress}%`, "info");
        showAnalysisProgress("Preparing on-device model", `Downloading model: ${roundedProgress}%`);
      });
      await checkNanoAvailability();
    }

    if (nanoAvailability !== "available") {
      throw new Error("The on-device model is not available yet.");
    }

    setAnalysisStatus("Extracting requirements...", "info");
    showAnalysisProgress("Analyzing selected text", "Pass 1 of 2: extracting requirements...");
    const requirements = await window.GapcheckNano.extractRequirementsFromJobText(capturedJobText);

    if (requirements.length === 0) {
      throw new Error("No concrete requirements were found in the captured text.");
    }

    setAnalysisStatus("Comparing requirements to resume...", "info");
    showAnalysisProgress("Analyzing selected text", "Pass 2 of 2: comparing against your resume...");
    const analysis = await window.GapcheckNano.analyzeRequirementsWithSavedResume(requirements);
    const overallScore = window.GapcheckNano.computeOverallScore(analysis.matches);

    const result = {
      overallScore,
      requirements,
      matches: analysis.matches,
      summary: analysis.summary,
    };

    panelDebugLog("Analysis result", result);
    renderAnalysisResult(result);
    setAnalysisStatus(`Analysis complete: ${overallScore}% match.`, "ok");
    hideAnalysisProgress();
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Analysis failed.";
    if (hasFreshCapture) {
      showEmptyState(
        "Analysis failed",
        message,
      );
    } else if (message !== "Highlight the job description on the page first.") {
      clearCapturedPreview(
        "Couldn't read the page selection. Try a normal webpage; Chrome blocks capture on internal and extension pages.",
      );
      showEmptyState(
        "Selection unavailable",
        "Try a normal webpage; Chrome blocks capture on internal and extension pages.",
      );
    }
    setAnalysisStatus(message, "error");
    hideAnalysisProgress();
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
