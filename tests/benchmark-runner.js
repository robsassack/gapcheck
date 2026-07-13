// @ts-check

const BENCHMARK_FAMILIES = Object.freeze([
  {
    id: "product-ops",
    label: "Product Operations",
    cases: [
      { id: "strong", label: "Strong", file: "strong-match-resume.txt", min: 75, max: 100 },
      { id: "medium", label: "Medium", file: "medium-match-resume.txt", min: 40, max: 70 },
      { id: "mismatch", label: "Clear mismatch", file: "clear-mismatch-resume.txt", min: 0, max: 25 },
    ],
  },
  {
    id: "web-developer",
    label: "Web Developer",
    cases: [
      { id: "strong", label: "Strong", file: "strong-match-resume.txt", min: 80, max: 100 },
      { id: "medium", label: "Medium", file: "medium-match-resume.txt", min: 40, max: 70 },
      { id: "mismatch", label: "Clear mismatch", file: "clear-mismatch-resume.txt", min: 0, max: 20 },
    ],
  },
]);

/**
 * @typedef {object} BenchmarkCase
 * @property {string} id
 * @property {string} label
 * @property {string} file
 * @property {number} min
 * @property {number} max
 */

/**
 * @typedef {object} BenchmarkFamily
 * @property {string} id
 * @property {string} label
 * @property {readonly BenchmarkCase[]} cases
 */

/**
 * @typedef {object} BenchmarkResult
 * @property {string} familyId
 * @property {string} familyLabel
 * @property {string} caseId
 * @property {string} caseLabel
 * @property {number} repetition
 * @property {{ min: number, max: number }} expectedRange
 * @property {string} startedAt
 * @property {number} durationMs
 * @property {number | null} score
 * @property {string[]} requirements
 * @property {{ requirement: string, status: "covered" | "partial" | "gap", matchedBullets: string[], severity: "low" | "medium" | "high" | null }[]} matches
 * @property {string} summary
 * @property {string | null} error
 * @property {string[]} warnings
 */

/** @type {Window & {
 *   GapcheckResume?: { splitResumeIntoBullets: (rawText: string) => string[] },
 *   GapcheckNano?: {
 *     ensureLanguageModelReady: (onDownloadProgress?: (percent: number) => void) => Promise<void>,
 *     extractRequirementsFromJobText: (jobText: string) => Promise<string[]>,
 *     analyzeRequirementsWithResumeBullets: (requirements: string[], resumeBullets: string[]) => Promise<{ matches: BenchmarkResult["matches"], summary: string }>,
 *     computeOverallScore: (matches: BenchmarkResult["matches"]) => number
 *   }
 * }} */
const benchmarkWindow = window;

const runBtn = /** @type {HTMLButtonElement} */ (document.getElementById("runBtn"));
const cancelBtn = /** @type {HTMLButtonElement} */ (document.getElementById("cancelBtn"));
const copyJsonBtn = /** @type {HTMLButtonElement} */ (document.getElementById("copyJsonBtn"));
const copyMarkdownBtn = /** @type {HTMLButtonElement} */ (document.getElementById("copyMarkdownBtn"));
const repetitionsInput = /** @type {HTMLInputElement} */ (document.getElementById("repetitions"));
const statusText = /** @type {HTMLParagraphElement} */ (document.getElementById("status"));
const elapsedText = /** @type {HTMLSpanElement} */ (document.getElementById("elapsed"));
const progress = /** @type {HTMLProgressElement} */ (document.getElementById("progress"));
const progressCount = /** @type {HTMLParagraphElement} */ (document.getElementById("progressCount"));
const resultsBody = /** @type {HTMLTableSectionElement} */ (document.getElementById("resultsBody"));
const reportWarnings = /** @type {HTMLDivElement} */ (document.getElementById("reportWarnings"));

let isRunning = false;
let cancelRequested = false;
let runStartedAt = 0;
let elapsedTimer = 0;
/** @type {BenchmarkResult[]} */
let results = [];
/** @type {string[]} */
let orderingWarnings = [];
let lastRunCancelled = false;

