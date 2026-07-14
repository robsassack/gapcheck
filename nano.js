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
  "After must-haves, include important preferred or nice-to-have qualifications when space remains.",
  "The input labels detected list items as SOURCE BULLET J1, J2, and so on.",
  "Return no more than one requirements item for each SOURCE BULLET label.",
  "Treat every labeled source bullet as indivisible: do not split tools, audiences, browsers, deliverables, alternatives, or concepts joined by and/or into separate requirements.",
  "Keep the combined meaning of a labeled bullet in one concise requirement, even when some parts are optional or alternatives.",
  "If prose and a list repeat or elaborate the same requirement, return one combined requirement rather than duplicates.",
  "Do not infer extra requirements from company context or example deliverables unless the posting presents them as qualifications or responsibilities.",
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
 * @typedef {object} Pass2ModelMatch
 * @property {string} requirement
 * @property {MatchStatus} status
 * @property {string[]} matchedBulletIds
 * @property {MatchSeverity | null} severity
 */

/**
 * @typedef {object} Pass2ModelResult
 * @property {Pass2ModelMatch[]} matches
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
 * @param {(isRetry: boolean) => Promise<T>} operation
 * @param {string} label
 * @returns {Promise<T>}
 */
async function withModelOutputRetry(operation, label) {
  try {
    return await operation(false);
  } catch (err) {
    if (!isModelOutputError(err)) {
      throw err;
    }

    debugLog(`${label} output invalid; retrying once`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    return await operation(true);
  } catch (err) {
    if (isModelOutputError(err)) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`${label} returned malformed output after retry: ${reason}`);
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
 * Make explicit list-item boundaries visible to the model. Wrapped lines stay
 * attached to their source bullet so compound requirements can be preserved as
 * a single extraction candidate.
 *
 * @param {string} jobText
 * @returns {string}
 */
function labelExplicitJobBullets(jobText) {
  /** @type {string[]} */
  const outputLines = [];
  let bulletIndex = 0;
  let activeBullet = "";

  function flushActiveBullet() {
    if (!activeBullet) {
      return;
    }

    bulletIndex += 1;
    outputLines.push(`[SOURCE BULLET J${bulletIndex} - KEEP AS ONE REQUIREMENT] ${activeBullet}`);
    activeBullet = "";
  }

  jobText.split("\n").forEach((rawLine) => {
    const bulletMatch = rawLine.match(/^\s*(?:[-*•▪◦–—]|\d+[.)])\s+(.+)$/);

    if (bulletMatch) {
      flushActiveBullet();
      activeBullet = bulletMatch[1].trim();
      return;
    }

    const trimmedLine = rawLine.trim();

    if (activeBullet && trimmedLine && /^\s+/.test(rawLine)) {
      activeBullet = `${activeBullet} ${trimmedLine}`;
      return;
    }

    flushActiveBullet();
    outputLines.push(rawLine);
  });

  flushActiveBullet();

  return outputLines.join("\n").trim();
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
    const promptInput = labelExplicitJobBullets(truncatedJobText);

    debugLog("Pass 1 input", {
      originalCharCount: jobText.length,
      truncatedCharCount: truncatedJobText.length,
      truncated: jobText.trim().length > PASS_1_JOB_TEXT_CHAR_LIMIT,
      text: truncatedJobText,
      promptInput,
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

      const rawResult = await session.prompt(promptInput, {
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
  "Compare the provided job requirements against the provided resumeEvidence entries.",
  "Each resumeEvidence entry has a short code-owned id and its original resume text.",
  "Treat technical skills, project descriptions, professional experience, support roles, and education/coursework as valid evidence.",
  "Do not penalize a resume for showing broader or more senior experience than the job requires.",
  "Return one matches item for each provided requirement, in the same order.",
  "Copy each requirement string exactly into its matches item.",
  'Use status "covered" when the resume gives direct evidence of the required capability, including equivalent tools, transferable experience, or closely related domain work unless the requirement explicitly demands a specific credential, certification, platform, or years of experience.',
  'Use status "partial" when the resume shows adjacent or incomplete evidence that a human reviewer would likely consider relevant, even if it does not fully prove the exact requirement.',
  'Use status "gap" only when the resume provides no meaningful evidence for the requirement.',
  "Prefer partial over gap when there is credible related evidence.",
  "A cited evidence entry must substantively demonstrate the requirement; vague word overlap or an unrelated generic activity is not evidence.",
  "For a requirement that names multiple capabilities, tools, environments, or audiences, use covered only when the evidence supports the full requirement or nearly all of it; use partial when the evidence supports only a subset.",
  "A requirement for a specific tool, platform, credential, or technical practice needs explicit evidence of that item or a clearly equivalent item. Generic documentation, handoffs, communication, organization, or process work is not technical-tool evidence.",
  "Personal projects and coursework can demonstrate technical capability, but do not treat them as professional, client, enterprise, or agency experience.",
  'Examples: HTML/CSS/JavaScript, TypeScript, React, Next.js, or front-end project work can cover general web-page or front-end development requirements; explicit Git, GitHub or GitLab version control, Azure DevOps Repos, repository, branch, commit, or pull-request evidence can cover Git collaboration requirements; support, ticketing, Agile, release coordination, or client-facing IT work can cover communication requirements.',
  "For browser, mobile, accessibility, performance, and SEO requirements, use partial when the resume shows related web development experience but does not explicitly name that practice.",
  'For covered requirements, set severity to null; for partial and gap requirements, set severity to "low", "medium", or "high" based on the importance of the missing evidence.',
  "Cite supporting evidence only by copying its short id into matchedBulletIds; never copy or paraphrase the resume text into that array.",
  "Covered and partial requirements must cite at least one supplied evidence id. Gap requirements must use an empty matchedBulletIds array.",
  "Keep the summary to one or two concise sentences.",
].join(" ");

/**
 * Constrain model citations to the compact evidence IDs supplied for this
 * analysis. The application maps these IDs back to the original bullet text.
 *
 * @param {string[]} evidenceIds
 * @returns {object}
 */
function createPass2AnalysisSchema(evidenceIds) {
  return {
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
            matchedBulletIds: {
              type: "array",
              items: evidenceIds.length > 0
                ? {
                    type: "string",
                    enum: evidenceIds,
                  }
                : {
                    type: "string",
                  },
            },
            severity: {
              type: ["string", "null"],
              enum: [...MATCH_SEVERITIES, null],
            },
          },
          required: ["requirement", "status", "matchedBulletIds", "severity"],
          additionalProperties: false,
        },
      },
      summary: {
        type: "string",
      },
    },
    required: ["matches", "summary"],
    additionalProperties: false,
  };
}

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
 * Keep status and severity internally consistent before validation. The model's
 * severity remains meaningful for partial matches and gaps, while covered
 * requirements never carry a severity. A neutral medium default prevents a
 * missing severity from introducing nondeterminism into reports or future
 * severity-weighted scoring.
 *
 * @param {unknown} value
 */
function normalizePass2Severity(value) {
  if (!value || typeof value !== "object") {
    return;
  }

  const result = /** @type {{ matches?: unknown }} */ (value);

  if (!Array.isArray(result.matches)) {
    return;
  }

  result.matches.forEach((match, index) => {
    if (!match || typeof match !== "object") {
      return;
    }

    const candidate = /** @type {{ status?: unknown, severity?: unknown }} */ (match);

    if (candidate.status === "covered" && candidate.severity !== null) {
      debugLog(`Pass 2 match ${index + 1} severity normalized`, {
        from: candidate.severity,
        to: null,
      });
      candidate.severity = null;
      return;
    }

    if (
      (candidate.status === "partial" || candidate.status === "gap") &&
      (candidate.severity === null || typeof candidate.severity === "undefined")
    ) {
      debugLog(`Pass 2 match ${index + 1} severity normalized`, {
        from: candidate.severity,
        to: "medium",
      });
      candidate.severity = "medium";
    }
  });
}

/**
 * @param {unknown} value
 * @param {string[]} requirements
 * @param {Map<string, string>} resumeEvidenceById
 * @returns {asserts value is Pass2ModelResult}
 */
function assertValidPass2AnalysisResult(value, requirements, resumeEvidenceById) {
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

    const candidate = /** @type {{ requirement?: unknown, status?: unknown, matchedBulletIds?: unknown, severity?: unknown }} */ (match);

    if (
      typeof candidate.status !== "string" ||
      !MATCH_STATUSES.includes(/** @type {MatchStatus} */ (candidate.status))
    ) {
      throw createModelOutputError(`Pass 2 match ${index + 1} had an invalid status.`);
    }

    if (!Array.isArray(candidate.matchedBulletIds)) {
      throw createModelOutputError(`Pass 2 match ${index + 1} did not include matchedBulletIds.`);
    }

    const hasInvalidEvidenceId = candidate.matchedBulletIds.some((evidenceId) => {
      return typeof evidenceId !== "string" || evidenceId.trim().length === 0;
    });

    if (hasInvalidEvidenceId) {
      throw createModelOutputError(`Pass 2 match ${index + 1} included an invalid evidence ID.`);
    }

    const status = /** @type {MatchStatus} */ (candidate.status);
    const hasSupportingEvidence = candidate.matchedBulletIds.length > 0;

    if ((status === "covered" || status === "partial") && !hasSupportingEvidence) {
      throw createModelOutputError(
        `Pass 2 match ${index + 1} was ${status} but did not cite resume evidence.`
      );
    }

    if (status === "gap" && hasSupportingEvidence) {
      throw createModelOutputError(`Pass 2 match ${index + 1} was a gap but cited resume evidence.`);
    }

    const normalizedEvidenceIds = candidate.matchedBulletIds.map((evidenceId) => {
      return /** @type {string} */ (evidenceId).trim();
    });
    const hasDuplicateEvidenceId = new Set(normalizedEvidenceIds).size !== normalizedEvidenceIds.length;

    if (hasDuplicateEvidenceId) {
      throw createModelOutputError(`Pass 2 match ${index + 1} cited duplicate evidence IDs.`);
    }

    const hasUnrecognizedEvidenceId = normalizedEvidenceIds.some((evidenceId) => {
      return !resumeEvidenceById.has(evidenceId);
    });

    if (hasUnrecognizedEvidenceId) {
      throw createModelOutputError(
        `Pass 2 match ${index + 1} cited an evidence ID that was not provided.`
      );
    }

    const validSeverity =
      status === "covered"
        ? candidate.severity === null
        : typeof candidate.severity === "string" &&
          MATCH_SEVERITIES.includes(/** @type {MatchSeverity} */ (candidate.severity));

    if (!validSeverity) {
      throw createModelOutputError(`Pass 2 match ${index + 1} had an invalid severity.`);
    }
  });
}

