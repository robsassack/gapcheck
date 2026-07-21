// @ts-check

const BENCHMARK_FAMILIES = Object.freeze([
  {
    id: "product-ops",
    label: "Product Operations",
    pass1Themes: [
      {
        label: "at least five years of relevant experience",
        patterns: [/\b(?:five|5)\s+years?\b/i],
      },
      {
        label: "SQL, BI tools, and spreadsheets",
        patterns: [
          /\bSQL\b/i,
          /\bBI\b|Looker|Tableau|Power BI/i,
          /spreadsheet/i,
        ],
      },
      {
        label: "healthcare or regulated-industry experience",
        patterns: [/healthcare|care delivery|insurance|regulated|compliance/i],
      },
      {
        label: "agile product teams, named tools, and release planning",
        patterns: [
          /\bagile\b/i,
          /Jira|Linear/i,
          /Confluence|Notion/i,
          /release planning/i,
        ],
      },
      {
        label: "B2B SaaS, enterprise-customer, or complex-implementation experience",
        patterns: [/\bB2B\b|\bSaaS\b|enterprise customer|complex implementation/i],
      },
      {
        label: "United States location, Eastern or Central hours, and travel",
        patterns: [
          /United States|\bU\.S\./i,
          /Eastern|Central/i,
          /travel/i,
        ],
      },
      {
        label: "independent prioritization, judgment, and escalation",
        patterns: [/independent|prioriti/i, /judgment/i, /escalat/i],
      },
      {
        label: "cross-functional launch coordination, dependencies, and follow-up",
        patterns: [/coordinat/i, /launch/i, /dependenc/i, /follow-up|follow through/i],
      },
    ],
    pass1Exclusions: [
      {
        label: "illustrative feature-adoption dashboard task",
        pattern: /dashboard[^.]*feature adoption|feature adoption[^.]*dashboard/i,
      },
      {
        label: "illustrative one-off request versus market-pattern task",
        pattern: /one-off customer request|broader market pattern/i,
      },
      {
        label: "illustrative product-intake improvement task",
        pattern: /improv\w* (?:the )?product intake process/i,
      },
      {
        label: "illustrative recurring-workflow review task",
        pattern: /recurring workflow problems?/i,
      },
      {
        label: "illustrative launch-risk summary task",
        pattern: /summar\w* (?:of )?launch risks?/i,
      },
      {
        label: "illustrative quarterly-planning and program-tracking tasks",
        pattern: /quarterly planning|beta-program tracking|customer-advisory-board/i,
      },
    ],
    cases: [
      { id: "strong", label: "Strong", file: "strong-match-resume.txt", min: 75, max: 100 },
      { id: "medium", label: "Medium", file: "medium-match-resume.txt", min: 40, max: 70 },
      { id: "mismatch", label: "Clear mismatch", file: "clear-mismatch-resume.txt", min: 0, max: 25 },
    ],
  },
  {
    id: "web-developer",
    label: "Web Developer",
    pass1Themes: [],
    pass1Exclusions: [],
    cases: [
      { id: "strong", label: "Strong", file: "strong-match-resume.txt", min: 80, max: 100 },
      { id: "medium", label: "Medium", file: "medium-match-resume.txt", min: 40, max: 70 },
      { id: "mismatch", label: "Clear mismatch", file: "clear-mismatch-resume.txt", min: 0, max: 20 },
    ],
  },
]);

const RUN_MODES = Object.freeze({
  controlled: {
    label: "Controlled comparison",
    pass1Strategy: "once-per-family-repetition",
    hint: "Recommended for comparing strong, medium, and mismatch results fairly.",
  },
  "full-pipeline": {
    label: "Full-pipeline variation",
    pass1Strategy: "once-per-resume-analysis",
    hint: "Measures the complete experience, including Pass 1 variation between resume analyses.",
  },
  "pass1-only": {
    label: "Pass 1 audit only",
    pass1Strategy: "pass1-only",
    hint: "Measures requirement extraction stability without running Pass 2.",
  },
  "pass2-pinned": {
    label: "Pass 2 audit with pinned requirements",
    pass1Strategy: "once-per-family",
    hint: "Isolates Pass 2 variation by reusing one requirement set for every repetition.",
  },
});