/**
 * @param {string} message
 * @param {"info" | "ok" | "error"} [state]
 */
function setStatus(message, state = "info") {
  statusText.textContent = message;
  statusText.dataset.state = state;
}

/**
 * @param {number} milliseconds
 * @returns {string}
 */
function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateElapsed() {
  elapsedText.textContent = formatDuration(Date.now() - runStartedAt);
}

/**
 * @returns {BenchmarkFamily[]}
 */
function getSelectedFamilies() {
  const selectedIds = new Set(
    Array.from(document.querySelectorAll('input[name="family"]:checked')).map((input) => {
      return /** @type {HTMLInputElement} */ (input).value;
    })
  );

  return BENCHMARK_FAMILIES.filter((family) => selectedIds.has(family.id));
}

/**
 * @param {string} path
 * @returns {Promise<string>}
 */
async function loadFixture(path) {
  const response = await fetch(`fixtures/${path}`);

  if (!response.ok) {
    throw new Error(`Could not load fixture ${path} (${response.status}).`);
  }

  return response.text();
}

/**
 * @param {BenchmarkResult} result
 */
function appendResultRow(result) {
  const emptyRow = resultsBody.querySelector(".empty-row");

  if (emptyRow) {
    emptyRow.remove();
  }

  const row = document.createElement("tr");
  const scoreInRange =
    result.score !== null && result.score >= result.expectedRange.min && result.score <= result.expectedRange.max;
  row.dataset.state = result.error ? "error" : scoreInRange ? "ok" : "warn";

  const values = [
    result.familyLabel,
    String(result.repetition),
    result.caseLabel,
    result.score === null ? "—" : `${result.score}%`,
    `${result.expectedRange.min}-${result.expectedRange.max}%`,
    formatDuration(result.durationMs),
    result.error || (result.warnings.length > 0 ? result.warnings.join(" ") : "Recorded"),
  ];

  values.forEach((value, index) => {
    const cell = document.createElement("td");
    cell.textContent = value;

    if (index === 3) {
      cell.className = "score";
    } else if (index === 5) {
      cell.className = "time";
    }

    row.appendChild(cell);
  });

  resultsBody.appendChild(row);
}

/**
 * @returns {string[]}
 */
function findOrderingWarnings() {
  /** @type {string[]} */
  const warnings = [];

  BENCHMARK_FAMILIES.forEach((family) => {
    const familyResults = results.filter((result) => result.familyId === family.id && !result.error);
    const repetitions = new Set(familyResults.map((result) => result.repetition));

    repetitions.forEach((repetition) => {
      const repetitionResults = familyResults.filter((result) => result.repetition === repetition);
      const strong = repetitionResults.find((result) => result.caseId === "strong");
      const medium = repetitionResults.find((result) => result.caseId === "medium");
      const mismatch = repetitionResults.find((result) => result.caseId === "mismatch");

      if (strong && medium && strong.score !== null && medium.score !== null && strong.score <= medium.score) {
        warnings.push(`${family.label} repetition ${repetition}: strong did not score above medium.`);
      }

      if (
        medium &&
        mismatch &&
        medium.score !== null &&
        mismatch.score !== null &&
        medium.score <= mismatch.score
      ) {
        warnings.push(`${family.label} repetition ${repetition}: medium did not score above clear mismatch.`);
      }
    });
  });

  return warnings;
}

function renderReportWarnings() {
  orderingWarnings = findOrderingWarnings();

  if (orderingWarnings.length === 0) {
    reportWarnings.hidden = true;
    reportWarnings.replaceChildren();
    return;
  }

  const heading = document.createElement("strong");
  heading.textContent = "Ordering warnings";
  const list = document.createElement("ul");

  orderingWarnings.forEach((warning) => {
    const item = document.createElement("li");
    item.textContent = warning;
    list.appendChild(item);
  });

  reportWarnings.replaceChildren(heading, list);
  reportWarnings.hidden = false;
}

/**
 * @returns {{ version: number, createdAt: string, cancelled: boolean, orderingWarnings: string[], runs: BenchmarkResult[] }}
 */
