// @ts-check

const PASS_1_MAX_REQUIREMENTS = 20;
const PASS_1_JOB_TEXT_CHAR_LIMIT = 6000;
const PASS_2_REQUIREMENT_BATCH_SIZE = 6;
const PASS_2_CONSOLIDATED_AUDIT_MAX_REQUIREMENTS = 6;
const GAPCHECK_DEBUG_STORAGE_KEY = "gapcheckDebug";
const MATCH_STATUSES = Object.freeze(["covered", "partial", "gap"]);
const MATCH_SEVERITIES = Object.freeze(["low", "medium", "high"]);
const REQUIREMENT_SOURCE_TYPES = Object.freeze([
  "required-qualification",
  "preferred-qualification",
  "core-responsibility",
  "work-application-constraint",
]);
const REQUIREMENT_QUALIFIERS = Object.freeze([
  "required",
  "preferred",
  "desirable",
  "plus",
  "not-required",
  null,
]);
const MATCH_STATUS_SCORES = Object.freeze({
  covered: 1,
  partial: 0.5,
  gap: 0,
  unknown: 0,
});
const WORK_CONSTRAINT_PATTERNS = Object.freeze([
  /\b(?:authoriz(?:ed|ation)|eligible|eligibility|right)\s+to\s+work\b|\bsponsor(?:ship)?\b/i,
  /\b(?:remote|hybrid|on[- ]?site|in[- ]office|office\s+days?|work\s+from\s+(?:the\s+)?[^.;]*office|relocat(?:e|ion)|resid(?:e|ency)|located\s+in)\b/i,
  /\b(?:travel|travelling|traveling)\b/i,
  /\b(?:available|availability|core\s+(?:working\s+)?hours?|time\s+zones?|early[- ]morning|evening|overnight|weekends?|shift|workshop\s+schedule)\b/i,
  /\b(?:background\s+check|drug\s+screen|trial\s+period|take[- ]home|interview\s+availability)\b/i,
  /\b(?:submit|provide|include)\b[^.;]{0,100}\b(?:portfolio|work\s+samples?|cover\s+letter|assessment)\b|\bapplication\s+deadline\b/i,
]);

const PASS_1_EXTRACTION_SYSTEM_PROMPT = [
  "Extract the most important concrete job requirements from the provided job posting.",
  "Return eligibilityRequirements and responsibilities as separate arrays of objects with requirement and qualifier fields.",
  "In eligibilityRequirements, include every explicit candidate qualification or work constraint, whether it is required, preferred, helpful, valuable, or not strictly required.",
  "Eligibility includes years and domains of experience, skills, named tools, credentials, seniority or judgment, location, working hours, schedule, travel, and material application constraints such as portfolios, work samples, assessments, or interview commitments.",
  'Set qualifier to "required", "preferred", "desirable", "plus", or "not-required" only when that qualifier is explicit in the source; otherwise use null.',
  "Preserve the explicit qualifier wording in the requirement text as well as the normalized qualifier field.",
  "Preserve material qualifiers such as duration, software-team or product context, alternatives, and preferred status.",
  "Group closely related prose qualifications into one item while retaining every named skill, tool, and qualifier in that item.",
  "When related qualifications appear together in one source sentence or paragraph, keep their combined meaning instead of returning separately scored fragments.",
  "In responsibilities, include only distinct broad work capabilities that are not already represented by an eligibility item.",
  "Eligibility completeness has priority over responsibilities; never replace or omit an eligibility item to include a responsibility.",
  "Do not combine separate labeled source bullets with each other.",
  "The input labels detected list items as SOURCE BULLET J1, J2, and so on.",
  "Return no more than one requirements item for each SOURCE BULLET label.",
  "Treat every labeled source bullet as indivisible: do not split tools, audiences, browsers, deliverables, alternatives, or concepts joined by and/or into separate requirements.",
  "Exclude illustrative tasks, deliverables, and substeps introduced by phrases such as 'typical work includes', 'examples include', 'for example', or similar language.",
  "Never return both a broad requirement and an example, substep, or restatement of it.",
  "Exclude generic personal traits, company context, benefits, marketing copy, and generic application instructions that do not impose a candidate constraint.",
  `Return no more than ${PASS_1_MAX_REQUIREMENTS} total items across both arrays and prefer fewer well-grouped items over fragments or semantic duplicates.`,
  "Write each requirement as a concise standalone string.",
].join(" ");

const PASS_1_REQUIREMENTS_SCHEMA = Object.freeze({
  type: "object",
  properties: {
    eligibilityRequirements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirement: {
            type: "string",
          },
          qualifier: {
            type: ["string", "null"],
            enum: REQUIREMENT_QUALIFIERS,
          },
        },
        required: ["requirement", "qualifier"],
        additionalProperties: false,
      },
      maxItems: PASS_1_MAX_REQUIREMENTS,
    },
    responsibilities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          requirement: {
            type: "string",
          },
          qualifier: {
            type: ["string", "null"],
            enum: REQUIREMENT_QUALIFIERS,
          },
        },
        required: ["requirement", "qualifier"],
        additionalProperties: false,
      },
      maxItems: PASS_1_MAX_REQUIREMENTS,
    },
  },
  required: ["eligibilityRequirements", "responsibilities"],
  additionalProperties: false,
});

const PASS_1_COMPLETENESS_SYSTEM_PROMPT = [
  "Independently audit a job-requirement extraction for completeness.",
  "Compare the entire source job posting with the existing eligibility requirements and responsibilities.",
  "Return a complete corrected extraction with eligibilityRequirements and responsibilities arrays of requirement and qualifier objects, retaining correct existing items and restoring material omissions.",
  "Perform a sentence-by-sentence check for required, preferred, helpful, valuable, optional, or not-strictly-required qualifications.",
  "Check experience duration and domain, named tools and credentials, seniority and judgment, location, schedule, working hours, travel, and other explicit eligibility conditions.",
  "Preserve related qualifications from the same source sentence or paragraph as one requirement, including named alternatives and material qualifiers.",
  'Set qualifier to "required", "preferred", "desirable", "plus", or "not-required" only when explicit in the source; otherwise use null.',
  "Preserve the explicit qualifier wording in the requirement text as well as the normalized qualifier field.",
  "Preserve explicit duration wording from the source instead of rewriting it into shorthand.",
  "Including one condition from a sentence or paragraph does not cover its other named tools, contexts, constraints, or capabilities; retain every material clause.",
  "In responsibilities, retain only distinct broad work capabilities that are not already represented by an eligibility item.",
  "Do not return illustrative examples, generic personality traits, company context, fragments, restatements, or semantic duplicates.",
  "Eligibility completeness takes priority over responsibilities. The application will apply the final combined item cap after this audit.",
  "Write every requirement as a concise standalone string grounded only in the source posting.",
].join(" ");

const PASS_1_ILLUSTRATIVE_MARKER_PATTERN =
  /\b(?:typical work includes|examples? include|for example)\b/i;
const PASS_1_COMPARISON_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "candidate",
  "candidates",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "required",
  "the",
  "their",
  "this",
  "to",
  "with",
]);
const PASS_1_ILLUSTRATIVE_OVERLAP_THRESHOLD = 0.7;
const PASS_1_NON_ILLUSTRATIVE_OVERLAP_THRESHOLD = 0.9;
const PASS_1_ILLUSTRATIVE_MIN_TOKENS = 3;
const PASS_1_EXPLICIT_QUALIFICATION_PATTERN =
  /\b(?:candidates?|applicants?|you|they)\s+(?:must|should|need|will need|are expected|are required)|\b(?:experience|familiarity|knowledge|licen[cs]e|certification|credential)\b[^.!?]{0,240}\b(?:required|preferred|helpful|valuable|needed|not required)\b|\b(?:role|position)(?:\s+that)?\s+(?:requires|needs)\b|\b(?:remote-friendly|availability|working hours|time zones?|travel)\b|\bavailable\s+(?:for|to work)\b|\bat least\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+years?\b|\b\d+\+?\s+years?\b|\bcomfortable\b|\bstrong\b[^.!?]{0,160}\b(?:required|important|needed)\b/i;
const PASS_1_NON_REQUIREMENT_CONTEXT_PATTERN =
  /^(?:the\s+)?(?:ideal|strongest)\s+candidates?\b|\brole\s+(?:helps|supports|turns|exists)\b|\battention to detail\b|\b(?:curious|pragmatic|passionate|self-starter|detail-oriented)\b/i;