/**
 * Apply only safe, score-conservative repairs after the model has already
 * failed evidence validation once. Fabricated or unrecognized evidence IDs
 * remain invalid and are never repaired.
 *
 * @param {unknown} value
 * @param {Map<string, string>} resumeEvidenceById
 */
function normalizeRetryablePass2Evidence(value, resumeEvidenceById) {
  if (!value || typeof value !== "object") {
    return;
  }

  const result = /** @type {{ matches?: unknown }} */ (value);

  if (!Array.isArray(result.matches)) {
    return;
  }

  result.matches.forEach((match, index) => {
    if (!match || typeof match !== "object") {
      return;
    }

    const candidate = /** @type {{ status?: unknown, matchedBulletIds?: unknown, severity?: unknown }} */ (
      match
    );

    if (typeof candidate.status !== "string" || !Array.isArray(candidate.matchedBulletIds)) {
      return;
    }

    const allEvidenceIdsRecognized = candidate.matchedBulletIds.every((evidenceId) => {
      return typeof evidenceId === "string" && resumeEvidenceById.has(evidenceId.trim());
    });

    if (!allEvidenceIdsRecognized) {
      return;
    }

    if (
      (candidate.status === "covered" || candidate.status === "partial") &&
      candidate.matchedBulletIds.length === 0
    ) {
      debugLog(`Pass 2 retry match ${index + 1} normalized to gap`, {
        reason: `${candidate.status} without cited evidence`,
      });
      candidate.status = "gap";
      candidate.severity =
        typeof candidate.severity === "string" && MATCH_SEVERITIES.includes(
          /** @type {MatchSeverity} */ (candidate.severity)
        )
          ? candidate.severity
          : "medium";
      return;
    }

    if (candidate.status === "gap" && candidate.matchedBulletIds.length > 0) {
      debugLog(`Pass 2 retry match ${index + 1} removed evidence from gap`, {
        matchedBulletIds: candidate.matchedBulletIds,
      });
      candidate.matchedBulletIds = [];
    }
  });
}

