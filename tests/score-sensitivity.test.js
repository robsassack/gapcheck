// @ts-check

/**
 * This is an audit of the production status-only score, not a proposed scoring
 * formula. It keeps the known count-sensitive behavior visible until a later
 * requirement-aware scoring decision replaces or accepts it.
 *
 * @typedef {"covered" | "partial" | "gap" | "unknown"} AuditMatchStatus
 */

/**
 * @param {AuditMatchStatus[]} statuses
 * @returns {number}
 */
function scoreAuditStatuses(statuses) {
  return window.GapcheckNano.computeOverallScore(
    statuses.map((status) => ({ status }))
  );
}

const scoreSensitivityCases = [
  {
    name: "related themes combined",
    statuses: ["covered", "partial", "gap", "partial", "partial"],
    expected: 50,
  },
  {
    name: "related theme split into covered and missing parts",
    statuses: [
      "covered",
      "partial",
      "gap",
      "partial",
      "covered",
      "gap",
      "gap",
    ],
    expected: 43,
  },
  {
    name: "optional technology list grouped as one gap",
    statuses: ["covered", "covered", "partial", "gap", "gap", "gap"],
    expected: 42,
  },
  {
    name: "optional technology list fragmented into three gaps",
    statuses: [
      "covered",
      "covered",
      "partial",
      "gap",
      "gap",
      "gap",
      "gap",
      "gap",
    ],
    expected: 31,
  },
  {
    name: "compound partial is equivalent to one covered and one gap here",
    statuses: ["covered", "partial", "gap", "partial", "covered", "gap"],
    expected: 50,
  },
].map((testCase) => {
  const actual = scoreAuditStatuses(
    /** @type {AuditMatchStatus[]} */ (testCase.statuses)
  );

  return {
    ...testCase,
    actual,
    passed: actual === testCase.expected,
  };
});

const sensitivityFailures = scoreSensitivityCases.filter(
  (testCase) => !testCase.passed
);
const sensitivityLines = scoreSensitivityCases.map((testCase) => {
  const mark = testCase.passed ? "PASS" : "FAIL";
  return `${mark} sensitivity audit: ${testCase.name}: expected ${testCase.expected}, got ${testCase.actual}`;
});

if (testOutput) {
  testOutput.textContent = [
    testOutput.textContent,
    ...sensitivityLines,
  ].filter(Boolean).join("\n");
}

if (sensitivityFailures.length > 0) {
  throw new Error(
    `${sensitivityFailures.length} score sensitivity audit test(s) failed.`
  );
}

console.log("GapCheck score sensitivity audit passed.", scoreSensitivityCases);
