// @ts-check

const resumeStatusValue = /** @type {HTMLSpanElement} */ (document.getElementById("resumeStatusValue"));
const resumeStatusDot = /** @type {HTMLSpanElement} */ (document.querySelector("#resumeStatus .status-dot"));
const openOptionsBtn = /** @type {HTMLButtonElement} */ (document.getElementById("openOptionsBtn"));

const nanoStatusValue = /** @type {HTMLSpanElement} */ (document.getElementById("nanoStatusValue"));
const nanoStatusDot = /** @type {HTMLSpanElement} */ (document.querySelector("#nanoStatus .status-dot"));
const nanoStatusHint = /** @type {HTMLParagraphElement} */ (document.getElementById("nanoStatusHint"));
const retryNanoBtn = /** @type {HTMLButtonElement} */ (document.getElementById("retryNanoBtn"));

const analyzeBtn = /** @type {HTMLButtonElement} */ (document.getElementById("analyzeBtn"));
const cancelAnalysisBtn = /** @type {HTMLButtonElement} */ (document.getElementById("cancelAnalysisBtn"));
const captureHint = /** @type {HTMLParagraphElement} */ (document.getElementById("captureHint"));
const analysisStatus = /** @type {HTMLParagraphElement} */ (document.getElementById("analysisStatus"));
const analysisProgress = /** @type {HTMLDivElement} */ (document.getElementById("analysisProgress"));
const progressStep = /** @type {HTMLSpanElement} */ (document.getElementById("progressStep"));
const progressTitle = /** @type {HTMLSpanElement} */ (document.getElementById("progressTitle"));
const resultsBlock = /** @type {HTMLElement} */ (document.getElementById("resultsBlock"));
const resultEmpty = /** @type {HTMLDivElement} */ (document.getElementById("resultEmpty"));
const emptyStateTitle = /** @type {HTMLElement} */ (document.getElementById("emptyStateTitle"));
const emptyStateMessage = /** @type {HTMLParagraphElement} */ (document.getElementById("emptyStateMessage"));
const scoreResult = /** @type {HTMLElement} */ (document.getElementById("scoreResult"));
const overallScoreValue = /** @type {HTMLSpanElement} */ (document.getElementById("overallScoreValue"));
const scoreContext = /** @type {HTMLParagraphElement} */ (document.getElementById("scoreContext"));
const summaryText = /** @type {HTMLParagraphElement} */ (document.getElementById("summaryText"));
const coverageSummary = /** @type {HTMLParagraphElement} */ (document.getElementById("coverageSummary"));
const coveredSection = /** @type {HTMLElement} */ (document.getElementById("coveredSection"));
const partialSection = /** @type {HTMLElement} */ (document.getElementById("partialSection"));
const gapSection = /** @type {HTMLElement} */ (document.getElementById("gapSection"));
const unknownSection = /** @type {HTMLElement} */ (document.getElementById("unknownSection"));
const coveredCount = /** @type {HTMLSpanElement} */ (document.getElementById("coveredCount"));
const partialCount = /** @type {HTMLSpanElement} */ (document.getElementById("partialCount"));
const gapCount = /** @type {HTMLSpanElement} */ (document.getElementById("gapCount"));
const unknownCount = /** @type {HTMLSpanElement} */ (document.getElementById("unknownCount"));
const coveredList = /** @type {HTMLDivElement} */ (document.getElementById("coveredList"));
const partialList = /** @type {HTMLDivElement} */ (document.getElementById("partialList"));
const gapList = /** @type {HTMLDivElement} */ (document.getElementById("gapList"));
const unknownList = /** @type {HTMLDivElement} */ (document.getElementById("unknownList"));
const capturedDetails = /** @type {HTMLDetailsElement} */ (document.getElementById("capturedDetails"));
const capturedMeta = /** @type {HTMLSpanElement} */ (document.getElementById("capturedMeta"));
const capturedPreview = /** @type {HTMLPreElement} */ (document.getElementById("capturedPreview"));
const gapcheckWindow = /** @type {GapcheckWindow} */ (window);

let capturedJobText = "";
let savedResumeBulletCount = 0;
let nanoAvailability = "unknown";
let isAnalyzing = false;
/** @type {AbortController | null} */
let activeAnalysisController = null;
let scoreAnimationFrame = 0;
let hasRenderedAnalysis = false;
let nanoRetryTimer = 0;

