// @ts-check

/**
 * @typedef {"covered" | "partial" | "gap" | "unknown"} RequirementAwareTestStatus
 * @typedef {"required-qualification" | "preferred-qualification" | "core-responsibility" | "work-application-constraint"} RequirementAwareTestSource
 * @typedef {"low" | "medium" | "high"} RequirementAwareTestSeverity
 */

const requirementAwareScoring = window.GapcheckBenchmarkScoring;

if (!requirementAwareScoring) {
  throw new Error("Requirement-aware benchmark scoring helpers did not load.");
}

/**
 * @param {RequirementAwareTestStatus} status
 * @param {RequirementAwareTestSource} sourceType
 * @param {RequirementAwareTestSeverity | null} severity
 */
function createRequirementAwareTestMatch(status, sourceType, severity) {
  return { status, sourceType, severity };
}

const requirementAwareCases = [
  {
    name: "all formula variants preserve all-covered",
    expected: "100|100|100|100",
    actual: (() => {
      const scores = requirementAwareScoring.computeScoreVariants([
        createRequirementAwareTestMatch(
          "covered",
          "required-qualification",
          null
        ),
        createRequirementAwareTestMatch(
          "covered",
          "preferred-qualification",
          null
        ),
        createRequirementAwareTestMatch(
          "covered",
          "core-responsibility",
          null
        ),
      ]);
      return `${scores.statusOnly}|${scores.sourceWeighted}|${scores.severityWeighted}|${scores.combined}`;
    })(),
  },
  {
    name: "all formula variants preserve all-gap",
    expected: "0|0|0|0",
    actual: (() => {
      const scores = requirementAwareScoring.computeScoreVariants([
        createRequirementAwareTestMatch(
          "gap",
          "required-qualification",
          "high"
        ),
        createRequirementAwareTestMatch(
          "gap",
          "preferred-qualification",
          "low"
        ),
        createRequirementAwareTestMatch(
          "gap",
          "core-responsibility",
          "medium"
        ),
      ]);
      return `${scores.statusOnly}|${scores.sourceWeighted}|${scores.severityWeighted}|${scores.combined}`;
    })(),
  },
  {
    name: "preferred bucket has less influence than required bucket",
    expected: 33,
    actual: requirementAwareScoring.computeScoreVariants([
      createRequirementAwareTestMatch(
        "gap",
        "required-qualification",
        "medium"
      ),
      createRequirementAwareTestMatch(
        "covered",
        "preferred-qualification",
        null
      ),
    ]).sourceWeighted,
  },
  {
    name: "responsibility count does not overwhelm required bucket",
    expected: 43,
    actual: requirementAwareScoring.computeScoreVariants([
      createRequirementAwareTestMatch(
        "gap",
        "required-qualification",
        "medium"
      ),
      ...Array.from({ length: 10 }, () =>
        createRequirementAwareTestMatch(
          "covered",
          "core-responsibility",
          null
        )
      ),
    ]).sourceWeighted,
  },
  {
    name: "high-severity gap has more influence than low-severity gap",
    expected: 40,
    actual: requirementAwareScoring.computeScoreVariants([
      createRequirementAwareTestMatch(
        "covered",
        "required-qualification",
        null
      ),
      createRequirementAwareTestMatch(
        "gap",
        "required-qualification",
        "high"
      ),
    ]).severityWeighted,
  },
  {
    name: "low-severity gap has less influence than high-severity gap",
    expected: 67,
    actual: requirementAwareScoring.computeScoreVariants([
      createRequirementAwareTestMatch(
        "covered",
        "required-qualification",
        null
      ),
      createRequirementAwareTestMatch(
        "gap",
        "required-qualification",
        "low"
      ),
    ]).severityWeighted,
  },
  {
    name: "partial severity changes aggregate influence but not item credit",
    expected: "50|50|50",
    actual: ["low", "medium", "high"].map((severity) => {
      return requirementAwareScoring.computeScoreVariants([
        createRequirementAwareTestMatch(
          "partial",
          "required-qualification",
          /** @type {RequirementAwareTestSeverity} */ (severity)
        ),
      ]).severityWeighted;
    }).join("|"),
  },
  {
    name: "unknown constraint is excluded from every formula",
    expected: "100|100|100|100",
    actual: (() => {
      const scores = requirementAwareScoring.computeScoreVariants([
        createRequirementAwareTestMatch(
          "covered",
          "required-qualification",
          null
        ),
        createRequirementAwareTestMatch(
          "unknown",
          "work-application-constraint",
          null
        ),
      ]);
      return `${scores.statusOnly}|${scores.sourceWeighted}|${scores.severityWeighted}|${scores.combined}`;
    })(),
  },
  {
    name: "zero-weight constraints return zero",
    expected: "0|0|0|0",
    actual: (() => {
      const scores = requirementAwareScoring.computeScoreVariants([
        createRequirementAwareTestMatch(
          "unknown",
          "work-application-constraint",
          null
        ),
      ]);
      return `${scores.statusOnly}|${scores.sourceWeighted}|${scores.severityWeighted}|${scores.combined}`;
    })(),
  },
].map((testCase) => ({
  ...testCase,
  passed: testCase.actual === testCase.expected,
}));

const requirementAwareFailures = requirementAwareCases.filter(
  (testCase) => !testCase.passed
);
const requirementAwareLines = requirementAwareCases.map((testCase) => {
  const mark = testCase.passed ? "PASS" : "FAIL";
  return `${mark} requirement-aware candidate: ${testCase.name}: expected ${testCase.expected}, got ${testCase.actual}`;
});

if (testOutput) {
  testOutput.textContent = [
    testOutput.textContent,
    ...requirementAwareLines,
  ].filter(Boolean).join("\n");
}

if (requirementAwareFailures.length > 0) {
  throw new Error(
    `${requirementAwareFailures.length} requirement-aware candidate test(s) failed.`
  );
}

console.log(
  "GapCheck requirement-aware candidate tests passed.",
  requirementAwareCases
);