/** @typedef {"controlled" | "full-pipeline" | "pass1-only" | "pass2-pinned"} RunModeId */

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
 * @property {readonly { label: string, patterns: readonly RegExp[] }[]} pass1Themes
 * @property {readonly { label: string, pattern: RegExp }[]} pass1Exclusions
 * @property {readonly BenchmarkCase[]} cases
 */

/**
 * @typedef {object} BenchmarkResult
 * @property {string} familyId
 * @property {string} familyLabel
 * @property {string} caseId
 * @property {string} caseLabel
 * @property {number} repetition
 * @property {{ min: number, max: number } | null} expectedRange
 * @property {"pass1" | "pass2"} phase
 * @property {string} startedAt
 * @property {number} pass1DurationMs
 * @property {string | null} pass1Error
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
 *     pass1MaxRequirements: number,
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
const modeHint = /** @type {HTMLParagraphElement} */ (document.getElementById("modeHint"));
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
/** @type {RunModeId} */
let lastRunMode = "controlled";

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
 * @returns {Set<string>}
 */
function getSelectedCaseIds() {
  return new Set(
    Array.from(document.querySelectorAll('input[name="resumeCase"]:checked')).map((input) => {
      return /** @type {HTMLInputElement} */ (input).value;
    })
  );
}

/**
 * @returns {RunModeId}
 */
function getSelectedMode() {
  const selected = /** @type {HTMLInputElement | null} */ (
    document.querySelector('input[name="runMode"]:checked')
  );
  const value = selected?.value;

  if (value && Object.prototype.hasOwnProperty.call(RUN_MODES, value)) {
    return /** @type {RunModeId} */ (value);
  }

  return "controlled";
}