const NANO_AVAILABILITY_RETRY_MS = 15000;
const PAGE_ACCESS_ERROR_MESSAGE =
  "GapCheck couldn't access this page. Try a normal webpage and make sure GapCheck's site access is allowed in Chrome. Internal and extension pages can't be analyzed.";

/**
 * @param {string} label
 * @param {unknown} data
 */
function panelDebugLog(label, data) {
  if (!gapcheckWindow.GapcheckNano || !gapcheckWindow.GapcheckNano.isDebugEnabled()) {
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
 * @param {number} count
 * @param {string} singular
 * @param {string} plural
 */
function formatMatchCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
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

  /** @param {number} now */
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
  unknownList.replaceChildren();
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
  unknownSection.hidden = true;
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
 * @param {"covered" | "partial" | "gap" | "unknown"} status
 */
function renderMatchList(list, matches, status) {
  list.replaceChildren();

  if (matches.length === 0) {
    const emptyCopy =
      status === "covered"
        ? "No requirements were marked fully covered."
        : status === "partial"
          ? "No partial matches were found."
          : status === "gap"
            ? "No gaps were flagged."
            : "No unscored work or application constraints were found.";
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

    if (status === "partial" || status === "gap") {
      const severity = document.createElement("span");
      severity.className = `severity-pill severity-${match.severity || "unknown"}`;
      severity.textContent = formatSeverity(match.severity) || "Severity not set";
      item.append(severity);
    }

    if (
      status !== "gap" &&
      status !== "unknown" &&
      match.matchedBullets.length > 0
    ) {
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
 * @param {{ overallScore: number, matches: { requirement: string, status: "covered" | "partial" | "gap" | "unknown", matchedBullets: string[], severity: string | null }[], summary: string }} result
 */
function renderAnalysisResult(result) {
  const coveredMatches = result.matches.filter((match) => match.status === "covered");
  const partialMatches = result.matches.filter((match) => match.status === "partial");
  const gapMatches = result.matches.filter((match) => match.status === "gap");
  const unknownMatches = result.matches.filter((match) => match.status === "unknown");

  hideEmptyState();
  resultsBlock.hidden = false;
  scoreResult.hidden = false;
  coveredSection.hidden = false;
  partialSection.hidden = false;
  gapSection.hidden = false;
  unknownSection.hidden = unknownMatches.length === 0;

  scoreResult.dataset.scoreLevel = getScoreLevel(result.overallScore);
  scoreContext.textContent = getScoreContext(result.overallScore);
  summaryText.textContent = result.summary;
  coverageSummary.textContent = [
    formatMatchCount(coveredMatches.length, "covered", "covered"),
    formatMatchCount(partialMatches.length, "partial", "partial"),
    formatMatchCount(gapMatches.length, "gap", "gaps"),
  ].join(" · ");
  animateScore(result.overallScore);

  coveredCount.textContent = String(coveredMatches.length);
  partialCount.textContent = String(partialMatches.length);
  gapCount.textContent = String(gapMatches.length);
  unknownCount.textContent = String(unknownMatches.length);

  renderMatchList(coveredList, coveredMatches, "covered");
  renderMatchList(partialList, partialMatches, "partial");
  renderMatchList(gapList, gapMatches, "gap");
  renderMatchList(unknownList, unknownMatches, "unknown");
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
  cancelAnalysisBtn.hidden = !isAnalyzing;
  cancelAnalysisBtn.disabled = !isAnalyzing || activeAnalysisController?.signal.aborted === true;

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

  let injectionResults;

  try {
    injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() || "",
    });
  } catch (error) {
    panelDebugLog("Selection capture unavailable", error);
    const pageAccessError = new Error(PAGE_ACCESS_ERROR_MESSAGE);
    pageAccessError.name = "GapcheckPageAccessError";
    throw pageAccessError;
  }
  const result = injectionResults[0]?.result;

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
 * Keep multi-section processing and any total-input exclusion visible after
 * the progress indicator closes.
 *
 * @param {Pass1Progress} progress
 */
function updateCapturedPass1Meta(progress) {
  const capturedCount = progress.originalCharCount.toLocaleString();
  const analyzedCount = progress.analyzedCharCount.toLocaleString();

  if (progress.excludedCharCount > 0) {
    const excludedCount = progress.excludedCharCount.toLocaleString();
    capturedMeta.textContent =
      `${capturedCount} characters captured · ${analyzedCount} analyzed · ${excludedCount} excluded`;
    return;
  }

  capturedMeta.textContent = progress.chunkCount > 1
    ? `${capturedCount} characters analyzed in ${progress.chunkCount} sections`
    : `${capturedCount} characters captured`;
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
  const { resumeBullets } = /** @type {{ resumeBullets?: unknown }} */ (
    await chrome.storage.local.get("resumeBullets")
  );
  if (Array.isArray(resumeBullets) && resumeBullets.length > 0) {
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

retryNanoBtn.addEventListener("click", retryNanoModel);

// --- Gemini Nano availability ---------------------------------------------
// LanguageModel is the current global for Chrome's built-in Prompt API.
// It won't exist at all on Chrome builds/flags that don't have it enabled.

function clearNanoAvailabilityRetry() {
  if (nanoRetryTimer !== 0) {
    window.clearTimeout(nanoRetryTimer);
    nanoRetryTimer = 0;
  }
}

function scheduleNanoAvailabilityRetry() {
  clearNanoAvailabilityRetry();
  nanoRetryTimer = window.setTimeout(() => {
    nanoRetryTimer = 0;
    checkNanoAvailability();
  }, NANO_AVAILABILITY_RETRY_MS);
}

/**
 * @param {string} message
 */
function showNanoRuntimeFailure(message) {
  nanoAvailability = "runtime-error";
  nanoStatusDot.dataset.state = "error";
  nanoStatusValue.textContent = "Session unavailable";
  nanoStatusHint.textContent =
    "Chrome could not start the local model. Check again, or relaunch Chrome if it does not recover.";
  retryNanoBtn.hidden = false;
  setAnalysisStatus(message, "error");
}

/**
 * @param {number} progressPercent
 */
function showNanoDownloadProgress(progressPercent) {
  const roundedProgress = Math.max(
    0,
    Math.min(100, Math.round(progressPercent))
  );

  nanoAvailability = "downloading";
  nanoStatusDot.dataset.state = "warn";
  nanoStatusValue.textContent = roundedProgress >= 100
    ? "Finalizing…"
    : `Downloading… ${roundedProgress}%`;
  nanoStatusHint.textContent = roundedProgress >= 100
    ? "Download complete. Chrome is preparing the model session."
    : "Keep Chrome open while the on-device model downloads.";
  retryNanoBtn.hidden = true;
}

async function checkNanoAvailability() {
  clearNanoAvailabilityRetry();
  const languageModel = getLanguageModelGlobal();

  if (!languageModel) {
    nanoAvailability = "not-found";
    nanoStatusDot.dataset.state = "error";
    nanoStatusValue.textContent = "Not found";
    nanoStatusHint.textContent =
      "Enable chrome://flags/#optimization-guide-on-device-model and chrome://flags/#prompt-api-for-gemini-nano, then relaunch Chrome.";
    retryNanoBtn.hidden = false;
    updateAnalyzeButtonState(true);
    return;
  }

  try {
    const availability = await languageModel.availability();
    nanoAvailability = availability;

    switch (availability) {
      case "available":
        nanoStatusDot.dataset.state = "ok";
        nanoStatusValue.textContent = "Ready";
        nanoStatusHint.textContent = "";
        retryNanoBtn.hidden = true;
        break;
      case "downloadable":
        nanoStatusDot.dataset.state = "warn";
        nanoStatusValue.textContent = "Not downloaded";
        nanoStatusHint.textContent =
          "Select job text, then choose Download model & analyze.";
        retryNanoBtn.hidden = true;
        break;
      case "downloading":
        nanoStatusDot.dataset.state = "warn";
        nanoStatusValue.textContent = "Downloading…";
        nanoStatusHint.textContent =
          "GapCheck is monitoring the download and will mark the model Ready when it finishes.";
        retryNanoBtn.hidden = true;
        if (!isAnalyzing) {
          scheduleNanoAvailabilityRetry();
        }
        break;
      default:
        nanoStatusDot.dataset.state = "error";
        nanoStatusValue.textContent = "Unavailable";
        nanoStatusHint.textContent =
          "Chrome paused the local model. GapCheck will check again automatically; relaunch Chrome if it does not recover.";
        retryNanoBtn.hidden = false;
        scheduleNanoAvailabilityRetry();
    }
  } catch (err) {
    console.error(err);
    nanoAvailability = "error";
    nanoStatusDot.dataset.state = "error";
    nanoStatusValue.textContent = "Error";
    nanoStatusHint.textContent =
      "GapCheck could not check the local model. Try again, or relaunch Chrome if the error continues.";
    retryNanoBtn.hidden = false;
    scheduleNanoAvailabilityRetry();
  } finally {
    updateAnalyzeButtonState();
  }
}

async function retryNanoModel() {
  clearNanoAvailabilityRetry();
  retryNanoBtn.disabled = true;
  retryNanoBtn.textContent = "Checking…";
  nanoStatusDot.dataset.state = "unknown";
  nanoStatusValue.textContent = "Checking…";
  nanoStatusHint.textContent = "";

  try {
    await checkNanoAvailability();

    if (
      nanoAvailability !== "available" &&
      nanoAvailability !== "downloadable" &&
      nanoAvailability !== "downloading"
    ) {
      return;
    }

    const gapcheckNano = gapcheckWindow.GapcheckNano;

    if (!gapcheckNano) {
      throw new Error("GapCheck analysis helpers are not available.");
    }

    await gapcheckNano.ensureLanguageModelReady(showNanoDownloadProgress);
    await checkNanoAvailability();
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Model check failed.";

    if (err instanceof Error && err.name === "GapcheckModelRuntimeError") {
      showNanoRuntimeFailure(message);
    } else {
      nanoAvailability = "error";
      nanoStatusDot.dataset.state = "error";
      nanoStatusValue.textContent = "Error";
      nanoStatusHint.textContent =
        "GapCheck could not check the local model. Try again, or relaunch Chrome if the error continues.";
      retryNanoBtn.hidden = false;
      setAnalysisStatus(message, "error");
    }
  } finally {
    retryNanoBtn.disabled = false;
    retryNanoBtn.textContent = "Check model again";
    updateAnalyzeButtonState(true);
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
  const analysisController = new AbortController();
  activeAnalysisController = analysisController;
  const { signal } = analysisController;
  const previousResultCapture = hasRenderedAnalysis
    ? {
        text: capturedJobText,
        meta: capturedMeta.textContent,
        preview: capturedPreview.textContent,
        detailsOpen: capturedDetails.open,
      }
    : null;
  captureHint.hidden = true;
  updateAnalyzeButtonState();

  let hasFreshCapture = false;
  let excludedPass1CharCount = 0;

  try {
    showAnalysisProgress("Analyzing selected text", "Reading selection from the active tab...");
    setAnalysisStatus("Reading selected job text...", "info");
    const selectedText = await captureSelectedTextFromActiveTab();
    signal.throwIfAborted();

    if (!selectedText) {
      clearCapturedPreview("No text was selected on the page.");
      showEmptyState(
        "No job text selected",
        "Highlight the job description on the page, then run the analysis again.",
      );
      throw new Error("Highlight the job description on the page first.");
    }

    updateCapturedPreview(selectedText);
    if (!hasRenderedAnalysis) {
      showEmptyState(
        "Analysis running",
        "Results will appear here when the on-device model finishes.",
      );
    }
    hasFreshCapture = true;
    panelDebugLog("Captured selected text", {
      charCount: selectedText.length,
      text: selectedText,
    });

    setAnalysisStatus("Checking on-device model...", "info");
    showAnalysisProgress("Analyzing selected text", "Checking on-device model...");
    await checkNanoAvailability();
    signal.throwIfAborted();

    if (
      nanoAvailability !== "available" &&
      nanoAvailability !== "downloadable" &&
      nanoAvailability !== "downloading"
    ) {
      throw new Error("The on-device model is not available yet.");
    }

    const gapcheckNano = gapcheckWindow.GapcheckNano;
    if (!gapcheckNano) {
      throw new Error("GapCheck analysis helpers are not available.");
    }

    if (nanoAvailability === "downloadable" || nanoAvailability === "downloading") {
      setAnalysisStatus("", "info");
      showAnalysisProgress("Preparing on-device model", "Downloading model...");
    }

    await gapcheckNano.ensureLanguageModelReady((progressPercent) => {
      if (signal.aborted) {
        return;
      }
      const roundedProgress = Math.round(progressPercent);
      showNanoDownloadProgress(progressPercent);
      showAnalysisProgress("Preparing on-device model", `Downloading model: ${roundedProgress}%`);
    }, { signal });
    signal.throwIfAborted();
    await checkNanoAvailability();
    signal.throwIfAborted();

    if (nanoAvailability !== "available") {
      throw new Error("The on-device model is not available yet.");
    }

    setAnalysisStatus("Extracting requirements...", "info");
    showAnalysisProgress("Analyzing selected text", "Pass 1 of 2: extracting requirements...");
    const requirements = await gapcheckNano.extractRequirementsFromJobText(
      capturedJobText,
      {
        signal,
        onProgress(progress) {
          if (signal.aborted) {
            return;
          }
          excludedPass1CharCount = progress.excludedCharCount;
          updateCapturedPass1Meta(progress);
          const stage = progress.stage === "extracting"
            ? "extracting requirements"
            : "checking extraction completeness";
          const section = progress.chunkCount > 1
            ? `, section ${progress.chunkNumber} of ${progress.chunkCount}`
            : "";
          const retry = progress.retrying ? "retrying " : "";

          showAnalysisProgress(
            "Analyzing selected text",
            `Pass 1 of 2: ${retry}${stage}${section}...`
          );
        },
      }
    );

    if (requirements.length === 0) {
      throw new Error("No concrete requirements were found in the captured text.");
    }

    setAnalysisStatus("Comparing requirements to resume...", "info");
    showAnalysisProgress("Analyzing selected text", "Pass 2 of 2: comparing against your resume...");
    const analysis = await gapcheckNano.analyzeRequirementsWithSavedResume(
      requirements,
      { signal }
    );
    const overallScore = gapcheckNano.computeOverallScore(analysis.matches);

    const result = {
      overallScore,
      requirements,
      matches: analysis.matches,
      summary: analysis.summary,
    };

    panelDebugLog("Analysis result", result);
    renderAnalysisResult(result);
    if (excludedPass1CharCount > 0) {
      setAnalysisStatus(
        `Analysis complete: ${overallScore}% match. ${excludedPass1CharCount.toLocaleString()} characters exceeded the ${gapcheckNano.pass1TotalJobTextCharLimit.toLocaleString()}-character safety limit and were not analyzed.`,
        "warn"
      );
    } else {
      setAnalysisStatus(`Analysis complete: ${overallScore}% match.`, "ok");
    }
    hideAnalysisProgress();
  } catch (err) {
    const wasCancelled = signal.aborted;
    if (wasCancelled) {
      if (previousResultCapture) {
        capturedJobText = previousResultCapture.text;
        capturedMeta.textContent = previousResultCapture.meta;
        capturedPreview.textContent = previousResultCapture.preview;
        capturedDetails.open = previousResultCapture.detailsOpen;
      }
      setAnalysisStatus("Analysis cancelled. Ready to analyze again.", "warn");
      hideAnalysisProgress();
      if (!hasRenderedAnalysis) {
        showEmptyState(
          "Analysis cancelled",
          "No new result was saved. Select job text and analyze again when you’re ready.",
        );
      }
      return;
    }

    console.error(err);
    const message = err instanceof Error ? err.message : "Analysis failed.";
    const isModelRuntimeFailure =
      err instanceof Error && err.name === "GapcheckModelRuntimeError";
    const isPageAccessFailure =
      err instanceof Error && err.name === "GapcheckPageAccessError";

    if (isModelRuntimeFailure) {
      showNanoRuntimeFailure(message);
    }

    if (hasFreshCapture) {
      showEmptyState(
        isModelRuntimeFailure ? "On-device model could not start" : "Analysis failed",
        message,
      );
    } else if (isPageAccessFailure) {
      clearCapturedPreview(message);
      showEmptyState("Page unavailable", message);
    } else if (message !== "Highlight the job description on the page first.") {
      const selectionUnavailableMessage =
        "Couldn't read the page selection. Try a normal webpage; Chrome blocks capture on internal and extension pages.";
      clearCapturedPreview(selectionUnavailableMessage);
      showEmptyState(
        "Selection unavailable",
        selectionUnavailableMessage,
      );
    }
    setAnalysisStatus(message, "error");
    hideAnalysisProgress();
  } finally {
    if (activeAnalysisController === analysisController) {
      activeAnalysisController = null;
    }
    isAnalyzing = false;
    captureHint.hidden = false;
    updateAnalyzeButtonState(true);
  }
});

cancelAnalysisBtn.addEventListener("click", () => {
  if (!activeAnalysisController || activeAnalysisController.signal.aborted) {
    return;
  }

  cancelAnalysisBtn.disabled = true;
  setAnalysisStatus("Cancelling analysis...", "warn");
  activeAnalysisController.abort(
    new DOMException("The analysis was cancelled.", "AbortError")
  );
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