function buildJsonReport() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    cancelled: lastRunCancelled,
    orderingWarnings,
    runs: results,
  };
}

/**
 * @returns {string}
 */
function buildMarkdownReport() {
  const lines = [
    "# GapCheck benchmark report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Cancelled: ${lastRunCancelled ? "yes" : "no"}`,
    "",
    "## Summary",
    "",
    "| Family | Repetition | Resume | Score | Target | Duration | Result |",
    "| --- | ---: | --- | ---: | ---: | ---: | --- |",
  ];

  results.forEach((result) => {
    const outcome = result.error || (result.warnings.length > 0 ? result.warnings.join(" ") : "Recorded");
    lines.push(
      `| ${result.familyLabel} | ${result.repetition} | ${result.caseLabel} | ${result.score ?? "—"} | ${result.expectedRange.min}-${result.expectedRange.max} | ${formatDuration(result.durationMs)} | ${outcome} |`
    );
  });

  if (orderingWarnings.length > 0) {
    lines.push("", "## Ordering warnings", "");
    orderingWarnings.forEach((warning) => lines.push(`- ${warning}`));
  }

  lines.push("", "## Run details");

  results.forEach((result) => {
    lines.push(
      "",
      `### ${result.familyLabel} / ${result.caseLabel} / repetition ${result.repetition}`,
      "",
      `- Score: ${result.score === null ? "not available" : `${result.score}%`}`,
      `- Duration: ${formatDuration(result.durationMs)}`,
      `- Error: ${result.error || "none"}`,
      `- Summary: ${result.summary || "none"}`,
      "",
      "Requirements and matches:",
      ""
    );

    if (result.matches.length === 0) {
      result.requirements.forEach((requirement) => lines.push(`- ${requirement}`));
    } else {
      result.matches.forEach((match) => {
        lines.push(
          `- **${match.status}** (${match.severity || "no severity"}) ${match.requirement}`,
          `  - Evidence: ${match.matchedBullets.length > 0 ? match.matchedBullets.join(" | ") : "none"}`
        );
      });
    }
  });

  return lines.join("\n");
}

/**
 * @param {string} text
 * @param {HTMLButtonElement} button
 */
async function copyReport(text, button) {
  const originalLabel = button.textContent;
  await navigator.clipboard.writeText(text);
  button.textContent = "Copied";
  window.setTimeout(() => {
    button.textContent = originalLabel;
  }, 1500);
}

