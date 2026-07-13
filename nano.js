// @ts-check

const PASS_1_MAX_REQUIREMENTS = 20;
const PASS_1_JOB_TEXT_CHAR_LIMIT = 6000;
const GAPCHECK_DEBUG_STORAGE_KEY = "gapcheckDebug";
const MATCH_STATUSES = Object.freeze(["covered", "partial", "gap"]);
const MATCH_SEVERITIES = Object.freeze(["low", "medium", "high"]);
const MATCH_STATUS_SCORES = Object.freeze({
  covered: 1,
  partial: 0.5,
  gap: 0,
});

const PASS_1_EXTRACTION_SYSTEM_PROMPT = [
  "Extract the most important concrete job requirements from the provided job posting.",
  `Return at most ${PASS_1_MAX_REQUIREMENTS} requirements.`,
  "If the posting contains more candidates, prioritize must-have qualifications, required skills, required experience levels, credentials, responsibilities, and explicit work constraints.",
  "Avoid duplicate or overlapping requirements, and do not split one requirement into multiple items unless each item is independently required.",
  "Write each requirement as a concise standalone string.",
  "Do not include benefits, company culture, generic marketing copy, or application instructions.",
].join(" ");

const PASS_1_REQUIREMENTS_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    requirements: {
      type: "array",
      items: {
        type: "string",
      },
      maxItems: PASS_1_MAX_REQUIREMENTS,
    },
  },
  required: ["requirements"],
  additionalProperties: false,
});

/**
 * @typedef {object} Pass1ExtractionResult
 * @property {string[]} requirements
 */

/**
 * @typedef {"covered" | "partial" | "gap"} MatchStatus
 */

/**
 * @typedef {"low" | "medium" | "high"} MatchSeverity
 */

/**
 * @typedef {object} MatchResult
 * @property {string} requirement
 * @property {MatchStatus} status
 * @property {string[]} matchedBullets
 * @property {MatchSeverity | null} severity
 */

/**
 * @typedef {object} Pass2AnalysisResult
 * @property {MatchResult[]} matches
 * @property {string} summary
 */

/**
 * @typedef {object} LanguageModelSession
 * @property {(input: string, options?: { responseConstraint?: object }) => Promise<string>} prompt
 * @property {() => void} destroy
 */

/**
 * @typedef {object} LanguageModelGlobal
 * @property {(options?: {
 *   initialPrompts?: { role: "system" | "user" | "assistant", content: string }[],
 *   monitor?: (monitor: EventTarget) => void
 * }) => Promise<LanguageModelSession>} create
 * @property {() => Promise<"available" | "downloadable" | "downloading" | "unavailable">} availability
 */

/**
 * @returns {LanguageModelGlobal | undefined}
 */
function getLanguageModelGlobal() {
  return /** @type {{ LanguageModel?: LanguageModelGlobal }} */ (
    /** @type {unknown} */ (globalThis)
  ).LanguageModel;
}

/**
 * @typedef {Window & {
 *   GapcheckNano?: {
 *     ensureLanguageModelReady: typeof ensureLanguageModelReady,
 *     extractRequirementsFromJobText: typeof extractRequirementsFromJobText,
 *     analyzeRequirementsWithResumeBullets: typeof analyzeRequirementsWithResumeBullets,
 *     analyzeRequirementsWithSavedResume: typeof analyzeRequirementsWithSavedResume,
 *     computeOverallScore: typeof computeOverallScore,
 *     enableDebug: typeof enableDebug,
 *     disableDebug: typeof disableDebug,
 *     isDebugEnabled: typeof isDebugEnabled
 *   }
 * }} GapcheckWindow
 */

/**
 * @returns {boolean}
 */
function isDebugEnabled() {
  return localStorage.getItem(GAPCHECK_DEBUG_STORAGE_KEY) === "true";
}

function enableDebug() {
  localStorage.setItem(GAPCHECK_DEBUG_STORAGE_KEY, "true");
  console.info("GapCheck debug logging enabled. Logs may include captured job text and resume bullets.");
}

function disableDebug() {
  localStorage.removeItem(GAPCHECK_DEBUG_STORAGE_KEY);
  console.info("GapCheck debug logging disabled.");
}

/**
 * @param {string} label
 * @param {unknown} data
 */
function debugLog(label, data) {
  if (!isDebugEnabled()) {
    return;
  }

  console.log(`[GapCheck debug] ${label}`, data);
}

/**
 * @param {string} message
 * @returns {Error}
 */