const PASS_1_LIST_SECTION_HEADING_PATTERN =
  /^(?:what\s+(?:you(?:'|’)ll|you\s+will)\s+do|what\s+we(?:'|’)?re\s+looking\s+for|responsibilities|qualifications|requirements|preferred(?:,\s+not\s+required)?|nice\s+to\s+have)\s*:?\s*$/i;
const PASS_1_OTHER_SECTION_HEADING_PATTERN =
  /^(?:about(?:\s+the)?\s+(?:team|role|company)|why\s+you(?:'|’)?ll\s+love\s+this\s+role|benefits|compensation|equal\s+opportunity)\s*:?\s*$/i;

/**
 * @typedef {object} Pass1ExtractionResult
 * @property {Pass1ModelRequirement[]} eligibilityRequirements
 * @property {Pass1ModelRequirement[]} responsibilities
 */

/**
 * @typedef {object} Pass1ModelRequirement
 * @property {string} requirement
 * @property {RequirementQualifier} qualifier
 */

/**
 * @typedef {"covered" | "partial" | "gap" | "unknown"} MatchStatus
 */

/**
 * @typedef {"covered" | "partial" | "gap"} ModelMatchStatus
 */

/**
 * @typedef {"required-qualification" | "preferred-qualification" | "core-responsibility" | "work-application-constraint"} RequirementSourceType
 */

/**
 * @typedef {"required" | "preferred" | "desirable" | "plus" | "not-required" | null} RequirementQualifier
 */

/**
 * @typedef {object} ExtractedRequirement
 * @property {string} text
 * @property {RequirementSourceType} sourceType
 * @property {RequirementQualifier} qualifier
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
 * @property {RequirementSourceType} sourceType
 * @property {RequirementQualifier} qualifier
 */

/**
 * @typedef {object} Pass2AnalysisResult
 * @property {MatchResult[]} matches
 * @property {string} summary
 */

/**
 * @typedef {object} Pass2ModelMatch
 * @property {string} requirement
 * @property {ModelMatchStatus} status
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
 *     pass1MaxRequirements: number,
 *     ensureLanguageModelReady: typeof ensureLanguageModelReady,
 *     extractRequirementsFromJobText: typeof extractRequirementsFromJobText,
 *     analyzeRequirementsWithResumeBullets: typeof analyzeRequirementsWithResumeBullets,
 *     analyzeRequirementsWithSavedResume: typeof analyzeRequirementsWithSavedResume,
 *     computeOverallScore: typeof computeOverallScore,
 *     classifyRequirementSourceType: typeof classifyRequirementSourceType,
 *     testHooks: {
 *       isPass2HeadingOnlyEvidence: typeof isPass2HeadingOnlyEvidence,
 *       isPass2EmploymentContextEvidence: typeof isPass2EmploymentContextEvidence,
 *       pass2JobTitleSupportsDurationContext: typeof pass2JobTitleSupportsDurationContext,
 *       getPass2GapRecoveryEvidenceScore: typeof getPass2GapRecoveryEvidenceScore,
 *       coveredPass2EvidenceIsComplete: typeof coveredPass2EvidenceIsComplete,
 *       pass2EvidenceDirectlyCoversRequirement: typeof pass2EvidenceDirectlyCoversRequirement,
 *       normalizePass2EvidenceForTesting: typeof normalizePass2EvidenceForTesting,
 *       assertValidPass1ExtractionResult: typeof assertValidPass1ExtractionResult,
 *       createExtractedRequirement: typeof createExtractedRequirement,
 *       labelExplicitJobBullets: typeof labelExplicitJobBullets,
 *       mergeRelatedPass1RequirementsToLimit: typeof mergeRelatedPass1RequirementsToLimit
 *     },
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
 * Identify constraints that a resume normally cannot establish by omission.
 * These remain visible in the result for future preference-fit analysis but
 * are excluded from the resume qualification score.
 *
 * @param {string} requirement
 * @returns {RequirementSourceType}
 */
function classifyRequirementSourceType(requirement) {
  return WORK_CONSTRAINT_PATTERNS.some((pattern) => pattern.test(requirement))
    ? "work-application-constraint"
    : "required-qualification";
}

/**
 * Source type is derived and retained by application code. The model supplies
 * the extracted text and an explicitly constrained qualifier, but cannot
 * rewrite this metadata during resume comparison.
 *
 * @param {string} requirement
 * @param {"eligibility" | "responsibility"} category
 * @param {RequirementQualifier} qualifier
 * @returns {ExtractedRequirement}
 */
function createExtractedRequirement(requirement, category, qualifier) {
  const text = requirement.trim();
  /** @type {RequirementSourceType} */
  let sourceType;

  if (classifyRequirementSourceType(text) === "work-application-constraint") {
    sourceType = "work-application-constraint";
  } else if (category === "responsibility") {
    sourceType = "core-responsibility";
  } else if (
    qualifier === "preferred" ||
    qualifier === "desirable" ||
    qualifier === "plus" ||
    qualifier === "not-required"
  ) {
    sourceType = "preferred-qualification";
  } else {
    sourceType = "required-qualification";
  }

  return Object.freeze({
    text,
    sourceType,
    qualifier,
  });
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
  const errorMessage =
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof /** @type {{ message?: unknown }} */ (error).message === "string"
      ? /** @type {{ message: string }} */ (error).message
      : "";

  return error instanceof SyntaxError ||
    (error instanceof Error &&
      error.name === "GapcheckModelOutputError") ||
    /\b(?:output|response)\b.*\b(?:limit|truncat)/i.test(errorMessage);
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
 * Make list-item boundaries visible to the model. Wrapped explicit bullets
 * remain attached, and complete sentence-like lines under common requirement
 * headings recover boundaries that page capture sometimes strips away.
 *
 * @param {string} jobText
 * @returns {string}
 */
function labelExplicitJobBullets(jobText) {
  /** @type {string[]} */
  const outputLines = [];
  let bulletIndex = 0;
  let activeBullet = "";
  let isImplicitListSection = false;

  function flushActiveBullet() {
    if (!activeBullet) {
      return;
    }

    bulletIndex += 1;
    outputLines.push(`[SOURCE BULLET J${bulletIndex} - KEEP AS ONE REQUIREMENT] ${activeBullet}`);
    activeBullet = "";
  }

  jobText.split("\n").forEach((rawLine) => {
    const trimmedLine = rawLine.trim();

    if (PASS_1_LIST_SECTION_HEADING_PATTERN.test(trimmedLine)) {
      flushActiveBullet();
      isImplicitListSection = true;
      outputLines.push(rawLine);
      return;
    }

    if (PASS_1_OTHER_SECTION_HEADING_PATTERN.test(trimmedLine)) {
      flushActiveBullet();
      isImplicitListSection = false;
      outputLines.push(rawLine);
      return;
    }

    const bulletMatch = rawLine.match(/^\s*(?:[-*•▪◦–—]|\d+[.)])\s+(.+)$/);

    if (bulletMatch) {
      flushActiveBullet();
      activeBullet = bulletMatch[1].trim();
      return;
    }

    if (activeBullet && trimmedLine && /^\s+/.test(rawLine)) {
      activeBullet = `${activeBullet} ${trimmedLine}`;
      return;
    }

    flushActiveBullet();

    if (
      isImplicitListSection &&
      trimmedLine.length >= 20 &&
      /[.!?]\s*$/.test(trimmedLine)
    ) {
      bulletIndex += 1;
      outputLines.push(
        `[SOURCE BULLET J${bulletIndex} - KEEP AS ONE REQUIREMENT] ${trimmedLine}`
      );
      return;
    }

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
    throw createModelOutputError("Pass 1 response did not include categorized requirement arrays.");
  }

  const result = /** @type {{ eligibilityRequirements?: unknown, responsibilities?: unknown }} */ (
    value
  );

  [
    ["eligibilityRequirements", result.eligibilityRequirements],
    ["responsibilities", result.responsibilities],
  ].forEach(([label, requirements]) => {
    if (!Array.isArray(requirements)) {
      throw createModelOutputError(`Pass 1 response did not include a ${label} array.`);
    }

    if (requirements.length > PASS_1_MAX_REQUIREMENTS) {
      throw createModelOutputError(
        `Pass 1 returned more than ${PASS_1_MAX_REQUIREMENTS} ${label} items.`
      );
    }

    const hasInvalidRequirement = requirements.some((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return true;
      }

      const requirement = /** @type {{ requirement?: unknown, qualifier?: unknown }} */ (
        item
      );
      const keys = Object.keys(item);

      return keys.length !== 2 ||
        !keys.includes("requirement") ||
        !keys.includes("qualifier") ||
        typeof requirement.requirement !== "string" ||
        requirement.requirement.trim().length === 0 ||
        !REQUIREMENT_QUALIFIERS.includes(
          /** @type {RequirementQualifier} */ (requirement.qualifier)
        );
    });

    if (hasInvalidRequirement) {
      throw createModelOutputError(
        `Pass 1 returned an invalid ${label} requirement metadata item.`
      );
    }
  });
}

/**
 * @param {LanguageModelGlobal} languageModel
 * @param {string} promptInput
 * @returns {Promise<Pass1ExtractionResult>}
 */
async function categorizePass1Requirements(
  languageModel,
  promptInput,
  compactOutput = false
) {
  /** @type {LanguageModelSession | null} */
  let session = null;

  try {
    session = await languageModel.create({
      initialPrompts: [
          {
            role: "system",
            content: compactOutput
              ? `${PASS_1_EXTRACTION_SYSTEM_PROMPT} Keep every returned item under 240 characters and use the fewest complete items possible.`
              : PASS_1_EXTRACTION_SYSTEM_PROMPT,
        },
      ],
    });

    const rawResult = await session.prompt(promptInput, {
      responseConstraint: PASS_1_REQUIREMENTS_SCHEMA,
    });
    const parsedResult = parseModelJson(rawResult, "Pass 1 categorization");

    assertValidPass1ExtractionResult(parsedResult);
    return parsedResult;
  } finally {
    if (session) {
      session.destroy();
    }
  }
}

/**
 * A second, independent completeness pass is more general than maintaining
 * occupation-specific recovery rules.
 *
 * @param {LanguageModelGlobal} languageModel
 * @param {string} sourceJobPosting
 * @param {Pass1ExtractionResult} existingExtraction
 * @returns {Promise<Pass1ExtractionResult>}
 */
async function reviewPass1Extraction(
  languageModel,
  sourceJobPosting,
  existingExtraction,
  compactOutput = false
) {
  /** @type {LanguageModelSession | null} */
  let session = null;

  try {
    session = await languageModel.create({
      initialPrompts: [
          {
            role: "system",
            content: compactOutput
              ? `${PASS_1_COMPLETENESS_SYSTEM_PROMPT} Keep every returned item under 240 characters and use the fewest complete items possible.`
              : PASS_1_COMPLETENESS_SYSTEM_PROMPT,
        },
      ],
    });

    const rawResult = await session.prompt(
      JSON.stringify(
        {
          sourceJobPosting,
          existingExtraction,
        },
        null,
        2
      ),
      {
        responseConstraint: PASS_1_REQUIREMENTS_SCHEMA,
      }
    );
    const parsedResult = parseModelJson(rawResult, "Pass 1 completeness audit");

    assertValidPass1ExtractionResult(parsedResult);
    return parsedResult;
  } finally {
    if (session) {
      session.destroy();
    }
  }
}

/**
 * @param {string} jobText
 * @param {"sentence" | "paragraph"} scope
 * @returns {string[]}
 */
function getPass1SourceScopes(jobText, scope) {
  if (scope === "paragraph") {
    return jobText
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  return jobText
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Reduce simple inflections so generated requirement wording can be compared
 * with the source without requiring exact verb tense or pluralization.
 *
 * @param {string} token
 * @returns {string}
 */
function normalizePass1ComparisonToken(token) {
  let normalized = token.toLowerCase();

  if (normalized.includes("-")) {
    return normalized;
  }

  if (normalized.length > 5 && normalized.endsWith("ing")) {
    normalized = normalized.slice(0, -3);
  } else if (normalized.length > 4 && normalized.endsWith("ied")) {
    normalized = `${normalized.slice(0, -3)}y`;
  } else if (normalized.length > 4 && normalized.endsWith("ed")) {
    normalized = normalized.slice(0, -2);
  } else if (normalized.length > 4 && normalized.endsWith("ies")) {
    normalized = `${normalized.slice(0, -3)}y`;
  } else if (normalized.length > 4 && normalized.endsWith("es")) {
    normalized = normalized.slice(0, -2);
  } else if (
    normalized.length > 3 &&
    normalized.endsWith("s") &&
    !normalized.endsWith("ss")
  ) {
    normalized = normalized.slice(0, -1);
  }

  if (normalized.length > 4 && normalized.endsWith("e")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * @param {string} text
 * @returns {Set<string>}
 */
function getPass1ComparisonTokens(text) {
  const tokens = text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [];

  return new Set(
    tokens
      .filter((token) => !PASS_1_COMPARISON_STOP_WORDS.has(token))
      .map(normalizePass1ComparisonToken)
      .filter(Boolean)
  );
}

/**
 * @param {string} requirement
 * @param {string} sourceText
 * @param {number} overlapThreshold
 * @returns {boolean}
 */
function requirementSubstantiallyMatchesPass1Source(requirement, sourceText, overlapThreshold) {
  const requirementTokens = getPass1ComparisonTokens(requirement);

  if (requirementTokens.size < PASS_1_ILLUSTRATIVE_MIN_TOKENS) {
    return false;
  }

  const sourceTokens = getPass1ComparisonTokens(sourceText);
  let matchingTokenCount = 0;

  requirementTokens.forEach((token) => {
    if (sourceTokens.has(token)) {
      matchingTokenCount += 1;
    }
  });

  return matchingTokenCount / requirementTokens.size >= overlapThreshold;
}

/**
 * Remove requirements derived primarily from explicitly illustrative source
 * blocks, unless substantially matching language also appears elsewhere.
 *
 * @param {string[]} requirements
 * @param {string} jobText
 * @returns {string[]}
 */
function removeIllustrativePass1Requirements(requirements, jobText) {
  /** @type {string[]} */
  const illustrativeSourceTexts = [];
  /** @type {string[]} */
  const nonIllustrativeSourceTexts = [];

  getPass1SourceScopes(jobText, "paragraph").forEach((paragraph) => {
    const markerIndex = paragraph.search(PASS_1_ILLUSTRATIVE_MARKER_PATTERN);

    if (markerIndex < 0) {
      nonIllustrativeSourceTexts.push(paragraph);
      return;
    }

    const nonIllustrativePrefix = paragraph.slice(0, markerIndex).trim();
    const illustrativeText = paragraph.slice(markerIndex).trim();

    if (nonIllustrativePrefix) {
      nonIllustrativeSourceTexts.push(nonIllustrativePrefix);
    }

    if (illustrativeText) {
      illustrativeSourceTexts.push(illustrativeText);
    }
  });

  if (illustrativeSourceTexts.length === 0) {
    return requirements;
  }

  return requirements.filter((requirement) => {
    const matchesIllustrativeText = illustrativeSourceTexts.some((sourceText) => {
      return requirementSubstantiallyMatchesPass1Source(
        requirement,
        sourceText,
        PASS_1_ILLUSTRATIVE_OVERLAP_THRESHOLD
      );
    });

    if (!matchesIllustrativeText) {
      return true;
    }

    return nonIllustrativeSourceTexts.some((sourceText) => {
      return requirementSubstantiallyMatchesPass1Source(
        requirement,
        sourceText,
        PASS_1_NON_ILLUSTRATIVE_OVERLAP_THRESHOLD
      );
    });
  });
}

/**
 * Select explicit prose qualifications directly from the source. Paragraphs
 * containing list bullets are left to the bullet-aware model extraction so
 * benefit, task, and requirement lists are not conflated.
 *
 * @param {string} jobText
 * @returns {string[]}
 */
function getExplicitPass1QualificationSources(jobText) {
  const qualificationSentences = jobText
    .split(/\n\s*\n/)
    .filter((paragraph) => {
      return !paragraph.split("\n").some((line) => {
        return /^\s*(?:[-*•▪◦–—]|\d+[.)])\s+/.test(line);
      });
    })
    .flatMap((paragraph) => getPass1SourceScopes(paragraph, "sentence"))
    .filter((sentence) => {
      return PASS_1_EXPLICIT_QUALIFICATION_PATTERN.test(sentence) &&
        !PASS_1_ILLUSTRATIVE_MARKER_PATTERN.test(sentence) &&
        !PASS_1_NON_REQUIREMENT_CONTEXT_PATTERN.test(sentence);
    })
    .map((sentence) => sentence.replace(/[.;]\s*$/, "").trim());

  return deduplicateRequirements(qualificationSentences);
}

/**
 * Prefer complete source sentences over incomplete model paraphrases. This
 * preserves all tools, contexts, durations, alternatives, and work constraints
 * without relying on an occupation-specific recovery dictionary.
 *
 * @param {string[]} requirements
 * @param {string[]} sourceQualifications
 * @returns {string[]}
 */
function replacePass1ParaphrasesWithSourceQualifications(
  requirements,
  sourceQualifications
) {
  const retainedRequirements = requirements.filter((requirement) => {
    if (PASS_1_NON_REQUIREMENT_CONTEXT_PATTERN.test(requirement)) {
      return false;
    }

    return !sourceQualifications.some((sourceQualification) => {
      return requirementSubstantiallyMatchesPass1Source(
        requirement,
        sourceQualification,
        0.55
      );
    });
  });

  return deduplicateRequirements([
    ...sourceQualifications,
    ...retainedRequirements,
  ]);
}

/**
 * Merge fragments that map back to the same explicit or recovered list item.
 * If an over-limit extraction also contains prose fragments, merge only those
 * mapping to the same prose paragraph. Separate source items never merge.
 *
 * @param {string[]} requirements
 * @param {string} jobText
 * @returns {string[]}
 */
function mergeRelatedPass1RequirementsToLimit(requirements, jobText) {
  const sourceParagraphs = (() => {
    /** @type {{ text: string, canMerge: boolean }[]} */
    const scopes = [];
    /** @type {string[]} */
    let proseLines = [];

    function flushProseLines() {
      const text = proseLines.join(" ").replace(/\s+/g, " ").trim();

      if (text) {
        const proseScopes = requirements.length > PASS_1_MAX_REQUIREMENTS
          ? getPass1SourceScopes(text, "sentence")
          : [text];

        proseScopes.forEach((proseScope) => {
          scopes.push({
            text: proseScope,
            canMerge: requirements.length > PASS_1_MAX_REQUIREMENTS,
          });
        });
      }

      proseLines = [];
    }

    labelExplicitJobBullets(jobText).split("\n").forEach((rawLine) => {
      const sourceBullet = rawLine.match(
        /^\[SOURCE BULLET J\d+ - KEEP AS ONE REQUIREMENT\]\s+(.+)$/
      );

      if (sourceBullet) {
        flushProseLines();
        scopes.push({ text: sourceBullet[1].trim(), canMerge: true });
        return;
      }

      if (!rawLine.trim()) {
        flushProseLines();
        return;
      }

      proseLines.push(rawLine.trim());
    });

    flushProseLines();
    return scopes;
  })();
  let mergedRequirements = [...requirements];

  while (true) {
    /** @type {Map<number, number[]>} */
    const requirementIndexesByParagraph = new Map();

    mergedRequirements.forEach((requirement, requirementIndex) => {
      const requirementTokens = getPass1ComparisonTokens(requirement);

      if (requirementTokens.size < PASS_1_ILLUSTRATIVE_MIN_TOKENS) {
        return;
      }

      let bestParagraphIndex = -1;
      let bestOverlap = 0;

      sourceParagraphs.forEach((paragraph, paragraphIndex) => {
        if (!paragraph.canMerge) {
          return;
        }

        const sourceTokens = getPass1ComparisonTokens(paragraph.text);
        const matchingCount = [...requirementTokens].filter((token) => {
          return sourceTokens.has(token);
        }).length;
        const overlap = matchingCount / requirementTokens.size;

        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestParagraphIndex = paragraphIndex;
        }
      });

      if (bestParagraphIndex < 0 || bestOverlap < 0.6) {
        return;
      }

      const indexes = requirementIndexesByParagraph.get(bestParagraphIndex) || [];
      indexes.push(requirementIndex);
      requirementIndexesByParagraph.set(bestParagraphIndex, indexes);
    });

    const mergeCandidate = [...requirementIndexesByParagraph.values()]
      .filter((indexes) => indexes.length > 1)
      .sort((first, second) => second.length - first.length)[0];

    if (!mergeCandidate) {
      break;
    }

    const candidateIndexSet = new Set(mergeCandidate);
    const firstCandidateIndex = mergeCandidate[0];
    const combinedRequirement = mergeCandidate
      .map((requirementIndex) => {
        return mergedRequirements[requirementIndex].replace(/[.;]\s*$/, "");
      })
      .join("; ");

    mergedRequirements = mergedRequirements.flatMap((requirement, requirementIndex) => {
      if (requirementIndex === firstCandidateIndex) {
        return [combinedRequirement];
      }

      return candidateIndexSet.has(requirementIndex) ? [] : [requirement];
    });
  }

  return mergedRequirements;
}

/**
 * @param {string[]} eligibilityRequirements
 * @param {string[]} responsibilities
 * @param {string} jobText
 * @returns {string[]}
 */
function consolidatePass1Requirements(eligibilityRequirements, responsibilities, jobText) {
  const sourceQualifications = getExplicitPass1QualificationSources(jobText);
  let prioritizedEligibility = removeIllustrativePass1Requirements(
    eligibilityRequirements,
    jobText
  );
  let prioritizedResponsibilities = removeIllustrativePass1Requirements(
    responsibilities,
    jobText
  );
  const removedIllustrativeRequirements = [
    ...eligibilityRequirements.filter((requirement) => !prioritizedEligibility.includes(requirement)),
    ...responsibilities.filter((requirement) => !prioritizedResponsibilities.includes(requirement)),
  ];

  if (removedIllustrativeRequirements.length > 0) {
    debugLog("Pass 1 illustrative requirements removed", removedIllustrativeRequirements);
  }

  prioritizedEligibility = replacePass1ParaphrasesWithSourceQualifications(
    prioritizedEligibility,
    sourceQualifications
  );
  prioritizedResponsibilities = replacePass1ParaphrasesWithSourceQualifications(
    prioritizedResponsibilities,
    []
  ).filter((requirement) => {
    return !sourceQualifications.some((sourceQualification) => {
      return requirementSubstantiallyMatchesPass1Source(
        requirement,
        sourceQualification,
        0.55
      );
    });
  });

  const firstSourceLine = jobText
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  const deduplicatedRequirements = deduplicateRequirements([
    ...prioritizedEligibility,
    ...prioritizedResponsibilities,
  ]).filter((requirement) => {
    return !firstSourceLine ||
      requirement.trim().toLowerCase() !== firstSourceLine.toLowerCase();
  });
  const mergedRequirements = mergeRelatedPass1RequirementsToLimit(
    deduplicatedRequirements,
    jobText
  );

  return mergedRequirements.slice(0, PASS_1_MAX_REQUIREMENTS);
}

/**
 * Remove repeated requirement strings before Pass 2 so an exact model
 * duplication cannot receive extra scoring weight.
 *
 * @param {string[]} requirements
 * @returns {string[]}
 */
function deduplicateRequirements(requirements) {
  const seen = new Set();

  return requirements.filter((requirement) => {
    const key = requirement.trim().toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

/**
 * Recover a normalized qualifier only from explicit wording. This also covers
 * source sentences restored deterministically after the model extraction.
 *
 * @param {string} requirement
 * @returns {RequirementQualifier}
 */
function inferExplicitRequirementQualifier(requirement) {
  if (/\b(?:not|required\s+not)\s+(?:strictly\s+)?required\b|\bnot\s+required\b/i.test(requirement)) {
    return "not-required";
  }

  if (/\bdesirable\b/i.test(requirement)) {
    return "desirable";
  }

  if (/\b(?:a\s+)?plus\b/i.test(requirement)) {
    return "plus";
  }

  if (/\bpreferred\b/i.test(requirement)) {
    return "preferred";
  }

  if (/\brequired\b|\bmust\b|\bneed(?:ed)?\b/i.test(requirement)) {
    return "required";
  }

  return null;
}

/**
 * Attach immutable, code-derived source metadata to the final de-duplicated
 * extraction. Model metadata is used only after strict schema validation.
 *
 * @param {string[]} requirements
 * @param {Pass1ModelRequirement[]} eligibilityRequirements
 * @param {Pass1ModelRequirement[]} responsibilities
 * @returns {ExtractedRequirement[]}
 */
function attachPass1RequirementMetadata(
  requirements,
  eligibilityRequirements,
  responsibilities
) {
  const records = [
    ...eligibilityRequirements.map((item) => ({
      ...item,
      category: /** @type {"eligibility"} */ ("eligibility"),
    })),
    ...responsibilities.map((item) => ({
      ...item,
      category: /** @type {"responsibility"} */ ("responsibility"),
    })),
  ];

  return requirements.map((requirement) => {
    const exactRecord = records.find((record) => {
      return record.requirement.trim().toLowerCase() ===
        requirement.trim().toLowerCase();
    });
    const relatedRecords = exactRecord
      ? [exactRecord]
      : records.filter((record) => {
          return requirementSubstantiallyMatchesPass1Source(
            record.requirement,
            requirement,
            0.55
          ) || requirementSubstantiallyMatchesPass1Source(
            requirement,
            record.requirement,
            0.55
          );
        });
    const explicitQualifier = inferExplicitRequirementQualifier(requirement);
    const qualifier = explicitQualifier ||
      relatedRecords.find((record) => record.qualifier !== null)?.qualifier ||
      null;
    const category = relatedRecords.some((record) => {
      return record.category === "eligibility";
    })
      ? "eligibility"
      : relatedRecords.length > 0
        ? "responsibility"
        : "eligibility";

    return createExtractedRequirement(requirement, category, qualifier);
  });
}

/**
 * @param {string} jobText
 * @returns {Promise<ExtractedRequirement[]>}
 */
async function extractRequirementsFromJobText(jobText) {
  return withModelOutputRetry(async (isRetry) => {
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

    const categorizedResult = await categorizePass1Requirements(
      languageModel,
      promptInput,
      isRetry
    );
    const reviewedResult = await reviewPass1Extraction(
      languageModel,
      promptInput,
      categorizedResult,
      isRetry
    );
    const eligibilityRequirements = reviewedResult.eligibilityRequirements.map(
      (item) => item.requirement.trim()
    );
    const responsibilities = reviewedResult.responsibilities.map((item) =>
      item.requirement.trim()
    );
    const requirementTexts = consolidatePass1Requirements(
      eligibilityRequirements,
      responsibilities,
      truncatedJobText
    );
    const requirements = attachPass1RequirementMetadata(
      requirementTexts,
      reviewedResult.eligibilityRequirements,
      reviewedResult.responsibilities
    );
    debugLog("Pass 1 categorized requirements", {
      initialExtraction: categorizedResult,
      eligibilityRequirements,
      responsibilities,
    });
    debugLog("Pass 1 requirements with source metadata", requirements);

    return requirements;
  }, "Pass 1");
}

const PASS_2_ANALYSIS_SYSTEM_PROMPT = [
  "Compare the provided job requirements against the provided resumeEvidence entries.",
  'Each resumeEvidence entry has a short code-owned id, its original resume text, and a kind of "substantive" or "context".',
  'Context evidence contains employment or date information. It may corroborate duration but cannot by itself prove a capability, domain, client environment, tool, or qualification.',
  "Treat technical skills, project descriptions, professional experience, support roles, and education/coursework as valid evidence.",
  "Do not penalize a resume for showing broader or more senior experience than the job requires.",
  "Return one matches item for each provided requirement, in the same order.",
  "Do not repeat requirement text in the response; the application maps each result to the requirement at the same array index.",
  "For each requirement, inspect every resumeEvidence entry before assigning a status; do not stop after finding one weak or superficially related entry.",
  "First identify direct evidence: evidence that explicitly demonstrates the required capability, tool, qualification, or context, or a clearly established equivalent.",
  "Then identify transferable evidence: evidence that demonstrates a meaningful part of the capability in a different work domain or context. Shared generic verbs or topic words alone are not transferable evidence.",
  "Explicit evidence for any meaningful part of a requirement must not be classified as a gap: use covered when direct evidence proves all or nearly all of the requirement, and partial when direct evidence proves only a subset or omits required context.",
  "Evidence that is only transferable must always be partial, never covered. Do not downgrade direct evidence to transferable merely because its wording differs from the requirement.",
  'Use status "covered" only when the selected evidence directly demonstrates the full requirement or nearly all of it in the required context.',
  'Use status "partial" when the resume shows adjacent, transferable, or incomplete evidence that is relevant but does not prove the full capability or required context.',
  'Use status "gap" only after checking all resumeEvidence entries and finding no direct or genuinely transferable evidence for any meaningful part of the requirement.',
  "Do not award partial merely because some evidence is broadly related; it must demonstrate a meaningful portion of the core capability.",
  "Every cited evidence entry must independently substantiate a specific part of the assigned classification. Cite the smallest sufficient set and omit entries that provide only generic word overlap, unrelated-domain activity, a name, contact detail, employer name, job title, or background context.",
  "For covered, the cited entries together must directly prove all or nearly all of the requirement. For partial, each cited entry must demonstrate the direct subset or transferable capability that makes the result partial rather than a gap.",
  "For a requirement that names multiple capabilities, tools, environments, or audiences, use covered only when the evidence supports the full requirement or nearly all of it; use partial when the evidence supports only a subset.",
  "A requirement for a specific tool, platform, credential, or technical practice needs explicit evidence of that item or a clearly equivalent item. Generic documentation, handoffs, communication, organization, or process work is not technical-tool evidence.",
  "Evidence for one named item or one part of a compound requirement covers only that part; it does not prove a different work domain, context, audience, scale, or remaining capability unless the evidence also establishes it.",
  "Experience from a different domain or context may be transferable, but transferable evidence by itself is partial rather than covered.",
  "For a compound requirement with a list of sources, activities, stages, or stakeholder groups, do not infer the missing elements. Use partial when the evidence demonstrates only a few elements or substitutes a different work context.",
  "Personal projects and coursework can demonstrate technical capability, but do not treat them as professional, client, enterprise, or agency experience.",
  "Treat an explicitly named equivalent as evidence only when it genuinely performs the same function in the requirement; superficial category similarity is not equivalence.",
  "Concrete practices may directly demonstrate a broader capability even when the resume does not repeat the requirement's umbrella term.",
  'For covered requirements, set severity to null; for partial and gap requirements, set severity to "low", "medium", or "high" based on the importance of the missing evidence.',
  "Cite supporting evidence only by copying its short id into matchedBulletIds; never copy or paraphrase the resume text into that array.",
  "Covered and partial requirements must cite at least one supplied evidence id. Gap requirements must use an empty matchedBulletIds array.",
  "Before responding, audit every match: confirm no gap overlooks explicit or genuinely transferable evidence, no covered match relies only on transferable evidence, and every cited id genuinely supports the status for that exact requirement.",
].join(" ");

const PASS_2_REVIEW_SYSTEM_PROMPT = [
  "Act as an independent, conservative evidence auditor.",
  "The input contains job requirements, code-owned resume evidence, and a draft comparison. Return one corrected match per requirement in the same order.",
  "Re-evaluate every status and every citation from the source evidence; do not defer to the draft.",
  "A cited entry must genuinely demonstrate a specific part of the exact requirement. Reject shared words, related topics, job titles, employer names, and differently meant word stems when they do not demonstrate the capability.",
  'Evidence marked "context" may corroborate a duration requirement, but never use it alone to prove a capability, work domain, client environment, tool, or qualification.',
  "Use covered only when the citations directly prove all or nearly all named capabilities, tools, environments, audiences, and required contexts.",
  "If a requirement lists several required items, missing items make it partial. Items introduced only as examples or alternatives do not all need evidence.",
  "Personal projects or coursework can demonstrate a skill, but cannot prove professional, client, team-collaboration, or production experience unless the evidence explicitly establishes that context.",
  "Using a tool alone does not prove collaboration through that tool; require explicit evidence of the people, shared workflow, or collaborative activity.",
  "Communicating or coordinating with an external provider does not by itself prove experience working inside that provider's environment or delivering that provider's work.",
  "Concrete practices can directly prove a broader capability without repeating its umbrella label. Judge what the evidence demonstrates, not just shared terminology.",
  "Coordinating substantive work across several named functions or stakeholder groups is direct cross-functional evidence, not merely adjacent evidence.",
  "Experience in another domain is transferable and therefore partial unless the evidence also establishes the required domain or context.",
  "A duration requirement needs both sufficient dated experience and substantive evidence that the dated roles involved the required kind of work.",
  "Calendar time in adjacent work does not satisfy a duration requirement that also names a specific domain, team setting, client context, or type of work.",
  "Use partial only when every cited entry demonstrates a direct subset or a genuinely transferable capability. Otherwise use gap with no citations.",
  "A shared generic verb, communication in an unrelated task, coordination of a different object, or normal workplace activity is not genuinely transferable evidence.",
  "For every non-gap draft match, explicitly check that the cited evidence performs the required activity on the required kind of object or demonstrates a meaningful subset of it.",
  "Before returning a gap, scan every evidence entry for explicit evidence and clear paraphrases; different wording must not hide direct evidence.",
  "Prefer the smallest set of the strongest supporting evidence IDs. Do not replace a strong paraphrase with weaker evidence merely because it repeats words from the requirement.",
  'Set severity to null for covered and to "low", "medium", or "high" for partial or gap.',
  "Do not repeat requirement text or add a prose summary; the application owns both.",
].join(" ");

const PASS_2_EVIDENCE_STOP_WORDS = new Set([
  ...PASS_1_COMPARISON_STOP_WORDS,
  "ability",
  "able",
  "another",
  "basic",
  "but",
  "comfortable",
  "experience",
  "consistent",
  "consistently",
  "follow",
  "followed",
  "following",
  "follows",
  "helpful",
  "include",
  "includes",
  "including",
  "important",
  "has",
  "have",
  "nice",
  "not",
  "preferred",
  "requirement",
  "requirements",
  "responsibilities",
  "role",
  "similar",
  "skills",
  "strong",
  "such",
  "should",
  "team",
  "teams",
  "through",
  "throughout",
  "using",
  "use",
  "valuable",
  "when",
  "work",
  "working",
]);
const PASS_2_AMBIGUOUS_RELATED_TOKENS = new Set([
  "operat",
  "operation",
  "operational",
  "product",
  "production",
]);
const PASS_2_GENERIC_CONCEPT_FAMILIES = Object.freeze([
  /\banaly[sz]\w*|\bdata\b|\bmetric\w*|\breport\w*|\btrend\w*|\bevaluat\w*|\binspect\w*/i,
  /\bbuild\w*|\bcreat\w*|\bdevelop\w*|\bimplement\w*|\bproduc(?:e|es|ed|ing|tion|tive)\w*/i,
  /\bcommunicat\w*|\bexplain\w*|\bpresent\w*|\bwrit\w*|\bdocument\w*/i,
  /\bcollaborat\w*|\bcoordinat\w*|\bstakeholder\w*|\bcross[- ]functional\b|\bbring\w*[^.!?]{0,160}\btogether\b/i,
  /\bdiagnos\w*|\bdebug\w*|\binvestigat\w*|\btroubleshoot\w*/i,
  /\bfix\w*|\brepair\w*|\bcorrect\w*|\bresolv\w*/i,
  /\bfacilitat\w*|\blead\w*|\bchair\w*|\bmoderate\w*/i,
  /\bmaintain\w*|\bupdate\w*|\badminist\w*|\bmanage\w*/i,
  /\boptimi[sz]\w*|\bperformance\b|\befficien\w*|\bimprov\w*/i,
  /\bplan\w*|\bschedul\w*|\bprioriti[sz]\w*|\btrack\w*|\bfollow[- ]?up\b/i,
  /\bprocess\w*|\bprocedure\w*|\bworkflow\w*|\bintake\b|\btriage\b/i,
  /\brisk\w*|\bescalat\w*|\bjudg\w*|\bdecision\w*|\bconflict\w*/i,
  /\btest\w*|\bvalidat\w*|\bverif\w*|\bquality\b|\baccuracy\b/i,
  /\btrain\w*|\bteach\w*|\bmentor\w*|\bcoach\w*|\benable\w*/i,
  /\baccessib\w*|\bkeyboard\s+navigation\b|\balternative\s+text\b|\balt\s+text\b|\bheading\s+structure\b|\bcolor\s+contrast\b|\bform\s+labels?\b/i,
  /\bsoftware\b|\bplatform\b|\bapplications?\b|\bdigital\s+products?\b|\btechnology\b/i,
]);
const PASS_2_GAP_RECOVERY_CONCEPT_FAMILIES = Object.freeze([
  /\bdiagnos\w*|\bdebug\w*|\binvestigat\w*|\btroubleshoot\w*/i,
  /\bmonitor\w*|\bmetrics?\b|\blogs?\b|\bproduction\s+(?:issue|support)\w*/i,
  /\bfix\w*|\brepair\w*|\bcorrect\w*|\bremediat\w*|\bresolv\w*/i,
  /\boptimi[sz]\w*|\bperformance\b|\befficien\w*/i,
  /\baccessib\w*|\bkeyboard\s+navigation\b|\balternative\s+text\b|\balt\s+text\b|\bheading\s+structure\b|\bcolor\s+contrast\b|\bform\s+labels?\b/i,
  /\bcollaborat\w*|\bpair(?:ing|ed)?\b|\bteammates?\b|\bpeer\s+review\b|\breview\s+comments?\b|\bpull\s+requests?\b/i,
  /\bfeedback\b|\breview\s+comments?\b|\baddress\w*[^.!?]{0,80}\bcomments?\b|\bincorporat\w*[^.!?]{0,80}\bfeedback\b/i,
  /\bclients?\b|\bbusiness\s+stakeholders?\b|\bsubject[- ]matter\s+experts?\b|\binternal\s+(?:staff|teams?|partners?)\b/i,
  /\bversion\s+control\b|\bgit(?:hub|lab)?\b|\bpull\s+requests?\b/i,
  /\bCI\s*\/\s*CD\b|\bcontinuous\s+(?:integration|delivery|deployment)\b|\bAzure\s+(?:DevOps|Pipelines?)\b|\bGitHub\s+Actions\b|\bGitLab\s+CI\b|\bJenkins\b|\bdeployment\s+pipelines?\b/i,
  /\bcontaineri[sz]\w*|\bcontainers?\b|\bDocker\b|\bPodman\b|\bKubernetes\b/i,
  /\bdeploy\w*|\brelease\w*|\bship\w*|\bhost\w*/i,
]);
const PASS_2_GENERIC_NAMED_WORD_EXCLUSIONS = new Set([
  "AI",
  "Ability",
  "Available",
  "Basic",
  "Comfortable",
  "Experience",
  "Nice",
  "Responsibilities",
  "Software",
  "Strong",
  "Summary",
  "Technical",
  "The",
  "Use",
  "Work",
]);

/**
 * @param {string} text
 * @returns {Set<string>}
 */
function getPass2EvidenceTokens(text) {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) || [];

  return new Set(
    tokens
      .filter((token) => !PASS_2_EVIDENCE_STOP_WORDS.has(token))
      .map(normalizePass1ComparisonToken)
      .filter(Boolean)
  );
}

/**
 * @param {string} first
 * @param {string} second
 * @returns {boolean}
 */
function pass2TokensAreRelated(first, second) {
  if (first === second) {
    return true;
  }

  if (
    PASS_2_AMBIGUOUS_RELATED_TOKENS.has(first) ||
    PASS_2_AMBIGUOUS_RELATED_TOKENS.has(second)
  ) {
    return false;
  }

  if (
    Math.min(first.length, second.length) >= 5 &&
    (first.startsWith(second) || second.startsWith(first))
  ) {
    return true;
  }

  let commonPrefixLength = 0;
  const shorterLength = Math.min(first.length, second.length);

  while (
    commonPrefixLength < shorterLength &&
    first[commonPrefixLength] === second[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  return commonPrefixLength >= 7;
}

/**
 * Find likely proper names, acronyms, model numbers, credentials, and named
 * tools directly from the requirement rather than maintaining an occupation-
 * specific dictionary.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
function getPass2NamedTokens(text) {
  const rawTokens = text.match(/[A-Za-z][A-Za-z0-9.+#/-]*/g) || [];

  return new Set(
    rawTokens
      .filter((token, index) => {
        if (PASS_2_GENERIC_NAMED_WORD_EXCLUSIONS.has(token)) {
          return false;
        }

        const hasUppercase = /[A-Z]/.test(token);
        const hasLowercase = /[a-z]/.test(token);
        const hasNumber = /\d/.test(token);
        const isAcronym = token.length >= 2 && hasUppercase && !hasLowercase;
        const hasInternalCapital = /^[A-Z]?[a-z]+[A-Z]/.test(token);
        const isCapitalizedName = index > 0 && /^[A-Z][a-z]{2,}$/.test(token);

        return hasNumber || isAcronym || hasInternalCapital || isCapitalizedName;
      })
      .map((token) => token.toLowerCase())
  );
}

/**
 * @param {string} requirement
 * @param {string} evidenceText
 * @returns {boolean}
 */
function sharesPass2NamedConcept(requirement, evidenceText) {
  const requirementNames = getPass2NamedTokens(requirement);
  const evidenceNames = getPass2NamedTokens(evidenceText);

  return [...requirementNames].some((requirementName) => {
    return [...evidenceNames].some((evidenceName) => {
      return requirementName === evidenceName ||
        (Math.min(requirementName.length, evidenceName.length) >= 3 &&
          (requirementName.startsWith(evidenceName) ||
            evidenceName.startsWith(requirementName)));
    });
  });
}

const PASS_2_DATE_RANGE_SOURCE =
  String.raw`\b(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+)?(20\d{2})\s*(?:[-–—]|\bto\b)\s*(?:(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+)?(20\d{2}|present)\b`;

/**
 * @param {string} text
 * @returns {boolean}
 */
function hasPass2DateRange(text) {
  return new RegExp(PASS_2_DATE_RANGE_SOURCE, "i").test(text);
}

/**
 * @param {string} text
 * @returns {string}
 */
function stripPass2DateRanges(text) {
  return text.replace(new RegExp(PASS_2_DATE_RANGE_SOURCE, "gi"), " ");
}

/**
 * @param {string} text
 * @returns {{ start: number, end: number }[]}
 */
function getPass2DateIntervals(text) {
  return [...text.matchAll(new RegExp(PASS_2_DATE_RANGE_SOURCE, "gi"))]
    .map((dateRange) => {
      const start = Number(dateRange[1]);
      const end = dateRange[2].toLowerCase() === "present"
        ? new Date().getFullYear()
        : Number(dateRange[2]);

      return { start, end };
    })
    .filter((interval) => {
      return Number.isFinite(interval.start) &&
        Number.isFinite(interval.end) &&
        interval.end >= interval.start;
    });
}

/**
 * Job-title and section-heading fragments provide context but cannot support a
 * classification by themselves.
 *
 * @param {string} evidenceText
 * @returns {boolean}
 */
function isPass2HeadingOnlyEvidence(evidenceText) {
  if (/^(?:technical\s+)?skills?\s*:/i.test(evidenceText.trim())) {
    return false;
  }

  if (
    /@|https?:\/\/|www\.|github\.com|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/i.test(
      evidenceText
    ) &&
    !/\b(?:built|created|delivered|deployed|developed|diagnosed|implemented|maintained|resolved|shipped|supported|used|wrote)\b/i.test(
      evidenceText
    )
  ) {
    return true;
  }

  const letters = evidenceText.replace(/[^A-Za-z]/g, "");
  const wordCount = (evidenceText.match(/[A-Za-z]+/g) || []).length;
  const uppercaseWordCount =
    (evidenceText.match(/\b[A-Z][A-Z-]{1,}\b/g) || []).length;
  const hasSentenceEnding = /[.!?]\s*$/.test(evidenceText);
  const hasShortLocationHeader =
    wordCount <= 8 &&
    /,\s*[A-Z]{2}\b/.test(evidenceText) &&
    !hasSentenceEnding;
  const hasDateRange = hasPass2DateRange(evidenceText);
  const startsWithActionVerb =
    /^(?:achieved|administered|analyzed|assessed|built|collaborated|communicated|coordinated|created|delivered|designed|developed|diagnosed|documented|facilitated|implemented|improved|investigated|led|maintained|managed|operated|optimized|planned|prepared|produced|resolved|supported|tested|trained|updated|used|validated|wrote)\b/i.test(
      evidenceText.trim()
    );

  if (hasDateRange) {
    return false;
  }

  const titleCaseWords = evidenceText.match(/\b[A-Za-z][A-Za-z.+#/-]*\b/g) || [];
  const isShortTitleCaseLine =
    wordCount <= 8 &&
    titleCaseWords.length > 0 &&
    titleCaseWords.every((word) => {
      return /^[A-Z][A-Za-z.+#/-]*$/.test(word) || /^[A-Z]{2,}$/.test(word);
    }) &&
    !/^technical\s+skills?\b|^skills?\b/i.test(evidenceText.trim());

  return letters.length > 0 &&
    ((wordCount <= 6 && letters === letters.toUpperCase()) ||
      (isShortTitleCaseLine && !startsWithActionVerb && !hasSentenceEnding) ||
      (wordCount <= 10 &&
        uppercaseWordCount >= 3 &&
        !startsWithActionVerb &&
        !hasSentenceEnding) ||
      (hasShortLocationHeader && !startsWithActionVerb));
}

/**
 * Employer/date lines provide tenure context but do not describe performed
 * work. Longer dated sentences with action language remain substantive.
 *
 * @param {string} evidenceText
 * @returns {boolean}
 */
function isPass2EmploymentContextEvidence(evidenceText) {
  const hasDateRange = hasPass2DateRange(evidenceText);

  if (!hasDateRange) {
    return false;
  }

  const withoutDateRanges = stripPass2DateRanges(evidenceText);
  const remainingWordCount =
    (withoutDateRanges.match(/[A-Za-z][A-Za-z0-9.+#/-]*/g) || []).length;
  const hasActionLanguage =
    /\b(?:achieved|administered|analyzed|assessed|built|collaborated|communicated|coordinated|created|delivered|designed|developed|diagnosed|documented|facilitated|implemented|improved|investigated|led|maintained|managed|operated|optimized|planned|prepared|produced|resolved|supported|tested|trained|updated|used|validated|wrote)\b/i.test(
      withoutDateRanges
    );

  return remainingWordCount <= 12 && !hasActionLanguage;
}

/**
 * A short heading immediately followed by an employer/date line is job-title
 * context. It is retained only in batches that contain a duration requirement.
 *
 * @param {string[]} resumeBullets
 * @param {number} index
 * @returns {boolean}
 */
function isPass2JobTitleContext(resumeBullets, index) {
  return isPass2HeadingOnlyEvidence(resumeBullets[index]) &&
    index + 1 < resumeBullets.length &&
    isPass2EmploymentContextEvidence(resumeBullets[index + 1]);
}

/**
 * Compare a retained job title with a duration requirement without treating
 * the title as standalone capability evidence.
 *
 * @param {string} requirement
 * @param {string} contextText
 * @returns {boolean}
 */
function pass2JobTitleSupportsDurationContext(requirement, contextText) {
  if (!isPass2HeadingOnlyEvidence(contextText)) {
    return false;
  }

  const requirementTokens = getPass2EvidenceTokens(requirement);
  const contextTokens = getPass2EvidenceTokens(contextText);
  const sharedTokenCount = [...requirementTokens].filter((requirementToken) => {
    return [...contextTokens].some((contextToken) => {
      return pass2TokensAreRelated(requirementToken, contextToken);
    });
  }).length;

  return sharedTokenCount >= 2;
}

/**
 * @param {string} requirement
 * @param {string} evidenceText
 * @returns {boolean}
 */
function pass2EvidenceMeaningfullyOverlaps(requirement, evidenceText) {
  if (isPass2HeadingOnlyEvidence(evidenceText)) {
    return false;
  }

  const isDatedContextLine = hasPass2DateRange(evidenceText);

  if (isDatedContextLine) {
    return false;
  }

  const requirementTokens = getPass2EvidenceTokens(requirement);
  const evidenceTokens = getPass2EvidenceTokens(evidenceText);
  const sharedRequirementTokens = [...requirementTokens].filter((requirementToken) => {
    return [...evidenceTokens].some((evidenceToken) => {
      return pass2TokensAreRelated(requirementToken, evidenceToken);
    });
  });

  if (sharedRequirementTokens.length >= 2) {
    return true;
  }

  if (sharesPass2NamedConcept(requirement, evidenceText)) {
    return true;
  }

  const sharesGenericConceptFamily = PASS_2_GENERIC_CONCEPT_FAMILIES.some((family) => {
    return family.test(requirement) && family.test(evidenceText);
  });

  return sharesGenericConceptFamily && requirementTokens.size <= 6;
}

/**
 * Break compound requirements into independently supportable clauses without
 * maintaining occupation-specific vocabulary. The prefix before an "across"
 * audience list is retained so transferable activity can remain partial even
 * when none of the required audiences match.
 *
 * @param {string} requirement
 * @returns {string[]}
 */
function getPass2RequirementClauses(requirement) {
  const shouldSplitConjunctions = getPass2EvidenceTokens(requirement).size <= 8;
  const clauses = requirement
    .split(shouldSplitConjunctions ? /;|\band\b/i : /;/)
    .map((clause) => clause.replace(/^[\s,]+|[\s,.]+$/g, "").trim())
    .filter(Boolean);
  const acrossMatch = requirement.match(/\b(.+?)\s+across\s+(.+?)(?:[.;]|$)/i);

  if (acrossMatch) {
    clauses.push(acrossMatch[1].trim());
    clauses.push(
      ...acrossMatch[2]
        .split(/,|\band\b/i)
        .map((clause) => clause.trim())
        .filter(Boolean)
    );
  }

  return [...new Set(clauses)];
}

/**
 * @param {string} requirement
 * @param {string} evidenceText
 * @returns {boolean}
 */
function pass2EvidenceSupportsAnyRequirementClause(requirement, evidenceText) {
  const acrossMatch = requirement.match(/\b(.+?)\s+across\s+.+/i);

  if (acrossMatch) {
    return pass2EvidenceMeaningfullyOverlaps(
      acrossMatch[1],
      evidenceText
    );
  }

  return pass2EvidenceMeaningfullyOverlaps(requirement, evidenceText) ||
    getPass2RequirementClauses(requirement).some((clause) => {
      return pass2EvidenceMeaningfullyOverlaps(clause, evidenceText);
    });
}

/**
 * Gap recovery uses a higher bar than partial validation so broad verbs such
 * as maintain, work, or communicate cannot create evidence by themselves.
 *
 * @param {string} requirement
 * @param {string} evidenceText
 * @returns {boolean}
 */
function pass2EvidenceStronglySupportsAnyRequirementClause(
  requirement,
  evidenceText
) {
  return getPass2GapRecoveryEvidenceScore(requirement, evidenceText) > 0;
}

/**
 * @param {string} requirement
 * @param {string} evidenceText
 * @returns {number}
 */
function getPass2GapRecoveryEvidenceScore(requirement, evidenceText) {
  return [requirement, ...getPass2RequirementClauses(requirement)].reduce(
    (bestScore, clause) => {
      const requirementTokens = getPass2EvidenceTokens(clause);
      const evidenceTokens = getPass2EvidenceTokens(evidenceText);
      const sharedTokenCount = [...requirementTokens].filter(
        (requirementToken) => {
          return [...evidenceTokens].some((evidenceToken) => {
            return pass2TokensAreRelated(requirementToken, evidenceToken);
          });
        }
      ).length;
      const sharesSpecializedConcept =
        PASS_2_GAP_RECOVERY_CONCEPT_FAMILIES.some((family) => {
          return family.test(clause) && family.test(evidenceText);
        });
      const sharesNamedConcept = sharesPass2NamedConcept(clause, evidenceText);
      const explicitlyRequestsNamedExperience =
        /\b(?:experience|familiarity|knowledge|understanding)\s+(?:of|with)\b|\bcomfortable\b|\bworks?\s+primarily\s+in\b/i.test(
          clause
        );
      const score = sharedTokenCount >= 2
        ? sharedTokenCount
        : sharesNamedConcept &&
            (requirementTokens.size <= 4 ||
              explicitlyRequestsNamedExperience)
          ? 2
          : sharesSpecializedConcept
            ? 3
            : 0;

      return Math.max(bestScore, score);
    },
    0
  );
}

/**
 * Promote only strong, action-based evidence that covers most concrete
 * requirement tokens. This repairs clear model omissions without turning a
 * skills heading or a single shared noun into covered experience.
 *
 * @param {string} requirement
 * @param {string[]} evidenceTexts
 * @returns {boolean}
 */
function pass2EvidenceDirectlyCoversRequirement(requirement, evidenceTexts) {
  const actionEvidence = evidenceTexts.filter((evidenceText) => {
    return /^(?:achieved|added|administered|analyzed|assessed|built|collaborated|communicated|completed|coordinated|created|delivered|designed|developed|diagnosed|documented|facilitated|implemented|improved|investigated|led|maintained|managed|modeled|operated|optimized|paired|planned|prepared|produced|resolved|reviewed|shipped|supported|tested|traced|trained|updated|used|validated|worked|wrote)\b/i.test(
      evidenceText.trim()
    );
  });

  if (actionEvidence.length === 0) {
    return false;
  }

  const requirementTokens = getPass2EvidenceTokens(requirement);
  const evidenceTokens = getPass2EvidenceTokens(actionEvidence.join("\n"));
  const sharedTokenCount = [...requirementTokens].filter((requirementToken) => {
    return [...evidenceTokens].some((evidenceToken) => {
      return pass2TokensAreRelated(requirementToken, evidenceToken);
    });
  }).length;
  const requiredSharedTokens = Math.max(
    2,
    Math.ceil(requirementTokens.size * 0.5)
  );

  return sharedTokenCount >= requiredSharedTokens &&
    coveredPass2EvidenceIsComplete(requirement, actionEvidence);
}

/**
 * @param {string} requirement
 * @returns {number | null}
 */
function getPass2RequiredYears(requirement) {
  const numericMatch = requirement.match(/\b(\d+)\+?\s+years?\b/i);

  if (numericMatch) {
    return Number(numericMatch[1]);
  }

  const wordNumbers = new Map([
    ["one", 1],
    ["two", 2],
    ["three", 3],
    ["four", 4],
    ["five", 5],
    ["six", 6],
    ["seven", 7],
    ["eight", 8],
    ["nine", 9],
    ["ten", 10],
  ]);
  const wordMatch = requirement.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten)\+?\s+years?\b/i
  );

  return wordMatch ? /** @type {number} */ (wordNumbers.get(wordMatch[1].toLowerCase())) : null;
}

/**
 * @param {string} requirement
 * @param {string[]} evidenceTexts
 * @returns {boolean}
 */
function coveredPass2EvidenceIsComplete(requirement, evidenceTexts) {
  const combinedEvidence = evidenceTexts.join("\n");
  const requiredYears = getPass2RequiredYears(requirement);

  if (requiredYears !== null) {
    const intervals = getPass2DateIntervals(combinedEvidence)
      .sort((first, second) => first.start - second.start);
    /** @type {{ start: number, end: number }[]} */
    const mergedIntervals = [];

    intervals.forEach((interval) => {
      const previous = mergedIntervals[mergedIntervals.length - 1];

      if (!previous || interval.start > previous.end) {
        mergedIntervals.push({ ...interval });
        return;
      }

      previous.end = Math.max(previous.end, interval.end);
    });

    const supportedYears = mergedIntervals.reduce((total, interval) => {
      return total + (interval.end - interval.start);
    }, 0);

    if (supportedYears < requiredYears) {
      return false;
    }

    const hasSubstantiveRoleEvidence = evidenceTexts.some((evidenceText) => {
      const withoutDateRanges = stripPass2DateRanges(evidenceText);
      const remainingWordCount =
        (withoutDateRanges.match(/[A-Za-z][A-Za-z0-9.+#/-]*/g) || []).length;

      return remainingWordCount >= 7 && !isPass2HeadingOnlyEvidence(withoutDateRanges);
    });

    if (!hasSubstantiveRoleEvidence) {
      return false;
    }

    const supportingContextMatch = requirement.match(
      /\bsupporting\s+([^.;]+)/i
    );

    if (supportingContextMatch) {
      const substantiveEvidence = evidenceTexts.filter((evidenceText) => {
        return !isPass2EmploymentContextEvidence(evidenceText);
      });
      const supportsRequiredContext = substantiveEvidence.some((evidenceText) => {
        return pass2EvidenceMeaningfullyOverlaps(
          supportingContextMatch[1],
          evidenceText
        );
      });

      if (!supportsRequiredContext) {
        return false;
      }
    }
  }

  const requiresExplicitCollaboration =
    /\bcollaborat\w*|^\s*partner\s+with\b|\bpair(?:ing|ed)?\s+with\b/i.test(
      requirement
    );
  const demonstratesCollaboration =
    /\bcollaborat\w*|\bcoordinat\w*|\bbring\w*[^.!?]{0,160}\btogether\b|\bpartner\w+\s+with\b|\bwork\w*\s+(?:closely\s+)?with\b|\balongside\b|\bjoint\w*|\bshared\s+workflow\b|\bpair(?:ing|ed)?\s+with\b|\b(?:opened?|submitted?)\s+(?:Git\s+)?pull requests?\b.*\b(?:review|feedback|comments?)\b|\breviewed?\b.*\b(?:changes?|pull requests?|code)\b/i.test(
      combinedEvidence
    );

  if (requiresExplicitCollaboration && !demonstratesCollaboration) {
    return false;
  }

  if (
    /\bpair(?:ing|ed)?\s+with\b/i.test(requirement) &&
    !/\bpair(?:ing|ed)?\s+with\b/i.test(combinedEvidence)
  ) {
    return false;
  }

  const requiredTestLevels = [
    { required: /\bunit\b/i.test(requirement), evidence: /\bunit\b/i.test(combinedEvidence) },
    { required: /\bintegration\b/i.test(requirement), evidence: /\bintegration\b/i.test(combinedEvidence) },
    {
      required: /\bend[- ]to[- ]end\b|\bE2E\b/i.test(requirement),
      evidence: /\bend[- ]to[- ]end\b|\bE2E\b|\bPlaywright\b|\bCypress\b/i.test(combinedEvidence),
    },
  ];

  if (requiredTestLevels.some((level) => level.required && !level.evidence)) {
    return false;
  }

  const requiresEmbeddedExperience =
    /\bexperience\b.*\b(?:working|operating|practicing|serving)\b/i.test(
      requirement
    );
  const citesOnlyExternalCoordination = evidenceTexts.length > 0 &&
    evidenceTexts.every((evidenceText) => {
      return /\b(?:coordinat|communicat|liais|request)\w*.*\b(?:outside|external|third[- ]party)\b/i.test(
        evidenceText
      );
    });

  if (requiresEmbeddedExperience && citesOnlyExternalCoordination) {
    return false;
  }

  const requiresDiagnosis =
    /\b(?:diagnos|debug|investigat|troubleshoot)\w*/i.test(requirement);
  const requiresRepair =
    /\b(?:fix|repair|correct|remediat|resolv)\w*/i.test(requirement);
  const demonstratesDiagnosis =
    /\b(?:diagnos|debug|investigat|troubleshoot)\w*/i.test(combinedEvidence);
  const demonstratesRepair =
    /\b(?:fix(?:ed|es|ing)?|repair(?:ed|ing)|correct(?:ed|ing)|remediat(?:e|ed|ing)|resolv(?:e|ed|ing))\b/i.test(
      combinedEvidence
    );

  if (
    requiresDiagnosis &&
    requiresRepair &&
    (!demonstratesDiagnosis || !demonstratesRepair)
  ) {
    return false;
  }

  const acrossMatch = requirement.match(/\bacross\s+(.+?)(?:[.;]|$)/i);

  if (acrossMatch) {
    const requiredGroups = acrossMatch[1]
      .split(/,|\band\b/i)
      .map((group) => group.trim())
      .filter(Boolean);
    const supportsEveryGroup = requiredGroups.length < 2 ||
      requiredGroups.every((group) => {
        return pass2EvidenceMeaningfullyOverlaps(group, combinedEvidence);
      });

    if (!supportsEveryGroup) {
      return false;
    }
  }

  const requiredForListMatch = requirement.match(
    /\bfor\s+([^.;]+,\s*[^.;]+,\s*(?:and\s+)?[^.;]+)/i
  );

  if (
    requiredForListMatch &&
    !/\b(?:such as|for example|e\.g\.|including)\b/i.test(requirement)
  ) {
    const requiredActivities = requiredForListMatch[1]
      .split(/,|\band\b/i)
      .map((activity) => activity.trim())
      .filter(Boolean);
    const supportsEveryActivity = requiredActivities.length < 3 ||
      requiredActivities.every((activity) => {
        return pass2EvidenceMeaningfullyOverlaps(activity, combinedEvidence);
      });

    if (!supportsEveryActivity) {
      return false;
    }
  }

  const compoundClauses = requirement
    .split(";")
    .map((clause) => clause.trim())
    .filter(Boolean);

  if (compoundClauses.length > 1) {
    return compoundClauses.every((clause) => {
      return evidenceTexts.some((evidenceText) => {
        return pass2EvidenceMeaningfullyOverlaps(clause, evidenceText);
      });
    });
  }

  const requiredNamedItems = getPass2NamedTokens(requirement);
  const citedNamedItems = new Set(
    (combinedEvidence.match(/[A-Za-z][A-Za-z0-9.+#/-]*/g) || []).map((token) => {
      return token.toLowerCase();
    })
  );
  const isExampleList = /\b(?:such as|for example|e\.g\.|one of)\b/i.test(
    requirement
  );
  const allowsUnnamedAlternative = /\b(?:or another|or equivalent)\b/i.test(
    requirement
  );
  /** @param {string} requiredName */
  const hasNamedItem = (requiredName) => {
    return [...citedNamedItems].some((citedName) => {
      return requiredName === citedName ||
        (Math.min(requiredName.length, citedName.length) >= 3 &&
          (requiredName.startsWith(citedName) || citedName.startsWith(requiredName)));
    });
  };

  if (
    requiredNamedItems.size > 0 &&
    !isExampleList &&
    !allowsUnnamedAlternative
  ) {
    const requiresAllNamedItems = !/\bor\b/i.test(requirement);
    const hasEveryNamedItem = [...requiredNamedItems].every((requiredName) => {
      return hasNamedItem(requiredName);
    });
    const hasAnyNamedItem = [...requiredNamedItems].some((requiredName) => {
      return hasNamedItem(requiredName);
    });

    if (
      (requiresAllNamedItems && !hasEveryNamedItem) ||
      (!requiresAllNamedItems && !hasAnyNamedItem)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Constrain model citations to the compact evidence IDs supplied for this
 * analysis. The application maps these IDs back to the original bullet text.
 *
 * @param {string[]} evidenceIds
 * @param {number} requirementCount
 * @returns {object}
 */
function createPass2AnalysisSchema(evidenceIds, requirementCount) {
  return {
    type: "object",
    properties: {
      matches: {
        type: "array",
        maxItems: requirementCount,
        items: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: MATCH_STATUSES,
            },
            matchedBulletIds: {
              type: "array",
              maxItems: evidenceIds.length > 0 ? 5 : 0,
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
          required: ["status", "matchedBulletIds", "severity"],
          additionalProperties: false,
        },
      },
    },
    required: ["matches"],
    additionalProperties: false,
  };
}

/**
 * Requirement text and summaries are application-owned. Hydrating them after
 * constrained generation keeps model output small and prevents altered or
 * truncated requirement copies from invalidating an otherwise usable result.
 *
 * @param {unknown} value
 * @param {string[]} requirements
 */
function hydratePass2ModelResult(value, requirements) {
  if (!value || typeof value !== "object") {
    return;
  }

  const result = /** @type {{ matches?: unknown, summary?: unknown }} */ (value);

  if (Array.isArray(result.matches)) {
    result.matches.forEach((match, index) => {
      if (match && typeof match === "object" && index < requirements.length) {
        /** @type {{ requirement?: unknown }} */ (match).requirement =
          requirements[index];
      }
    });
  }

  result.summary = "Code-owned Pass 2 comparison.";
}

/**
 * Ask a separate model session to audit the draft semantically. This avoids
 * relying on an occupation-specific synonym list for paraphrases, context, and
 * compound requirements while retaining code-owned evidence IDs.
 *
 * @param {LanguageModelGlobal} languageModel
 * @param {string[]} requirements
 * @param {{ id: string, text: string, kind: "substantive" | "context" }[]} resumeEvidence
 * @param {Pass2ModelResult} draftResult
 * @param {string[]} evidenceIds
 * @returns {Promise<Pass2ModelResult>}
 */
async function reviewPass2Analysis(
  languageModel,
  requirements,
  resumeEvidence,
  draftResult,
  evidenceIds
) {
  /** @type {LanguageModelSession | null} */
  let session = null;

  try {
    session = await languageModel.create({
      initialPrompts: [
        {
          role: "system",
          content: PASS_2_REVIEW_SYSTEM_PROMPT,
        },
      ],
    });

    const rawResult = await session.prompt(
      JSON.stringify(
        {
          requirements,
          resumeEvidence,
          draftComparison: draftResult,
        },
        null,
        2
      ),
      {
        responseConstraint: createPass2AnalysisSchema(
          evidenceIds,
          requirements.length
        ),
      }
    );
    const parsedResult = parseModelJson(rawResult, "Pass 2 evidence audit");
    hydratePass2ModelResult(parsedResult, requirements);

    return /** @type {Pass2ModelResult} */ (parsedResult);
  } finally {
    if (session) {
      session.destroy();
    }
  }
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
 * Accept structured Pass 1 output while retaining plain-string compatibility
 * for pinned benchmark fixtures and callers from earlier versions.
 *
 * @param {unknown} value
 * @param {string} label
 * @param {number} [maxItems]
 * @returns {ExtractedRequirement[]}
 */
function validateExtractedRequirements(value, label, maxItems) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  if (typeof maxItems === "number" && value.length > maxItems) {
    throw new Error(`${label} must contain at most ${maxItems} items.`);
  }

  return value.map((item, index) => {
    if (typeof item === "string" && item.trim()) {
      const qualifier = inferExplicitRequirementQualifier(item);
      return createExtractedRequirement(item, "eligibility", qualifier);
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${label} item ${index + 1} must be a requirement object.`);
    }

    const candidate = /** @type {{ text?: unknown, sourceType?: unknown, qualifier?: unknown }} */ (
      item
    );
    const keys = Object.keys(item);
    const validShape = keys.length === 3 &&
      keys.includes("text") &&
      keys.includes("sourceType") &&
      keys.includes("qualifier");

    if (
      !validShape ||
      typeof candidate.text !== "string" ||
      candidate.text.trim().length === 0 ||
      typeof candidate.sourceType !== "string" ||
      !REQUIREMENT_SOURCE_TYPES.includes(
        /** @type {RequirementSourceType} */ (candidate.sourceType)
      ) ||
      !REQUIREMENT_QUALIFIERS.includes(
        /** @type {RequirementQualifier} */ (candidate.qualifier)
      )
    ) {
      throw new Error(`${label} item ${index + 1} has invalid requirement metadata.`);
    }

    return Object.freeze({
      text: candidate.text.trim(),
      sourceType: /** @type {RequirementSourceType} */ (candidate.sourceType),
      qualifier: /** @type {RequirementQualifier} */ (candidate.qualifier),
    });
  });
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
 * Repeating a recognized evidence ID does not change the evidence supporting a
 * match. Remove duplicates before validation rather than failing an otherwise
 * usable analysis or spending the single retry on a harmless formatting error.
 *
 * @param {unknown} value
 */
function deduplicatePass2EvidenceIds(value) {
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

    const candidate = /** @type {{ matchedBulletIds?: unknown }} */ (match);

    if (!Array.isArray(candidate.matchedBulletIds)) {
      return;
    }

    const deduplicated = [...new Set(candidate.matchedBulletIds)];

    if (deduplicated.length !== candidate.matchedBulletIds.length) {
      debugLog(`Pass 2 match ${index + 1} duplicate evidence IDs removed`, {
        from: candidate.matchedBulletIds,
        to: deduplicated,
      });
      candidate.matchedBulletIds = deduplicated;
    }
  });
}

/**
 * After the model has already failed once, restore exact one-to-one requirement
 * coverage conservatively. Recognized returned matches are reordered by their
 * code-owned requirement string; omissions become gaps, while extra or
 * duplicate matches are discarded.
 *
 * @param {unknown} value
 * @param {string[]} requirements
 */
function normalizeRetryablePass2MatchCoverage(value, requirements) {
  if (!value || typeof value !== "object") {
    return;
  }

  const result = /** @type {{ matches?: unknown, summary?: unknown }} */ (value);

  if (!Array.isArray(result.matches)) {
    return;
  }

  /** @type {Map<string, object>} */
  const firstMatchByRequirement = new Map();

  result.matches.forEach((match) => {
    if (!match || typeof match !== "object") {
      return;
    }

    const requirement = /** @type {{ requirement?: unknown }} */ (match).requirement;

    if (
      typeof requirement === "string" &&
      requirements.includes(requirement) &&
      !firstMatchByRequirement.has(requirement)
    ) {
      firstMatchByRequirement.set(requirement, match);
    }
  });

  result.matches = requirements.map((requirement) => {
    const matchedResult = firstMatchByRequirement.get(requirement);

    if (matchedResult) {
      return matchedResult;
    }

    debugLog("Pass 2 retry inserted conservative gap", { requirement });
    return {
      requirement,
      status: "gap",
      matchedBulletIds: [],
      severity: "medium",
    };
  });

  if (typeof result.summary !== "string") {
    result.summary = "Some requirements lacked a valid model match and were treated as gaps.";
  }
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

    if (candidate.requirement !== requirements[index]) {
      throw createModelOutputError(
        `Pass 2 match ${index + 1} did not copy the provided requirement exactly.`
      );
    }

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
 * Reject covered classifications that conflict with deterministic completeness
 * checks. Semantic citation and gap judgments are handled by the independent
 * evidence-audit model because lexical overlap is not reliable across domains.
 *
 * @param {Pass2ModelResult} result
 * @param {string[]} requirements
 * @param {Map<string, string>} resumeEvidenceById
 */
function assertSemanticallySupportedPass2Analysis(result, requirements, resumeEvidenceById) {
  result.matches.forEach((match, index) => {
    const requirement = requirements[index];
    const citedEvidenceTexts = match.matchedBulletIds.map((evidenceId) => {
      return /** @type {string} */ (resumeEvidenceById.get(evidenceId.trim()));
    });

    if (
      match.status === "covered" &&
      !coveredPass2EvidenceIsComplete(requirement, citedEvidenceTexts)
    ) {
      throw createModelOutputError(
        `Pass 2 match ${index + 1} was covered but its citations support only part of the requirement.`
      );
    }

  });
}

/**
 * Remove resume headers and job-title fragments from semantic citations. If
 * the independent reviewer replaced useful draft evidence with a header, reuse
 * only recognized, substantive draft citations. Otherwise normalize safely to
 * a gap rather than presenting unsupported evidence to the user.
 *
 * @param {Pass2ModelResult} reviewedResult
 * @param {Pass2ModelResult} draftResult
 * @param {string[]} requirements
 * @param {Map<string, string>} resumeEvidenceById
 */
function normalizePass2ContextOnlyCitations(
  reviewedResult,
  draftResult,
  requirements,
  resumeEvidenceById
) {
  reviewedResult.matches.forEach((match, index) => {
    if (match.status === "gap") {
      return;
    }

    const substantiveIds = match.matchedBulletIds.filter((evidenceId) => {
      const evidenceText = resumeEvidenceById.get(evidenceId.trim());
      const isDurationRequirement = getPass2RequiredYears(requirements[index]) !== null;

      return typeof evidenceText === "string" &&
        (!isPass2HeadingOnlyEvidence(evidenceText) ||
          isDurationRequirement) &&
        (isDurationRequirement || !isPass2EmploymentContextEvidence(evidenceText));
    });

    if (substantiveIds.length > 0) {
      match.matchedBulletIds = substantiveIds;
      return;
    }

    const draftMatch = draftResult.matches[index];
    const fallbackIds = draftMatch && draftMatch.status !== "gap"
      ? draftMatch.matchedBulletIds.filter((evidenceId) => {
          const evidenceText = resumeEvidenceById.get(evidenceId.trim());
          const isDurationRequirement =
            getPass2RequiredYears(requirements[index]) !== null;

          return typeof evidenceText === "string" &&
            (!isPass2HeadingOnlyEvidence(evidenceText) ||
              isDurationRequirement) &&
            (isDurationRequirement || !isPass2EmploymentContextEvidence(evidenceText));
        })
      : [];

    if (fallbackIds.length > 0) {
      debugLog(`Pass 2 match ${index + 1} replaced context-only citations`, {
        from: match.matchedBulletIds,
        to: fallbackIds,
      });
      match.matchedBulletIds = [...new Set(fallbackIds)];
      return;
    }

    debugLog(`Pass 2 match ${index + 1} normalized to gap`, {
      reason: "only resume header or job-title context was cited",
    });
    match.status = "gap";
    match.matchedBulletIds = [];
    match.severity = "medium";
  });
}

/**
 * Pair substantive role evidence with the code-owned employment date context
 * needed for duration requirements. Dates corroborate tenure but never upgrade
 * a model classification because calendar time alone cannot establish that the
 * dated roles involved the required domain, context, or kind of work.
 *
 * @param {Pass2ModelResult} result
 * @param {string[]} requirements
 * @param {Map<string, string>} resumeEvidenceById
 */
function normalizePass2DurationCitations(result, requirements, resumeEvidenceById) {
  result.matches.forEach((match, index) => {
    const requiredYears = getPass2RequiredYears(requirements[index]);

    if (requiredYears === null) {
      return;
    }

    const substantiveIds = match.matchedBulletIds.filter((evidenceId) => {
      const evidenceText = resumeEvidenceById.get(evidenceId.trim());
      return typeof evidenceText === "string" &&
        !isPass2EmploymentContextEvidence(evidenceText) &&
        !isPass2HeadingOnlyEvidence(evidenceText);
    });
    const contextIds = [...resumeEvidenceById.entries()]
      .filter(([, evidenceText]) => {
        return isPass2EmploymentContextEvidence(evidenceText) ||
          isPass2HeadingOnlyEvidence(evidenceText);
      })
      .slice(0, 4)
      .map(([evidenceId]) => evidenceId);
    const rankedSubstantiveCandidates = [...resumeEvidenceById.entries()]
      .filter(([, evidenceText]) => {
        return !isPass2EmploymentContextEvidence(evidenceText) &&
          !isPass2HeadingOnlyEvidence(evidenceText) &&
          (evidenceText.match(/[A-Za-z][A-Za-z0-9.+#/-]*/g) || []).length >= 7;
      })
      .map(([evidenceId, evidenceText]) => {
        return {
          evidenceId,
          score: getPass2GapRecoveryEvidenceScore(
            requirements[index],
            evidenceText
          ),
        };
      })
      .sort((first, second) => second.score - first.score);
    const rankedSubstantiveIds = rankedSubstantiveCandidates.map(
      (candidate) => candidate.evidenceId
    );
    const fallbackSubstantiveId = rankedSubstantiveIds[0];

    if (match.status === "gap") {
      const roleContextIds = contextIds.filter((evidenceId) => {
        const evidenceText = resumeEvidenceById.get(evidenceId);

        return typeof evidenceText === "string" &&
          pass2JobTitleSupportsDurationContext(
            requirements[index],
            evidenceText
          );
      });
      const durationEvidenceIds = [
        ...rankedSubstantiveIds.slice(0, 2),
        ...roleContextIds,
        ...contextIds.filter((evidenceId) => {
          return !roleContextIds.includes(evidenceId);
        }),
      ].slice(0, 5);
      const durationEvidenceTexts = durationEvidenceIds.map((evidenceId) => {
        return /** @type {string} */ (resumeEvidenceById.get(evidenceId));
      });
      const hasRelevantRoleEvidence =
        (rankedSubstantiveCandidates[0]?.score || 0) > 0 ||
        roleContextIds.length > 0;
      const hasSupportedTenure = hasRelevantRoleEvidence &&
        coveredPass2EvidenceIsComplete(
          requirements[index],
          durationEvidenceTexts
        );

      if (hasSupportedTenure) {
        match.status = "covered";
        match.matchedBulletIds = durationEvidenceIds;
        match.severity = null;
      }

      return;
    }

    const effectiveSubstantiveIds = substantiveIds.length > 0
      ? substantiveIds
      : fallbackSubstantiveId
        ? [fallbackSubstantiveId]
        : [];

    if (effectiveSubstantiveIds.length === 0 || contextIds.length === 0) {
      return;
    }

    match.matchedBulletIds = [
      ...effectiveSubstantiveIds.slice(0, Math.max(1, 5 - contextIds.length)),
      ...contextIds,
    ].slice(0, 5);
  });
}

/**
 * Remove clearly extraneous citations only when at least one stronger
 * substantive citation remains. Duration context is retained solely for
 * duration requirements. This keeps semantic paraphrases intact when lexical
 * checks cannot confidently identify a stronger citation.
 *
 * @param {Pass2ModelResult} result
 * @param {string[]} requirements
 * @param {Map<string, string>} resumeEvidenceById
 */
function normalizePass2ExtraneousCitations(
  result,
  requirements,
  resumeEvidenceById
) {
  result.matches.forEach((match, index) => {
    if (
      match.status === "gap" ||
      classifyRequirementSourceType(requirements[index]) === "work-application-constraint"
    ) {
      return;
    }

    const isDurationRequirement =
      getPass2RequiredYears(requirements[index]) !== null;
    const citedEvidenceTexts = match.matchedBulletIds
      .map((evidenceId) => resumeEvidenceById.get(evidenceId.trim()))
      .filter((evidenceText) => typeof evidenceText === "string");

    if (
      isDurationRequirement &&
      coveredPass2EvidenceIsComplete(
        requirements[index],
        /** @type {string[]} */ (citedEvidenceTexts)
      )
    ) {
      return;
    }

    const meaningfulCitedIds = match.matchedBulletIds.filter((evidenceId) => {
      const evidenceText = resumeEvidenceById.get(evidenceId.trim());

      return typeof evidenceText === "string" &&
        !isPass2EmploymentContextEvidence(evidenceText) &&
        !isPass2HeadingOnlyEvidence(evidenceText) &&
        getPass2GapRecoveryEvidenceScore(
          requirements[index],
          evidenceText
        ) > 0;
    });

    if (meaningfulCitedIds.length > 0) {
      const normalizedIds = match.matchedBulletIds.filter((evidenceId) => {
        const evidenceText = resumeEvidenceById.get(evidenceId.trim());

        return typeof evidenceText === "string" &&
          (meaningfulCitedIds.includes(evidenceId) ||
            (isDurationRequirement &&
              (isPass2EmploymentContextEvidence(evidenceText) ||
                isPass2HeadingOnlyEvidence(evidenceText))));
      });

      if (normalizedIds.length < match.matchedBulletIds.length) {
        debugLog(`Pass 2 match ${index + 1} removed extraneous citations`, {
          from: match.matchedBulletIds,
          to: normalizedIds,
        });
        match.matchedBulletIds = normalizedIds;
      }

      return;
    }

    const replacementIds = [...resumeEvidenceById.entries()]
      .filter(([, evidenceText]) => {
        return !isPass2EmploymentContextEvidence(evidenceText) &&
          !isPass2HeadingOnlyEvidence(evidenceText);
      })
      .map(([evidenceId, evidenceText]) => {
        return {
          evidenceId,
          score: getPass2GapRecoveryEvidenceScore(
            requirements[index],
            evidenceText
          ),
        };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((first, second) => second.score - first.score)
      .slice(0, 3)
      .map((candidate) => candidate.evidenceId);

    if (replacementIds.length > 0) {
      debugLog(`Pass 2 match ${index + 1} replaced unrelated citations`, {
        from: match.matchedBulletIds,
        to: replacementIds,
      });
      match.matchedBulletIds = replacementIds;
      return;
    }

    debugLog(`Pass 2 match ${index + 1} normalized to gap`, {
      reason: "no cited or available substantive evidence supports the requirement",
    });
    match.status = "gap";
    match.matchedBulletIds = [];
    match.severity = "medium";
  });
}

/**
 * An explicit "partner with [audience]" requirement needs evidence of both a
 * relationship activity and the named audience. Shared incidental nouns do
 * not establish partnership.
 *
 * @param {Pass2ModelResult} result
 * @param {string[]} requirements
 * @param {Map<string, string>} resumeEvidenceById
 */
function normalizePass2PartnerEvidence(
  result,
  requirements,
  resumeEvidenceById
) {
  result.matches.forEach((match, index) => {
    const audienceMatch = requirements[index].match(
      /^\s*partner\s+with\s+(.+?)(?:\s+on\b|,|[.;]|$)/i
    );

    if (!audienceMatch) {
      return;
    }

    const audienceTokens = getPass2EvidenceTokens(audienceMatch[1]);
    const qualifyingIds = [...resumeEvidenceById.entries()]
      .filter(([, evidenceText]) => {
        if (isPass2EmploymentContextEvidence(evidenceText)) {
          return false;
        }

        const demonstratesRelationship =
          /\b(?:partner|collaborat|coordinat|support|help|work)\w*(?:\s+\w+){0,3}\s+with\b|\b(?:help|support)\w*/i.test(
            evidenceText
          );
        const evidenceTokens = getPass2EvidenceTokens(evidenceText);
        const supportsAudience = audienceTokens.size > 0 &&
          [...audienceTokens].every((audienceToken) => {
            return [...evidenceTokens].some((evidenceToken) => {
              return pass2TokensAreRelated(audienceToken, evidenceToken);
            });
          });

        return demonstratesRelationship && supportsAudience;
      })
      .slice(0, 2)
      .map(([evidenceId]) => evidenceId);

    if (qualifyingIds.length === 0) {
      match.status = "gap";
      match.matchedBulletIds = [];
      match.severity = "medium";
      return;
    }

    match.matchedBulletIds = qualifyingIds;

    if (match.status === "gap") {
      match.status = "partial";
      match.severity = "medium";
    }
  });
}

/**
 * A partial must retain evidence for at least one meaningful clause. This
 * removes classifications based only on generic communication, incidental
 * nouns, or unrelated workplace activity.
 *
 * @param {Pass2ModelResult} result
 * @param {string[]} requirements
 * @param {Map<string, string>} resumeEvidenceById
 */
function normalizePass2UnsupportedPartials(
  result,
  requirements,
  resumeEvidenceById
) {
  result.matches.forEach((match, index) => {
    if (
      match.status !== "partial" ||
      /^\s*partner\s+with\b/i.test(requirements[index])
    ) {
      return;
    }

    const isSupportedDurationPartial =
      getPass2RequiredYears(requirements[index]) !== null &&
      match.matchedBulletIds.some((evidenceId) => {
        const evidenceText = resumeEvidenceById.get(evidenceId.trim());

        return typeof evidenceText === "string" &&
          pass2JobTitleSupportsDurationContext(
            requirements[index],
            evidenceText
          );
      });

    if (isSupportedDurationPartial) {
      return;
    }

    const hasClauseSupport = match.matchedBulletIds.some((evidenceId) => {
      const evidenceText = resumeEvidenceById.get(evidenceId.trim());

      return typeof evidenceText === "string" &&
        (pass2EvidenceSupportsAnyRequirementClause(
          requirements[index],
          evidenceText
        ) ||
          getPass2GapRecoveryEvidenceScore(
            requirements[index],
            evidenceText
          ) > 0);
    });

    if (!hasClauseSupport) {
      match.status = "gap";
      match.matchedBulletIds = [];
      match.severity = "medium";
    }
  });
}

/**
 * Promote a model partial only when the complete resume contains action-based
 * evidence that passes the same strict full-coverage checks used for covered
 * classifications. This repairs conservative omissions without promoting
 * skills-only claims or evidence for only part of a compound requirement.
 *
 * @param {Pass2ModelResult} result
 * @param {string[]} requirements
 * @param {Map<string, string>} resumeEvidenceById
 */
function normalizePass2DirectPartials(
  result,
  requirements,
  resumeEvidenceById
) {
  result.matches.forEach((match, index) => {
    if (match.status !== "partial") {
      return;
    }

    const candidateIds = [...resumeEvidenceById.entries()]
      .filter(([, evidenceText]) => {
        return !isPass2EmploymentContextEvidence(evidenceText) &&
          !isPass2HeadingOnlyEvidence(evidenceText) &&
          getPass2GapRecoveryEvidenceScore(
            requirements[index],
            evidenceText
          ) > 0;
      })
      .sort((first, second) => {
        return getPass2GapRecoveryEvidenceScore(
          requirements[index],
          second[1]
        ) - getPass2GapRecoveryEvidenceScore(
          requirements[index],
          first[1]
        );
      })
      .slice(0, 4)
      .map(([evidenceId]) => evidenceId);
    const evidenceTexts = candidateIds.map((evidenceId) => {
      return /** @type {string} */ (resumeEvidenceById.get(evidenceId));
    });
    const namedCapabilityMatch = requirements[index].match(
      /^(?:comfortable\s+(?:with|in)|experience\s+with|familiarity\s+with|knowledge\s+of|understanding\s+of)\s+([A-Za-z][A-Za-z0-9.+#/-]*)[.\s]*$/i
    );
    const namedCapabilityTokens = namedCapabilityMatch
      ? getPass2EvidenceTokens(namedCapabilityMatch[1])
      : new Set();
    const hasActionBasedNamedEvidence =
      namedCapabilityTokens.size > 0 &&
      evidenceTexts.some((evidenceText) => {
        const evidenceTokens = getPass2EvidenceTokens(evidenceText);
        const startsWithAction =
          /^(?:built|created|delivered|deployed|developed|implemented|maintained|shipped|used|wrote)\b/i.test(
            evidenceText.trim()
          );

        return startsWithAction &&
          [...namedCapabilityTokens].every((capabilityToken) => {
            return [...evidenceTokens].some((evidenceToken) => {
              return pass2TokensAreRelated(capabilityToken, evidenceToken);
            });
          });
      });

    if (
      candidateIds.length > 0 &&
      (hasActionBasedNamedEvidence ||
        pass2EvidenceDirectlyCoversRequirement(
          requirements[index],
          evidenceTexts
        ))
    ) {
      match.status = "covered";
      match.matchedBulletIds = candidateIds;
      match.severity = null;
    }
  });
}

/**
 * Restore a conservative partial when a model gap overlooks concrete evidence
 * for one clause. Collaboration and explicit partner/audience requirements are
 * excluded because generic coordination is especially prone to false transfer.
 *
 * @param {Pass2ModelResult} result
 * @param {string[]} requirements
 * @param {Map<string, string>} resumeEvidenceById
 */
function normalizePass2OverlookedGapEvidence(
  result,
  requirements,
  resumeEvidenceById
) {
  result.matches.forEach((match, index) => {
    if (
      match.status !== "gap" ||
      classifyRequirementSourceType(requirements[index]) === "work-application-constraint" ||
      /^\s*partner\s+with\b/i.test(requirements[index])
    ) {
      return;
    }

    const supportingEntries = [...resumeEvidenceById.entries()]
      .filter(([, evidenceText]) => {
        return !isPass2EmploymentContextEvidence(evidenceText) &&
          !isPass2HeadingOnlyEvidence(evidenceText);
      })
      .map(([evidenceId, evidenceText]) => {
        return {
          evidenceId,
          score: getPass2GapRecoveryEvidenceScore(
            requirements[index],
            evidenceText
          ),
        };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((first, second) => second.score - first.score)
      .slice(0, 3);

    if (supportingEntries.length > 0) {
      const evidenceIds = supportingEntries.map((entry) => entry.evidenceId);
      const evidenceTexts = evidenceIds.map((evidenceId) => {
        return /** @type {string} */ (resumeEvidenceById.get(evidenceId));
      });
      const isCovered = pass2EvidenceDirectlyCoversRequirement(
        requirements[index],
        evidenceTexts
      );

      match.status = isCovered ? "covered" : "partial";
      match.matchedBulletIds = evidenceIds;
      match.severity = isCovered ? null : "medium";
    }
  });
}

/**
 * Deterministic incompleteness should reduce a score, not turn an otherwise
 * valid model response into a terminal malformed-output error.
 *
 * @param {Pass2ModelResult} result
 * @param {string[]} requirements
 * @param {Map<string, string>} resumeEvidenceById
 */
function normalizePass2DeterministicCompleteness(
  result,
  requirements,
  resumeEvidenceById
) {
  result.matches.forEach((match, index) => {
    if (match.status !== "covered") {
      return;
    }

    const citedEvidenceTexts = match.matchedBulletIds.map((evidenceId) => {
      return /** @type {string} */ (resumeEvidenceById.get(evidenceId.trim()));
    });

    if (coveredPass2EvidenceIsComplete(requirements[index], citedEvidenceTexts)) {
      return;
    }

    const hasMeaningfulPartialEvidence = citedEvidenceTexts.some((evidenceText) => {
      return pass2EvidenceSupportsAnyRequirementClause(
        requirements[index],
        evidenceText
      );
    });
    const normalizedStatus = hasMeaningfulPartialEvidence ? "partial" : "gap";

    debugLog(`Pass 2 match ${index + 1} normalized to ${normalizedStatus}`, {
      reason: hasMeaningfulPartialEvidence
        ? "cited evidence supports only part of the requirement"
        : "cited evidence does not substantiate any required part",
    });
    match.status = normalizedStatus;
    match.matchedBulletIds = hasMeaningfulPartialEvidence
      ? match.matchedBulletIds
      : [];
    match.severity = "medium";
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
async function analyzeRequirementBatchWithResumeBullets(requirements, resumeBullets) {
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
    const needsDurationContext = normalizedRequirements.some((requirement) => {
      return getPass2RequiredYears(requirement) !== null;
    });
    const resumeEvidence = normalizedResumeBullets
      .map((text, index) => {
        const isEmploymentContext = isPass2EmploymentContextEvidence(text);
        const isJobTitleContext = isPass2JobTitleContext(
          normalizedResumeBullets,
          index
        );

        return {
          id: `B${index + 1}`,
          text,
          kind: /** @type {"substantive" | "context"} */ (
            isEmploymentContext || isJobTitleContext
              ? "context"
              : "substantive"
          ),
          isJobTitleContext,
        };
      })
      .filter((evidence) => {
        return (!isPass2HeadingOnlyEvidence(evidence.text) ||
            (needsDurationContext && evidence.isJobTitleContext)) &&
          (needsDurationContext || evidence.kind === "substantive");
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
        responseConstraint: createPass2AnalysisSchema(
          [...resumeEvidenceById.keys()],
          normalizedRequirements.length
        ),
      });
      const parsedResult = parseModelJson(rawResult, "Pass 2");
      hydratePass2ModelResult(parsedResult, normalizedRequirements);

      if (isRetry) {
        normalizeRetryablePass2MatchCoverage(parsedResult, normalizedRequirements);
      }

      normalizePass2Severity(parsedResult);
      deduplicatePass2EvidenceIds(parsedResult);

      if (isRetry) {
        normalizeRetryablePass2Evidence(parsedResult, resumeEvidenceById);
      }

      assertValidPass2AnalysisResult(
        parsedResult,
        normalizedRequirements,
        resumeEvidenceById
      );

      const reviewedResult = await reviewPass2Analysis(
        languageModel,
        normalizedRequirements,
        resumeEvidence,
        parsedResult,
        [...resumeEvidenceById.keys()]
      );

      if (isRetry) {
        normalizeRetryablePass2MatchCoverage(reviewedResult, normalizedRequirements);
      }

      normalizePass2Severity(reviewedResult);
      deduplicatePass2EvidenceIds(reviewedResult);

      if (isRetry) {
        normalizeRetryablePass2Evidence(reviewedResult, resumeEvidenceById);
      }

      normalizePass2ContextOnlyCitations(
        reviewedResult,
        parsedResult,
        normalizedRequirements,
        resumeEvidenceById
      );
      normalizePass2DurationCitations(
        reviewedResult,
        normalizedRequirements,
        resumeEvidenceById
      );
      normalizePass2DeterministicCompleteness(
        reviewedResult,
        normalizedRequirements,
        resumeEvidenceById
      );
      normalizePass2PartnerEvidence(
        reviewedResult,
        normalizedRequirements,
        resumeEvidenceById
      );
      normalizePass2OverlookedGapEvidence(
        reviewedResult,
        normalizedRequirements,
        resumeEvidenceById
      );
      normalizePass2UnsupportedPartials(
        reviewedResult,
        normalizedRequirements,
        resumeEvidenceById
      );
      normalizePass2DirectPartials(
        reviewedResult,
        normalizedRequirements,
        resumeEvidenceById
      );
      normalizePass2Severity(reviewedResult);

      assertValidPass2AnalysisResult(
        reviewedResult,
        normalizedRequirements,
        resumeEvidenceById
      );

      assertSemanticallySupportedPass2Analysis(
        reviewedResult,
        normalizedRequirements,
        resumeEvidenceById
      );

      const analysis = {
        matches: reviewedResult.matches.map((match, index) => {
          return {
            requirement: normalizedRequirements[index],
            status: match.status,
            matchedBullets: match.matchedBulletIds.map((evidenceId) => {
              return /** @type {string} */ (resumeEvidenceById.get(evidenceId.trim()));
            }),
            severity: match.severity,
            sourceType: classifyRequirementSourceType(
              normalizedRequirements[index]
            ),
            qualifier: inferExplicitRequirementQualifier(
              normalizedRequirements[index]
            ),
          };
        }),
        summary: reviewedResult.summary.trim(),
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
 * Give the completed batch results one bounded cross-batch audit. Only
 * classifications with a concrete risk signal are included, so this adds at
 * most one compact model session per resume instead of another session for
 * every batch.
 *
 * @param {string[]} requirements
 * @param {string[]} resumeBullets
 * @param {MatchResult[]} matches
 * @returns {Promise<MatchResult[]>}
 */
async function auditConsolidatedPass2Matches(
  requirements,
  resumeBullets,
  matches
) {
  const languageModel = getLanguageModelGlobal();

  if (!languageModel) {
    throw new Error("LanguageModel is not available in this browser.");
  }

  const needsDurationContext = requirements.some((requirement) => {
    return getPass2RequiredYears(requirement) !== null;
  });
  const resumeEvidence = resumeBullets
    .map((text, index) => {
      const isEmploymentContext = isPass2EmploymentContextEvidence(text);
      const isJobTitleContext = isPass2JobTitleContext(resumeBullets, index);

      return {
        id: `B${index + 1}`,
        text,
        kind: /** @type {"substantive" | "context"} */ (
          isEmploymentContext || isJobTitleContext
            ? "context"
            : "substantive"
        ),
        isJobTitleContext,
      };
    })
    .filter((evidence) => {
      return (!isPass2HeadingOnlyEvidence(evidence.text) ||
          (needsDurationContext && evidence.isJobTitleContext)) &&
        (needsDurationContext || evidence.kind === "substantive");
    });
  const resumeEvidenceById = new Map(
    resumeEvidence.map((evidence) => [evidence.id, evidence.text])
  );
  /** @type {Map<string, string>} */
  const firstEvidenceIdByText = new Map();

  resumeEvidence.forEach((evidence) => {
    if (!firstEvidenceIdByText.has(evidence.text)) {
      firstEvidenceIdByText.set(evidence.text, evidence.id);
    }
  });

  /** @type {Pass2ModelResult} */
  const consolidatedDraft = {
    matches: matches.map((match) => {
      return {
        requirement: match.requirement,
        status: /** @type {ModelMatchStatus} */ (match.status),
        matchedBulletIds: match.matchedBullets
          .map((bullet) => firstEvidenceIdByText.get(bullet) || "")
          .filter(Boolean),
        severity: match.severity,
      };
    }),
    summary: "Consolidated Pass 2 batch results.",
  };

  normalizePass2ExtraneousCitations(
    consolidatedDraft,
    requirements,
    resumeEvidenceById
  );

  const candidateIndexes = consolidatedDraft.matches
    .map((match, index) => {
      const substantiveCitations = match.matchedBulletIds
        .map((evidenceId) => resumeEvidenceById.get(evidenceId.trim()))
        .filter((evidenceText) => {
          return typeof evidenceText === "string" &&
            !isPass2EmploymentContextEvidence(evidenceText);
        });
      const hasOnlyWeakCitations = substantiveCitations.length > 0 &&
        substantiveCitations.every((evidenceText) => {
          return !pass2EvidenceMeaningfullyOverlaps(
            requirements[index],
            /** @type {string} */ (evidenceText)
          );
        });

      if (match.status === "partial") {
        const requiresDiagnosis =
          /\b(?:diagnos|debug|investigat|troubleshoot)\w*/i.test(
            requirements[index]
          );
        const requiresRepair =
          /\b(?:fix|repair|correct|remediat|resolv)\w*/i.test(
            requirements[index]
          );
        const highRiskPartial = hasOnlyWeakCitations ||
          /^\s*partner\s+with\b/i.test(requirements[index]) ||
          (requiresDiagnosis && requiresRepair);

        return { index, priority: highRiskPartial ? 0 : 1 };
      }

      if (match.status === "gap") {
        const hasPotentiallyOverlookedEvidence = resumeEvidence.some((evidence) => {
          return evidence.kind === "substantive" &&
            pass2EvidenceStronglySupportsAnyRequirementClause(
              requirements[index],
              evidence.text
            );
        });

        return hasPotentiallyOverlookedEvidence
          ? { index, priority: 0 }
          : null;
      }

      if (
        getPass2RequiredYears(requirements[index]) !== null ||
        /\bacross\b/i.test(requirements[index]) ||
        /^\s*partner\s+with\b/i.test(requirements[index])
      ) {
        return { index, priority: 0 };
      }

      return hasOnlyWeakCitations ? { index, priority: 0 } : null;
    })
    .filter((candidate) => candidate !== null)
    .sort((first, second) => {
      return first.priority - second.priority || first.index - second.index;
    })
    .slice(0, PASS_2_CONSOLIDATED_AUDIT_MAX_REQUIREMENTS)
    .map((candidate) => candidate.index);

  if (candidateIndexes.length > 0) {
    const candidateRequirements = candidateIndexes.map(
      (index) => requirements[index]
    );
    /** @type {Pass2ModelResult} */
    const candidateDraft = {
      matches: candidateIndexes.map(
        (index) => consolidatedDraft.matches[index]
      ),
      summary: consolidatedDraft.summary,
    };
    const reviewedCandidates = await withModelOutputRetry(async (isRetry) => {
      const reviewedResult = await reviewPass2Analysis(
        languageModel,
        candidateRequirements,
        resumeEvidence,
        candidateDraft,
        [...resumeEvidenceById.keys()]
      );

      if (isRetry) {
        normalizeRetryablePass2MatchCoverage(
          reviewedResult,
          candidateRequirements
        );
      }

      normalizePass2Severity(reviewedResult);
      deduplicatePass2EvidenceIds(reviewedResult);

      if (isRetry) {
        normalizeRetryablePass2Evidence(reviewedResult, resumeEvidenceById);
      }

      normalizePass2ContextOnlyCitations(
        reviewedResult,
        candidateDraft,
        candidateRequirements,
        resumeEvidenceById
      );
      normalizePass2DurationCitations(
        reviewedResult,
        candidateRequirements,
        resumeEvidenceById
      );
      normalizePass2ExtraneousCitations(
        reviewedResult,
        candidateRequirements,
        resumeEvidenceById
      );
      normalizePass2DeterministicCompleteness(
        reviewedResult,
        candidateRequirements,
        resumeEvidenceById
      );
      normalizePass2PartnerEvidence(
        reviewedResult,
        candidateRequirements,
        resumeEvidenceById
      );
      normalizePass2OverlookedGapEvidence(
        reviewedResult,
        candidateRequirements,
        resumeEvidenceById
      );
      normalizePass2UnsupportedPartials(
        reviewedResult,
        candidateRequirements,
        resumeEvidenceById
      );
      normalizePass2DirectPartials(
        reviewedResult,
        candidateRequirements,
        resumeEvidenceById
      );
      normalizePass2Severity(reviewedResult);
      assertValidPass2AnalysisResult(
        reviewedResult,
        candidateRequirements,
        resumeEvidenceById
      );
      assertSemanticallySupportedPass2Analysis(
        reviewedResult,
        candidateRequirements,
        resumeEvidenceById
      );

      return reviewedResult;
    }, "Pass 2 consolidated evidence audit");

    candidateIndexes.forEach((originalIndex, candidateIndex) => {
      consolidatedDraft.matches[originalIndex] =
        reviewedCandidates.matches[candidateIndex];
    });
  }

  normalizePass2ExtraneousCitations(
    consolidatedDraft,
    requirements,
    resumeEvidenceById
  );
  normalizePass2DeterministicCompleteness(
    consolidatedDraft,
    requirements,
    resumeEvidenceById
  );
  normalizePass2UnsupportedPartials(
    consolidatedDraft,
    requirements,
    resumeEvidenceById
  );
  normalizePass2DirectPartials(
    consolidatedDraft,
    requirements,
    resumeEvidenceById
  );
  normalizePass2Severity(consolidatedDraft);

  return consolidatedDraft.matches.map((match, index) => {
    return {
      requirement: requirements[index],
      status: match.status,
      matchedBullets: match.matchedBulletIds.map((evidenceId) => {
        return /** @type {string} */ (
          resumeEvidenceById.get(evidenceId.trim())
        );
      }),
      severity: match.severity,
      sourceType: classifyRequirementSourceType(requirements[index]),
      qualifier: inferExplicitRequirementQualifier(requirements[index]),
    };
  });
}

/**
 * Resume silence cannot establish availability, authorization, location,
 * schedule, or travel fit. Preserve these requirements as unknown and remove
 * model-selected evidence so they remain outside the qualification score.
 *
 * @param {MatchResult[]} matches
 * @returns {MatchResult[]}
 */
function normalizeWorkConstraintMatches(matches) {
  return matches.map((match) => {
    const sourceType = match.sourceType ||
      classifyRequirementSourceType(match.requirement);

    if (sourceType !== "work-application-constraint") {
      return {
        ...match,
        sourceType,
      };
    }

    return {
      ...match,
      status: /** @type {MatchStatus} */ ("unknown"),
      matchedBullets: [],
      severity: null,
      sourceType,
    };
  });
}

/**
 * Exercise the code-owned Pass 2 repair pipeline without a model call. This is
 * intentionally exposed only through testHooks so benchmark regressions can
 * pin citation cleanup and constraint handling deterministically.
 *
 * @param {string[]} requirements
 * @param {string[]} resumeBullets
 * @param {{ requirement: string, status: ModelMatchStatus, matchedBullets: string[], severity: MatchSeverity | null }[]} matches
 * @returns {MatchResult[]}
 */
function normalizePass2EvidenceForTesting(
  requirements,
  resumeBullets,
  matches
) {
  const resumeEvidenceById = new Map(
    resumeBullets.map((bullet, index) => [`B${index + 1}`, bullet])
  );
  const firstEvidenceIdByText = new Map(
    [...resumeEvidenceById.entries()].map(([evidenceId, text]) => {
      return [text, evidenceId];
    })
  );
  /** @type {Pass2ModelResult} */
  const result = {
    matches: matches.map((match, index) => {
      return {
        requirement: requirements[index],
        status: match.status,
        matchedBulletIds: match.matchedBullets
          .map((bullet) => firstEvidenceIdByText.get(bullet) || "")
          .filter(Boolean),
        severity: match.severity,
      };
    }),
    summary: "Deterministic Pass 2 test fixture.",
  };
  /** @type {Pass2ModelResult} */
  const originalDraft = {
    matches: result.matches.map((match) => {
      return {
        ...match,
        matchedBulletIds: [...match.matchedBulletIds],
      };
    }),
    summary: result.summary,
  };

  normalizePass2ContextOnlyCitations(
    result,
    originalDraft,
    requirements,
    resumeEvidenceById
  );
  normalizePass2DurationCitations(result, requirements, resumeEvidenceById);
  normalizePass2ExtraneousCitations(result, requirements, resumeEvidenceById);
  normalizePass2DeterministicCompleteness(
    result,
    requirements,
    resumeEvidenceById
  );
  normalizePass2OverlookedGapEvidence(
    result,
    requirements,
    resumeEvidenceById
  );
  normalizePass2UnsupportedPartials(result, requirements, resumeEvidenceById);
  normalizePass2DirectPartials(result, requirements, resumeEvidenceById);
  normalizePass2Severity(result);

  return normalizeWorkConstraintMatches(
    result.matches.map((match, index) => {
      return {
        requirement: requirements[index],
        status: match.status,
        matchedBullets: match.matchedBulletIds.map((evidenceId) => {
          return /** @type {string} */ (resumeEvidenceById.get(evidenceId));
        }),
        severity: match.severity,
        sourceType: classifyRequirementSourceType(requirements[index]),
        qualifier: inferExplicitRequirementQualifier(requirements[index]),
      };
    })
  );
}

/**
 * Keep each model response bounded so long requirement lists cannot exhaust
 * the on-device model's output budget. Evidence IDs remain stable across every
 * batch because each batch derives them from the same original resume array.
 *
 * @param {(string | ExtractedRequirement)[]} requirements
 * @param {string[]} resumeBullets
 * @returns {Promise<Pass2AnalysisResult>}
 */
async function analyzeRequirementsWithResumeBullets(requirements, resumeBullets) {
  const requirementMetadata = validateExtractedRequirements(
    requirements,
    "Requirements",
    PASS_1_MAX_REQUIREMENTS
  );
  const normalizedRequirements = requirementMetadata.map(
    (requirement) => requirement.text
  );
  const normalizedResumeBullets = validatePromptStringArray(
    resumeBullets,
    "Resume bullets"
  );

  if (normalizedRequirements.length === 0) {
    return {
      matches: [],
      summary: "No job requirements were available to compare.",
    };
  }

  const scoredRequirementMetadata = requirementMetadata.filter((requirement) => {
    return requirement.sourceType !== "work-application-constraint";
  });
  const scoredRequirements = scoredRequirementMetadata.map(
    (requirement) => requirement.text
  );
  /** @type {MatchResult[]} */
  const matches = [];

  for (
    let batchStart = 0;
    batchStart < scoredRequirements.length;
    batchStart += PASS_2_REQUIREMENT_BATCH_SIZE
  ) {
    const batchRequirements = scoredRequirements.slice(
      batchStart,
      batchStart + PASS_2_REQUIREMENT_BATCH_SIZE
    );
    const batchAnalysis = await analyzeRequirementBatchWithResumeBullets(
      batchRequirements,
      normalizedResumeBullets
    );

    matches.push(...batchAnalysis.matches);
  }

  const scoredMatches = scoredRequirements.length > 0
    ? await auditConsolidatedPass2Matches(
      scoredRequirements,
      normalizedResumeBullets,
      matches
    )
    : [];
  let scoredMatchIndex = 0;
  const auditedMatches = requirementMetadata.map((requirementMetadataItem) => {
    if (
      requirementMetadataItem.sourceType === "work-application-constraint"
    ) {
      return /** @type {MatchResult} */ ({
        requirement: requirementMetadataItem.text,
        status: "unknown",
        matchedBullets: [],
        severity: null,
        sourceType: requirementMetadataItem.sourceType,
        qualifier: requirementMetadataItem.qualifier,
      });
    }

    const match = scoredMatches[scoredMatchIndex];
    scoredMatchIndex += 1;

    return {
      ...match,
      requirement: requirementMetadataItem.text,
      sourceType: requirementMetadataItem.sourceType,
      qualifier: requirementMetadataItem.qualifier,
    };
  });
  const statusCounts = auditedMatches.reduce(
    (counts, match) => {
      counts[match.status] += 1;
      return counts;
    },
    { covered: 0, partial: 0, gap: 0, unknown: 0 }
  );

  return {
    matches: auditedMatches,
    summary: `Resume evidence covers ${statusCounts.covered} requirements, partially supports ${statusCounts.partial}, and leaves ${statusCounts.gap} gaps.${statusCounts.unknown > 0 ? ` ${statusCounts.unknown} work or application constraints are not scored because the resume does not establish them.` : ""}`,
  };
}

/**
 * @param {(string | ExtractedRequirement)[]} requirements
 * @returns {Promise<Pass2AnalysisResult>}
 */
async function analyzeRequirementsWithSavedResume(requirements) {
  const resumeBullets = await getSavedResumeBullets();

  return analyzeRequirementsWithResumeBullets(requirements, resumeBullets);
}

/**
 * @param {{ status: "covered" | "partial" | "gap" | "unknown" }[]} matches
 * @returns {number}
 */
function computeOverallScore(matches) {
  const scoredMatches = matches.filter((match) => match.status !== "unknown");

  if (scoredMatches.length === 0) {
    return 0;
  }

  const total = scoredMatches.reduce((sum, match) => {
    return sum + MATCH_STATUS_SCORES[match.status];
  }, 0);

  return Math.round((total / scoredMatches.length) * 100);
}

(/** @type {GapcheckWindow} */ (window)).GapcheckNano = Object.freeze({
  pass1MaxRequirements: PASS_1_MAX_REQUIREMENTS,
  ensureLanguageModelReady,
  extractRequirementsFromJobText,
  analyzeRequirementsWithResumeBullets,
  analyzeRequirementsWithSavedResume,
  computeOverallScore,
  classifyRequirementSourceType,
  testHooks: Object.freeze({
    isPass2HeadingOnlyEvidence,
    isPass2EmploymentContextEvidence,
    pass2JobTitleSupportsDurationContext,
    getPass2GapRecoveryEvidenceScore,
    coveredPass2EvidenceIsComplete,
    pass2EvidenceDirectlyCoversRequirement,
    normalizePass2EvidenceForTesting,
    assertValidPass1ExtractionResult,
    createExtractedRequirement,
    labelExplicitJobBullets,
    mergeRelatedPass1RequirementsToLimit,
  }),
  enableDebug,
  disableDebug,
  isDebugEnabled,
});