/**
 * @param {string[]} requirements
 * @param {string[]} resumeBullets
 * @returns {Promise<Pass2AnalysisResult>}
 */
async function analyzeRequirementsWithResumeBullets(requirements, resumeBullets) {
  return withModelOutputRetry(async (isRetry) => {
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
    const resumeEvidence = normalizedResumeBullets.map((text, index) => {
      return {
        id: `B${index + 1}`,
        text,
      };
    });
    const resumeEvidenceById = new Map(
      resumeEvidence.map((evidence) => [evidence.id, evidence.text])
    );
    const promptInput = JSON.stringify(
      {
        requirements: normalizedRequirements,
        resumeEvidence,
      },
      null,
      2
    );

    debugLog("Pass 2 input", {
      requirements: normalizedRequirements,
      resumeBullets: normalizedResumeBullets,
      resumeEvidence,
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
        responseConstraint: createPass2AnalysisSchema([...resumeEvidenceById.keys()]),
      });
      const parsedResult = parseModelJson(rawResult, "Pass 2");

      normalizePass2Severity(parsedResult);

      if (isRetry) {
        normalizeRetryablePass2Evidence(parsedResult, resumeEvidenceById);
      }

      assertValidPass2AnalysisResult(
        parsedResult,
        normalizedRequirements,
        resumeEvidenceById
      );

      const analysis = {
        matches: parsedResult.matches.map((match, index) => {
          return {
            requirement: normalizedRequirements[index],
            status: match.status,
            matchedBullets: match.matchedBulletIds.map((evidenceId) => {
              return /** @type {string} */ (resumeEvidenceById.get(evidenceId.trim()));
            }),
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