function createModelOutputError(message) {
  const error = new Error(message);
  error.name = "GapcheckModelOutputError";
  return error;
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isModelOutputError(error) {
  return error instanceof SyntaxError || (error instanceof Error && error.name === "GapcheckModelOutputError");
}

/**
 * @template T
 * @param {() => Promise<T>} operation
 * @param {string} label
 * @returns {Promise<T>}
 */
async function withModelOutputRetry(operation, label) {
  try {
    return await operation();
  } catch (err) {
    if (!isModelOutputError(err)) {
      throw err;
    }

    debugLog(`${label} output invalid; retrying once`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    return await operation();
  } catch (err) {
    if (isModelOutputError(err)) {
      throw new Error(`${label} returned malformed output after retry.`);
    }

    throw err;
  }
}

/**
 * @param {string} rawResult
 * @param {string} label
 * @returns {unknown}
 */
function parseModelJson(rawResult, label) {
  try {
    return JSON.parse(rawResult);
  } catch (err) {
    throw createModelOutputError(`${label} returned invalid JSON.`);
  }
}

/**
 * @param {number} loaded
 * @returns {number}
 */
function normalizeDownloadProgress(loaded) {
  if (!Number.isFinite(loaded)) {
    return 0;
  }

  if (loaded > 1) {
    return Math.max(0, Math.min(100, loaded));
  }

  return Math.max(0, Math.min(100, loaded * 100));
}

/**
 * @param {(progressPercent: number) => void} [onDownloadProgress]
 * @returns {Promise<void>}
 */
async function ensureLanguageModelReady(onDownloadProgress) {
  const languageModel = getLanguageModelGlobal();

  if (!languageModel) {
    throw new Error("LanguageModel is not available in this browser.");
  }

  const availability = await languageModel.availability();

  if (availability === "available") {
    return;
  }

  if (availability === "unavailable") {
    throw new Error("This device or Chrome build does not support the on-device model.");
  }

  /** @type {LanguageModelSession | null} */
  let session = null;

  try {
    session = await languageModel.create({
      monitor(monitor) {
        if (!onDownloadProgress) {
          return;
        }

        monitor.addEventListener("downloadprogress", (event) => {
          const progressEvent = /** @type {ProgressEvent} */ (event);
          onDownloadProgress(normalizeDownloadProgress(progressEvent.loaded));
        });
      },
    });
  } finally {
    if (session) {
      session.destroy();
    }
  }
}

/**
 * @param {string} jobText
 * @returns {string}
 */
function truncateJobTextForPass1(jobText) {
  return jobText.trim().slice(0, PASS_1_JOB_TEXT_CHAR_LIMIT);
}

/**
 * @param {unknown} value
 * @returns {asserts value is Pass1ExtractionResult}
 */
function assertValidPass1ExtractionResult(value) {
  if (!value || typeof value !== "object") {
    throw createModelOutputError("Pass 1 response did not include a requirements array.");
  }

  const result = /** @type {{ requirements?: unknown }} */ (value);

  if (!Array.isArray(result.requirements)) {
    throw createModelOutputError("Pass 1 response did not include a requirements array.");
  }

  if (result.requirements.length > PASS_1_MAX_REQUIREMENTS) {
    throw createModelOutputError(`Pass 1 returned more than ${PASS_1_MAX_REQUIREMENTS} requirements.`);
  }

  const hasInvalidRequirement = result.requirements.some((requirement) => {
    return typeof requirement !== "string" || requirement.trim().length === 0;
  });

  if (hasInvalidRequirement) {
    throw createModelOutputError("Pass 1 returned an invalid requirement.");
  }
}

/**
 * @param {string} jobText
 * @returns {Promise<string[]>}
 */
async function extractRequirementsFromJobText(jobText) {
  return withModelOutputRetry(async () => {
    const languageModel = getLanguageModelGlobal();

    if (!languageModel) {
      throw new Error("LanguageModel is not available in this browser.");
    }

    const truncatedJobText = truncateJobTextForPass1(jobText);

    debugLog("Pass 1 input", {
      originalCharCount: jobText.length,
      truncatedCharCount: truncatedJobText.length,
      truncated: jobText.trim().length > PASS_1_JOB_TEXT_CHAR_LIMIT,
      text: truncatedJobText,
    });

    /** @type {LanguageModelSession | null} */
    let session = null;

    try {
      session = await languageModel.create({
        initialPrompts: [
          {
            role: "system",
            content: PASS_1_EXTRACTION_SYSTEM_PROMPT,
          },
        ],
      });

      const rawResult = await session.prompt(truncatedJobText, {
        responseConstraint: PASS_1_REQUIREMENTS_SCHEMA,
      });
      const parsedResult = parseModelJson(rawResult, "Pass 1");

      assertValidPass1ExtractionResult(parsedResult);

      const requirements = parsedResult.requirements.map((requirement) => requirement.trim());
      debugLog("Pass 1 requirements", requirements);

      return requirements;
    } finally {
      if (session) {
        session.destroy();
      }
    }
  }, "Pass 1");
}

const PASS_2_ANALYSIS_SYSTEM_PROMPT = [
  "Compare the provided job requirements against the provided resume bullets.",
  "Treat technical skills, project descriptions, professional experience, support roles, and education/coursework as valid evidence.",
  "Do not penalize a resume for showing broader or more senior experience than the job requires.",
  "Return one matches item for each provided requirement, in the same order.",
  "Copy each requirement string exactly into its matches item.",
  'Use status "covered" when the resume gives direct evidence of the required capability, including equivalent tools, transferable experience, or closely related domain work unless the requirement explicitly demands a specific credential, certification, platform, or years of experience.',
  'Use status "partial" when the resume shows adjacent or incomplete evidence that a human reviewer would likely consider relevant, even if it does not fully prove the exact requirement.',
  'Use status "gap" only when the resume provides no meaningful evidence for the requirement.',
  "Prefer partial over gap when there is credible related evidence.",
  'Examples: HTML/CSS/JavaScript, TypeScript, React, Next.js, or front-end project work can cover general web-page or front-end development requirements; Git, Azure DevOps, or release workflow evidence can cover Git collaboration requirements; support, ticketing, Agile, release coordination, or client-facing IT work can cover communication requirements.',
  "For browser, mobile, accessibility, performance, and SEO requirements, use partial when the resume shows related web development experience but does not explicitly name that practice.",
  'For covered requirements, set severity to null; for partial and gap requirements, set severity to "low", "medium", or "high" based on the importance of the missing evidence.',
  "Always include matchedBullets as an array; use an empty array when no resume bullets support the requirement.",
  "Keep the summary to one or two concise sentences.",
].join(" ");

const PASS_2_ANALYSIS_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    matches: {
      type: "array",
      maxItems: PASS_1_MAX_REQUIREMENTS,
      items: {
        type: "object",
        properties: {
          requirement: {
            type: "string",
          },
          status: {
            type: "string",
            enum: MATCH_STATUSES,
          },
          matchedBullets: {
            type: "array",
            items: {
              type: "string",
            },
          },
          severity: {
            type: ["string", "null"],
            enum: [...MATCH_SEVERITIES, null],
          },
        },
        required: ["requirement", "status", "matchedBullets", "severity"],
        additionalProperties: false,
      },
    },
    summary: {
      type: "string",
    },
  },
  required: ["matches", "summary"],
  additionalProperties: false,
});