function updateModeControls() {
  const mode = getSelectedMode();
  modeHint.textContent = RUN_MODES[mode].hint;

  document.querySelectorAll('input[name="resumeCase"]').forEach((input) => {
    /** @type {HTMLInputElement} */ (input).disabled = mode === "pass1-only";
  });
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
    result.expectedRange !== null &&
    result.score !== null &&
    result.score >= result.expectedRange.min &&
    result.score <= result.expectedRange.max;
  const resultError = result.pass1Error || result.error;
  row.dataset.state = resultError
    ? "error"
    : result.warnings.length > 0
      ? "warn"
      : result.phase === "pass1" || scoreInRange
      ? "ok"
      : "warn";

  const values = [
    result.familyLabel,
    String(result.repetition),
    result.caseLabel,
    result.score === null ? "—" : `${result.score}%`,
    result.expectedRange ? `${result.expectedRange.min}-${result.expectedRange.max}%` : "—",
    `P1 ${formatDuration(result.pass1DurationMs)} / P2 ${formatDuration(result.durationMs)}`,
    resultError || (result.warnings.length > 0 ? result.warnings.join(" ") : "Recorded"),
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
 * Flag Pass 1 output shapes that need human review without changing production
 * extraction or hard-coding benchmark requirements into the extension.
 *
 * @param {BenchmarkFamily} family
 * @param {string[]} requirements
 * @param {number} requirementLimit
 * @returns {string[]}
 */
function findPass1Warnings(family, requirements, requirementLimit) {
  /** @type {string[]} */
  const warnings = [];
  const requirementText = requirements.join("\n");

  if (requirements.length >= requirementLimit) {
    warnings.push(
      `Pass 1 reached the ${requirementLimit}-requirement limit; inspect for fragmentation or omitted qualifications.`
    );
  }

  family.pass1Themes.forEach((theme) => {
    if (!theme.patterns.every((pattern) => pattern.test(requirementText))) {
      warnings.push(`Pass 1 omitted benchmark theme: ${theme.label}.`);
    }
  });

  family.pass1Exclusions.forEach((exclusion) => {
    if (exclusion.pattern.test(requirementText)) {
      warnings.push(`Pass 1 included excluded benchmark example: ${exclusion.label}.`);
    }
  });

  return warnings;
}

/**
 * @returns {string[]}
 */
function findOrderingWarnings() {
  /** @type {string[]} */
  const warnings = [];

  BENCHMARK_FAMILIES.forEach((family) => {
    const familyResults = results.filter(
      (result) =>
        result.familyId === family.id &&
        result.phase === "pass2" &&
        !result.pass1Error &&
        !result.error
    );
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
 * @returns {{ version: number, createdAt: string, cancelled: boolean, mode: RunModeId, pass1Strategy: string, orderingWarnings: string[], runs: BenchmarkResult[] }}
 */
function buildJsonReport() {
  return {
    version: 3,
    createdAt: new Date().toISOString(),
    cancelled: lastRunCancelled,
    mode: lastRunMode,
    pass1Strategy: RUN_MODES[lastRunMode].pass1Strategy,
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
    `Mode: ${RUN_MODES[lastRunMode].label}`,
    "",
    "## Summary",
    "",
    "| Family | Repetition | Resume | Score | Target | Duration | Result |",
    "| --- | ---: | --- | ---: | ---: | ---: | --- |",
  ];

  results.forEach((result) => {
    const outcome =
      result.pass1Error ||
      result.error ||
      (result.warnings.length > 0 ? result.warnings.join(" ") : "Recorded");
    lines.push(
      `| ${result.familyLabel} | ${result.repetition} | ${result.caseLabel} | ${result.score ?? "—"} | ${result.expectedRange ? `${result.expectedRange.min}-${result.expectedRange.max}` : "—"} | P1 ${formatDuration(result.pass1DurationMs)} / P2 ${formatDuration(result.durationMs)} | ${outcome} |`
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
      `- Pass 1 duration: ${formatDuration(result.pass1DurationMs)}`,
      `- Pass 2 duration: ${formatDuration(result.durationMs)}`,
      `- Pass 1 error: ${result.pass1Error || "none"}`,
      `- Pass 2 error: ${result.error || "none"}`,
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
  const selectedCaseIds = getSelectedCaseIds();
  const mode = getSelectedMode();
  const repetitions = Math.max(1, Math.min(10, Number.parseInt(repetitionsInput.value, 10) || 1));
  repetitionsInput.value = String(repetitions);

  if (selectedFamilies.length === 0) {
    setStatus("Select at least one benchmark family.", "error");
    return;
  }

  if (mode !== "pass1-only" && selectedCaseIds.size === 0) {
    setStatus("Select at least one resume case.", "error");
    return;
  }

  const nano = benchmarkWindow.GapcheckNano;
  const resumeParser = benchmarkWindow.GapcheckResume;

  if (!nano || !resumeParser) {
    setStatus("The GapCheck analysis helpers did not load.", "error");
    return;
  }

  const analysisHelpers = nano;

  isRunning = true;
  cancelRequested = false;
  lastRunCancelled = false;
  lastRunMode = mode;
  results = [];
  orderingWarnings = [];
  resultsBody.innerHTML = '<tr class="empty-row"><td colspan="7">Waiting for the first result…</td></tr>';
  reportWarnings.hidden = true;
  reportWarnings.replaceChildren();
  runBtn.disabled = true;
  cancelBtn.disabled = false;
  copyJsonBtn.disabled = true;
  copyMarkdownBtn.disabled = true;
  document.querySelectorAll('input[name="family"], input[name="resumeCase"], input[name="runMode"], #repetitions').forEach((input) => {
    /** @type {HTMLInputElement} */ (input).disabled = true;
  });

  const comparisonsPerRepetition = selectedFamilies.reduce(
    (sum, family) => sum + family.cases.filter((benchmarkCase) => selectedCaseIds.has(benchmarkCase.id)).length,
    0
  );
  const total = mode === "pass1-only" ? selectedFamilies.length * repetitions : comparisonsPerRepetition * repetitions;
  let completed = 0;
  progress.max = total;
  progress.value = 0;
  progressCount.textContent = `0 of ${total} runs completed`;
  runStartedAt = Date.now();
  updateElapsed();
  elapsedTimer = window.setInterval(updateElapsed, 1000);

  /**
   * @param {BenchmarkResult} result
   */
  function recordResult(result) {
    results.push(result);
    appendResultRow(result);
    completed += 1;
    progress.value = completed;
    progressCount.textContent = `${completed} of ${total} runs completed`;
  }

  /**
   * @param {BenchmarkFamily} family
   * @param {number} repetition
   * @param {string} jobText
   * @param {string} context
   * @returns {Promise<{ startedAt: string, durationMs: number, requirements: string[], error: string | null, warnings: string[] }>}
   */
  async function executePass1(family, repetition, jobText, context) {
    const startedAt = new Date();
    const startedMs = Date.now();
    /** @type {string[]} */
    let requirements = [];
    let error = null;

    try {
      setStatus(`${family.label}, repetition ${repetition}: extracting ${context} requirements…`);
      requirements = await analysisHelpers.extractRequirementsFromJobText(jobText);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    return {
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedMs,
      requirements,
      error,
      warnings: error
        ? []
        : findPass1Warnings(family, requirements, analysisHelpers.pass1MaxRequirements),
    };
  }

  /**
   * @param {BenchmarkFamily} family
   * @param {BenchmarkCase} benchmarkCase
   * @param {number} repetition
   * @param {{ startedAt: string, durationMs: number, requirements: string[], error: string | null, warnings: string[] }} pass1
   */
  function recordPass1Failure(family, benchmarkCase, repetition, pass1) {
    recordResult({
      familyId: family.id,
      familyLabel: family.label,
      caseId: benchmarkCase.id,
      caseLabel: benchmarkCase.label,
      repetition,
      phase: "pass2",
      expectedRange: { min: benchmarkCase.min, max: benchmarkCase.max },
      startedAt: pass1.startedAt,
      pass1DurationMs: pass1.durationMs,
      pass1Error: `Pass 1 failed: ${pass1.error || "Unknown error"}`,
      durationMs: 0,
      score: null,
      requirements: pass1.requirements,
      matches: [],
      summary: "",
      error: null,
      warnings: pass1.warnings,
    });
  }

  /**
   * @param {BenchmarkFamily} family
   * @param {BenchmarkCase} benchmarkCase
   * @param {number} repetition
   * @param {{ startedAt: string, durationMs: number, requirements: string[], error: string | null, warnings: string[] }} pass1
   * @param {string[]} resumeBullets
   */
  async function executePass2(family, benchmarkCase, repetition, pass1, resumeBullets) {
    const startedAt = new Date();
    const startedMs = Date.now();
    /** @type {BenchmarkResult["matches"]} */
    let matches = [];
    let summary = "";
    let score = null;
    let error = null;
    /** @type {string[]} */
    const warnings = [...pass1.warnings];

    try {
      setStatus(
        `${family.label}, repetition ${repetition}: running Pass 2 for ${benchmarkCase.label.toLowerCase()} match…`
      );
      const analysis = await analysisHelpers.analyzeRequirementsWithResumeBullets(
        pass1.requirements,
        resumeBullets
      );
      matches = analysis.matches;
      summary = analysis.summary;
      score = analysisHelpers.computeOverallScore(matches);

      if (score < benchmarkCase.min || score > benchmarkCase.max) {
        warnings.push(`Outside target range (${benchmarkCase.min}-${benchmarkCase.max}%).`);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    recordResult({
      familyId: family.id,
      familyLabel: family.label,
      caseId: benchmarkCase.id,
      caseLabel: benchmarkCase.label,
      repetition,
      phase: "pass2",
      expectedRange: { min: benchmarkCase.min, max: benchmarkCase.max },
      startedAt: startedAt.toISOString(),
      pass1DurationMs: pass1.durationMs,
      pass1Error: null,
      durationMs: Date.now() - startedMs,
      score,
      requirements: pass1.requirements,
      matches,
      summary,
      error,
      warnings,
    });
  }

  try {
    setStatus("Checking Gemini Nano availability…");
    await analysisHelpers.ensureLanguageModelReady((percent) => {
      setStatus(`Downloading Gemini Nano… ${Math.round(percent)}%`);
    });

    for (const family of selectedFamilies) {
      if (cancelRequested) {
        break;
      }

      const jobText = await loadFixture(`${family.id}/job.txt`);
      const familyCases = family.cases.filter((benchmarkCase) =>
        selectedCaseIds.has(benchmarkCase.id)
      );
      /** @type {Map<string, string[]>} */
      const resumeBulletsByFile = new Map();

      if (mode !== "pass1-only") {
        for (const benchmarkCase of familyCases) {
          const resumeText = await loadFixture(`${family.id}/${benchmarkCase.file}`);
          resumeBulletsByFile.set(
            benchmarkCase.file,
            resumeParser.splitResumeIntoBullets(resumeText)
          );
        }
      }

      if (mode === "pass1-only") {
        for (let repetition = 1; repetition <= repetitions && !cancelRequested; repetition += 1) {
          const pass1 = await executePass1(family, repetition, jobText, "audit");
          recordResult({
            familyId: family.id,
            familyLabel: family.label,
            caseId: "pass1",
            caseLabel: "Pass 1 only",
            repetition,
            phase: "pass1",
            expectedRange: null,
            startedAt: pass1.startedAt,
            pass1DurationMs: pass1.durationMs,
            pass1Error: pass1.error ? `Pass 1 failed: ${pass1.error}` : null,
            durationMs: 0,
            score: null,
            requirements: pass1.requirements,
            matches: [],
            summary: "",
            error: null,
            warnings: pass1.warnings,
          });
        }

        continue;
      }

      if (mode === "pass2-pinned") {
        const pinnedPass1 = await executePass1(family, 1, jobText, "pinned");

        for (let repetition = 1; repetition <= repetitions && !cancelRequested; repetition += 1) {
          for (const benchmarkCase of familyCases) {
            if (cancelRequested) {
              break;
            }

            if (pinnedPass1.error) {
              recordPass1Failure(family, benchmarkCase, repetition, pinnedPass1);
            } else {
              await executePass2(
                family,
                benchmarkCase,
                repetition,
                pinnedPass1,
                resumeBulletsByFile.get(benchmarkCase.file) || []
              );
            }
          }
        }

        continue;
      }

      for (let repetition = 1; repetition <= repetitions && !cancelRequested; repetition += 1) {
        if (mode === "controlled") {
          const sharedPass1 = await executePass1(family, repetition, jobText, "shared");

          for (const benchmarkCase of familyCases) {
            if (cancelRequested) {
              break;
            }

            if (sharedPass1.error) {
              recordPass1Failure(family, benchmarkCase, repetition, sharedPass1);
            } else {
              await executePass2(
                family,
                benchmarkCase,
                repetition,
                sharedPass1,
                resumeBulletsByFile.get(benchmarkCase.file) || []
              );
            }
          }

          continue;
        }

        for (const benchmarkCase of familyCases) {
          if (cancelRequested) {
            break;
          }

          const freshPass1 = await executePass1(
            family,
            repetition,
            jobText,
            `${benchmarkCase.label.toLowerCase()}-match`
          );

          if (cancelRequested) {
            break;
          }

          if (freshPass1.error) {
            recordPass1Failure(family, benchmarkCase, repetition, freshPass1);
          } else {
            await executePass2(
              family,
              benchmarkCase,
              repetition,
              freshPass1,
              resumeBulletsByFile.get(benchmarkCase.file) || []
            );
          }
        }
      }
    }

    lastRunCancelled = cancelRequested;
    renderReportWarnings();
    setStatus(
      cancelRequested
        ? `Cancelled after ${completed} of ${total} runs.`
        : `Completed ${completed} runs in ${RUN_MODES[mode].label} mode.`,
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
    document.querySelectorAll('input[name="family"], input[name="resumeCase"], input[name="runMode"], #repetitions').forEach((input) => {
      /** @type {HTMLInputElement} */ (input).disabled = false;
    });
    updateModeControls();
  }
}

document.querySelectorAll('input[name="runMode"]').forEach((input) => {
  input.addEventListener("change", updateModeControls);
});

updateModeControls();
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
