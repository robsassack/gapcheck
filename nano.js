// @ts-check

const PASS_1_MAX_REQUIREMENTS = 20;
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