/**
 * @param {unknown[]} values
 * @returns {string[]}
 */
function normalizeStringArray(values) {
  /** @type {string[]} */
  const normalized = [];

  values.forEach((value) => {
    if (typeof value !== "string") {
      return;
    }

    const trimmed = value.trim();

    if (trimmed) {
      normalized.push(trimmed);
    }
  });

  return normalized;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {number} [maxItems]
 * @returns {string[]}
 */
function validatePromptStringArray(value, label, maxItems) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  const normalized = normalizeStringArray(value);

  if (normalized.length !== value.length) {
    throw new Error(`${label} must contain only non-empty strings.`);
  }

  if (typeof maxItems === "number" && normalized.length > maxItems) {
    throw new Error(`${label} must contain at most ${maxItems} items.`);
  }

  return normalized;
}

/**
 * @returns {Promise<string[]>}
 */
async function getSavedResumeBullets() {
  const { resumeBullets } = /** @type {{ resumeBullets?: unknown }} */ (
    await chrome.storage.local.get("resumeBullets")
  );

  if (!resumeBullets) {
    return [];
  }

  return validatePromptStringArray(resumeBullets, "Saved resume bullets");
}

/**
 * @param {unknown} value
 * @param {string[]} requirements
 * @returns {asserts value is Pass2AnalysisResult}
 */
