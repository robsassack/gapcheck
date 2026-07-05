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
 * @property {(options?: { initialPrompts?: { role: "system" | "user" | "assistant", content: string }[] }) => Promise<LanguageModelSession>} create
 */

/**
 * @typedef {Window & {
 *   GapcheckNano?: {
 *     extractRequirementsFromJobText: typeof extractRequirementsFromJobText,
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
    throw new Error("Pass 1 response did not include a requirements array.");
  }

  const result = /** @type {{ requirements?: unknown }} */ (value);

  if (!Array.isArray(result.requirements)) {
    throw new Error("Pass 1 response did not include a requirements array.");
  }

  if (result.requirements.length > PASS_1_MAX_REQUIREMENTS) {
    throw new Error(`Pass 1 returned more than ${PASS_1_MAX_REQUIREMENTS} requirements.`);
  }

  const hasInvalidRequirement = result.requirements.some((requirement) => {
    return typeof requirement !== "string" || requirement.trim().length === 0;
  });

  if (hasInvalidRequirement) {
    throw new Error("Pass 1 returned an invalid requirement.");
  }
}

/**
 * @param {string} jobText
 * @returns {Promise<string[]>}
 */
async function extractRequirementsFromJobText(jobText) {
  if (typeof LanguageModel === "undefined") {
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
    session = await /** @type {LanguageModelGlobal} */ (LanguageModel).create({
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
    const parsedResult = JSON.parse(rawResult);

    assertValidPass1ExtractionResult(parsedResult);

    const requirements = parsedResult.requirements.map((requirement) => requirement.trim());
    debugLog("Pass 1 requirements", requirements);

    return requirements;
  } finally {
    if (session) {
      session.destroy();
    }
  }
}

const PASS_2_ANALYSIS_SYSTEM_PROMPT = [
  "Compare the provided job requirements against the provided resume bullets.",
  "Return one matches item for each provided requirement, in the same order.",
  "Copy each requirement string exactly into its matches item.",
  'Use status "covered" when the resume clearly satisfies the requirement, "partial" when it shows related but incomplete evidence, and "gap" when it does not show relevant evidence.',
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
  const { resumeBullets } = await chrome.storage.local.get("resumeBullets");

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
    throw new Error("Pass 2 response was not an object.");
  }

  const result = /** @type {{ matches?: unknown, summary?: unknown }} */ (value);

  if (!Array.isArray(result.matches)) {
    throw new Error("Pass 2 response did not include a matches array.");
  }

  if (result.matches.length !== requirements.length) {
    throw new Error("Pass 2 returned a different number of matches than requirements.");
  }

  if (typeof result.summary !== "string") {
    throw new Error("Pass 2 response did not include a summary string.");
  }

  result.matches.forEach((match, index) => {
    if (!match || typeof match !== "object") {
      throw new Error(`Pass 2 match ${index + 1} was not an object.`);
    }

    const candidate = /** @type {{ requirement?: unknown, status?: unknown, matchedBullets?: unknown, severity?: unknown }} */ (match);

    if (
      typeof candidate.status !== "string" ||
      !MATCH_STATUSES.includes(/** @type {MatchStatus} */ (candidate.status))
    ) {
      throw new Error(`Pass 2 match ${index + 1} had an invalid status.`);
    }

    if (!Array.isArray(candidate.matchedBullets)) {
      throw new Error(`Pass 2 match ${index + 1} did not include matchedBullets.`);
    }

    const hasInvalidBullet = candidate.matchedBullets.some((bullet) => {
      return typeof bullet !== "string" || bullet.trim().length === 0;
    });

    if (hasInvalidBullet) {
      throw new Error(`Pass 2 match ${index + 1} included an invalid matched bullet.`);
    }

    const validSeverity =
      candidate.severity === null ||
      (typeof candidate.severity === "string" &&
        MATCH_SEVERITIES.includes(/** @type {MatchSeverity} */ (candidate.severity)));

    if (!validSeverity) {
      throw new Error(`Pass 2 match ${index + 1} had an invalid severity.`);
    }
  });
}

/**
 * @param {string[]} requirements
 * @returns {Promise<Pass2AnalysisResult>}
 */
async function analyzeRequirementsWithSavedResume(requirements) {
  if (typeof LanguageModel === "undefined") {
    throw new Error("LanguageModel is not available in this browser.");
  }

  const normalizedRequirements = validatePromptStringArray(
    requirements,
    "Requirements",
    PASS_1_MAX_REQUIREMENTS
  );
  const resumeBullets = await getSavedResumeBullets();
  const promptInput = JSON.stringify(
    {
      requirements: normalizedRequirements,
      resumeBullets,
    },
    null,
    2
  );

  debugLog("Pass 2 input", {
    requirements: normalizedRequirements,
    resumeBullets,
    promptInput,
  });

  /** @type {LanguageModelSession | null} */
  let session = null;

  try {
    session = await /** @type {LanguageModelGlobal} */ (LanguageModel).create({
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
    const parsedResult = JSON.parse(rawResult);

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
  extractRequirementsFromJobText,
  analyzeRequirementsWithSavedResume,
  computeOverallScore,
  enableDebug,
  disableDebug,
  isDebugEnabled,
});