async function runBenchmarks() {
  if (isRunning) {
    return;
  }

  const selectedFamilies = getSelectedFamilies();
  const repetitions = Math.max(1, Math.min(10, Number.parseInt(repetitionsInput.value, 10) || 1));
  repetitionsInput.value = String(repetitions);

  if (selectedFamilies.length === 0) {
    setStatus("Select at least one benchmark family.", "error");
    return;
  }

  const nano = benchmarkWindow.GapcheckNano;
  const resumeParser = benchmarkWindow.GapcheckResume;

  if (!nano || !resumeParser) {
    setStatus("The GapCheck analysis helpers did not load.", "error");
    return;
  }

  isRunning = true;
  cancelRequested = false;
  lastRunCancelled = false;
  results = [];
  orderingWarnings = [];
  resultsBody.innerHTML = '<tr class="empty-row"><td colspan="7">Waiting for the first result…</td></tr>';
  reportWarnings.hidden = true;
  reportWarnings.replaceChildren();
  runBtn.disabled = true;
  cancelBtn.disabled = false;
  copyJsonBtn.disabled = true;
  copyMarkdownBtn.disabled = true;
  document.querySelectorAll('input[name="family"], #repetitions').forEach((input) => {
    /** @type {HTMLInputElement} */ (input).disabled = true;
  });

  const total =
    selectedFamilies.reduce((sum, family) => sum + family.cases.length, 0) * repetitions;
  let completed = 0;
  progress.max = total;
  progress.value = 0;
  progressCount.textContent = `0 of ${total} comparisons completed`;
  runStartedAt = Date.now();
  updateElapsed();
  elapsedTimer = window.setInterval(updateElapsed, 1000);

  try {
    setStatus("Checking Gemini Nano availability…");
    await nano.ensureLanguageModelReady((percent) => {
      setStatus(`Downloading Gemini Nano… ${Math.round(percent)}%`);
    });

    for (const family of selectedFamilies) {
      if (cancelRequested) {
        break;
      }

      const jobText = await loadFixture(`${family.id}/job.txt`);
      /** @type {Map<string, string[]>} */
      const resumeBulletsByFile = new Map();

      for (const benchmarkCase of family.cases) {
        const resumeText = await loadFixture(`${family.id}/${benchmarkCase.file}`);
        resumeBulletsByFile.set(benchmarkCase.file, resumeParser.splitResumeIntoBullets(resumeText));
      }

      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        for (const benchmarkCase of family.cases) {
          if (cancelRequested) {
            break;
          }

          const startedAt = new Date();
          const startedMs = Date.now();
          /** @type {string[]} */
          let requirements = [];
          /** @type {BenchmarkResult["matches"]} */
          let matches = [];
          let summary = "";
          let score = null;
          let error = null;
          /** @type {string[]} */
          const warnings = [];

          try {
            setStatus(
              `${family.label}, repetition ${repetition}: extracting requirements for ${benchmarkCase.label.toLowerCase()} match…`
            );
            requirements = await nano.extractRequirementsFromJobText(jobText);

            setStatus(
              `${family.label}, repetition ${repetition}: analyzing ${benchmarkCase.label.toLowerCase()} match…`
            );
            const analysis = await nano.analyzeRequirementsWithResumeBullets(
              requirements,
              resumeBulletsByFile.get(benchmarkCase.file) || []
            );
            matches = analysis.matches;
            summary = analysis.summary;
            score = nano.computeOverallScore(matches);

            if (score < benchmarkCase.min || score > benchmarkCase.max) {
              warnings.push(`Outside target range (${benchmarkCase.min}-${benchmarkCase.max}%).`);
            }
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
          }

          const result = {
            familyId: family.id,
            familyLabel: family.label,
            caseId: benchmarkCase.id,
            caseLabel: benchmarkCase.label,
            repetition,
            expectedRange: { min: benchmarkCase.min, max: benchmarkCase.max },
            startedAt: startedAt.toISOString(),
            durationMs: Date.now() - startedMs,
            score,
            requirements,
            matches,
            summary,
            error,
            warnings,
          };

          results.push(result);
          appendResultRow(result);
          completed += 1;
          progress.value = completed;
          progressCount.textContent = `${completed} of ${total} comparisons completed`;
        }
      }
    }

    lastRunCancelled = cancelRequested;
    renderReportWarnings();
    setStatus(
      cancelRequested
        ? `Cancelled after ${completed} of ${total} comparisons.`
        : `Completed ${completed} comparisons.`,
      "ok"
    );
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    isRunning = false;
    window.clearInterval(elapsedTimer);
    updateElapsed();
    runBtn.disabled = false;
    cancelBtn.disabled = true;
    copyJsonBtn.disabled = results.length === 0;
    copyMarkdownBtn.disabled = results.length === 0;
    document.querySelectorAll('input[name="family"], #repetitions').forEach((input) => {
      /** @type {HTMLInputElement} */ (input).disabled = false;
    });
  }
}

runBtn.addEventListener("click", runBenchmarks);

cancelBtn.addEventListener("click", () => {
  cancelRequested = true;
  cancelBtn.disabled = true;
  setStatus("Cancellation requested. The current analysis will finish first.");
});

copyJsonBtn.addEventListener("click", async () => {
  try {
    await copyReport(JSON.stringify(buildJsonReport(), null, 2), copyJsonBtn);
  } catch (err) {
    setStatus(`Could not copy JSON: ${err instanceof Error ? err.message : String(err)}`, "error");
  }
});

copyMarkdownBtn.addEventListener("click", async () => {
  try {
    await copyReport(buildMarkdownReport(), copyMarkdownBtn);
  } catch (err) {
    setStatus(`Could not copy Markdown: ${err instanceof Error ? err.message : String(err)}`, "error");
  }
});