function assertValidPass2AnalysisResult(value, requirements) {
  if (!value || typeof value !== "object") {
    throw createModelOutputError("Pass 2 response was not an object.");
  }

  const result = /** @type {{ matches?: unknown, summary?: unknown }} */ (value);

  if (!Array.isArray(result.matches)) {
    throw createModelOutputError("Pass 2 response did not include a matches array.");
  }

  if (result.matches.length !== requirements.length) {
    throw createModelOutputError("Pass 2 returned a different number of matches than requirements.");
  }

  if (typeof result.summary !== "string") {
    throw createModelOutputError("Pass 2 response did not include a summary string.");
  }

  result.matches.forEach((match, index) => {
    if (!match || typeof match !== "object") {
      throw createModelOutputError(`Pass 2 match ${index + 1} was not an object.`);
    }

    const candidate = /** @type {{ requirement?: unknown, status?: unknown, matchedBullets?: unknown, severity?: unknown }} */ (match);

    if (
      typeof candidate.status !== "string" ||
      !MATCH_STATUSES.includes(/** @type {MatchStatus} */ (candidate.status))
    ) {
      throw createModelOutputError(`Pass 2 match ${index + 1} had an invalid status.`);
    }

    if (!Array.isArray(candidate.matchedBullets)) {
      throw createModelOutputError(`Pass 2 match ${index + 1} did not include matchedBullets.`);
    }

    const hasInvalidBullet = candidate.matchedBullets.some((bullet) => {
      return typeof bullet !== "string" || bullet.trim().length === 0;
    });

    if (hasInvalidBullet) {
      throw createModelOutputError(`Pass 2 match ${index + 1} included an invalid matched bullet.`);
    }

    const validSeverity =
      candidate.severity === null ||
      (typeof candidate.severity === "string" &&
        MATCH_SEVERITIES.includes(/** @type {MatchSeverity} */ (candidate.severity)));

    if (!validSeverity) {
      throw createModelOutputError(`Pass 2 match ${index + 1} had an invalid severity.`);
    }
  });
}

/**
 * @param {string[]} requirements
 * @param {string[]} resumeBullets
 * @returns {Promise<Pass2AnalysisResult>}
 */
async function analyzeRequirementsWithResumeBullets(requirements, resumeBullets) {
  return withModelOutputRetry(async () => {
    const languageModel = getLanguageModelGlobal();

    if (!languageModel) {
      throw new Error("LanguageModel is not available in this browser.");
    }

    const normalizedRequirements = validatePromptStringArray(
      requirements,
      "Requirements",
      PASS_1_MAX_REQUIREMENTS
    );
    const normalizedResumeBullets = validatePromptStringArray(resumeBullets, "Resume bullets");
    const promptInput = JSON.stringify(
      {
        requirements: normalizedRequirements,
        resumeBullets: normalizedResumeBullets,
      },
      null,
      2
    );

    debugLog("Pass 2 input", {
      requirements: normalizedRequirements,
      resumeBullets: normalizedResumeBullets,
      promptInput,
    });

    /** @type {LanguageModelSession | null} */
    let session = null;

    try {
      session = await languageModel.create({
        initialPrompts: [
          {
            role: "system",
            content: PASS_2_ANALYSIS_SYSTEM_PROMPT,
          },
        ],
      });

      const rawResult = await session.prompt(promptInput, {
        responseConstraint: PASS_2_ANALYSIS_SCHEMA,
      });
      const parsedResult = parseModelJson(rawResult, "Pass 2");

      assertValidPass2AnalysisResult(parsedResult, normalizedRequirements);

      const analysis = {
        matches: parsedResult.matches.map((match, index) => {
          return {
            requirement: normalizedRequirements[index],
            status: match.status,
            matchedBullets: match.matchedBullets.map((bullet) => bullet.trim()),
            severity: match.severity,
          };
        }),
        summary: parsedResult.summary.trim(),
      };

      debugLog("Pass 2 analysis", analysis);

      return analysis;
    } finally {
      if (session) {
        session.destroy();
      }
    }
  }, "Pass 2");
}

/**
 * @param {string[]} requirements
 * @returns {Promise<Pass2AnalysisResult>}
 */
async function analyzeRequirementsWithSavedResume(requirements) {
  const resumeBullets = await getSavedResumeBullets();

  return analyzeRequirementsWithResumeBullets(requirements, resumeBullets);
}

/**
 * @param {{ status: "covered" | "partial" | "gap" }[]} matches
 * @returns {number}
 */
function computeOverallScore(matches) {
  if (matches.length === 0) {
    return 0;
  }

  const total = matches.reduce((sum, match) => {
    return sum + MATCH_STATUS_SCORES[match.status];
  }, 0);

  return Math.round((total / matches.length) * 100);
}

(/** @type {GapcheckWindow} */ (window)).GapcheckNano = Object.freeze({
  ensureLanguageModelReady,
  extractRequirementsFromJobText,
  analyzeRequirementsWithResumeBullets,
  analyzeRequirementsWithSavedResume,
  computeOverallScore,
  enableDebug,
  disableDebug,
  isDebugEnabled,
});
