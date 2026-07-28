// @ts-check

const testOutput = document.getElementById("testOutput");

/**
 * @typedef {"covered" | "partial" | "gap" | "unknown"} MatchStatus
 */

/**
 * @param {string} name
 * @param {{ status: MatchStatus }[]} matches
 * @param {number} expected
 * @returns {{ name: string, expected: number, actual: number, passed: boolean }}
 */
function runScoreTest(name, matches, expected) {
  const actual = window.GapcheckNano.computeOverallScore(matches);

  return {
    name,
    expected,
    actual,
    passed: actual === expected,
  };
}

const results = [
  runScoreTest(
    "all covered",
    [{ status: "covered" }, { status: "covered" }, { status: "covered" }],
    100
  ),
  runScoreTest("all gaps", [{ status: "gap" }, { status: "gap" }, { status: "gap" }], 0),
  runScoreTest(
    "mixed covered, partial, gap",
    [{ status: "covered" }, { status: "partial" }, { status: "gap" }],
    50
  ),
  runScoreTest("empty", [], 0),
  runScoreTest(
    "unknown constraints are excluded",
    [{ status: "covered" }, { status: "gap" }, { status: "unknown" }],
    50
  ),
  runScoreTest(
    "all unknown constraints",
    [{ status: "unknown" }, { status: "unknown" }],
    0
  ),
];

const sourceTypeResults = [
  {
    name: "work authorization is a constraint",
    expected: "work-application-constraint",
    actual: window.GapcheckNano.classifyRequirementSourceType(
      "Already be authorized to work in the United States without sponsorship"
    ),
  },
  {
    name: "hybrid attendance is a constraint",
    expected: "work-application-constraint",
    actual: window.GapcheckNano.classifyRequirementSourceType(
      "Work from the Bellwether City office two days per week"
    ),
  },
  {
    name: "travel availability is a constraint",
    expected: "work-application-constraint",
    actual: window.GapcheckNano.classifyRequirementSourceType(
      "Be available for up to 20 percent client travel"
    ),
  },
  {
    name: "technical deployment remains scored",
    expected: "required-qualification",
    actual: window.GapcheckNano.classifyRequirementSourceType(
      "Help deploy and support services in AWS using an existing delivery pipeline"
    ),
  },
].map((result) => {
  return {
    ...result,
    passed: result.actual === result.expected,
  };
});

const requirementMetadataResults = [
  {
    name: "required qualification metadata",
    expected: "required-qualification|required",
    actual: (() => {
      const result = window.GapcheckNano.testHooks.createExtractedRequirement(
        "Three years of TypeScript experience is required",
        "eligibility",
        "required"
      );
      return `${result.sourceType}|${result.qualifier}`;
    })(),
  },
  {
    name: "preferred qualifier creates preferred qualification",
    expected: "preferred-qualification|preferred",
    actual: (() => {
      const result = window.GapcheckNano.testHooks.createExtractedRequirement(
        "GraphQL experience is preferred",
        "eligibility",
        "preferred"
      );
      return `${result.sourceType}|${result.qualifier}`;
    })(),
  },
  {
    name: "plus qualifier is preserved",
    expected: "preferred-qualification|plus",
    actual: (() => {
      const result = window.GapcheckNano.testHooks.createExtractedRequirement(
        "Kubernetes experience is a plus",
        "eligibility",
        "plus"
      );
      return `${result.sourceType}|${result.qualifier}`;
    })(),
  },
  {
    name: "desirable qualifier is preserved",
    expected: "preferred-qualification|desirable",
    actual: (() => {
      const result = window.GapcheckNano.testHooks.createExtractedRequirement(
        "Experience with event streaming is desirable",
        "eligibility",
        "desirable"
      );
      return `${result.sourceType}|${result.qualifier}`;
    })(),
  },
  {
    name: "not-required qualifier is preserved",
    expected: "preferred-qualification|not-required",
    actual: (() => {
      const result = window.GapcheckNano.testHooks.createExtractedRequirement(
        "Prior healthcare experience is not required",
        "eligibility",
        "not-required"
      );
      return `${result.sourceType}|${result.qualifier}`;
    })(),
  },
  {
    name: "responsibility metadata",
    expected: "core-responsibility|null",
    actual: (() => {
      const result = window.GapcheckNano.testHooks.createExtractedRequirement(
        "Build and maintain customer-facing applications",
        "responsibility",
        null
      );
      return `${result.sourceType}|${result.qualifier}`;
    })(),
  },
  {
    name: "constraint classification overrides qualification category",
    expected: "work-application-constraint|required",
    actual: (() => {
      const result = window.GapcheckNano.testHooks.createExtractedRequirement(
        "Travel up to 20 percent is required",
        "eligibility",
        "required"
      );
      return `${result.sourceType}|${result.qualifier}`;
    })(),
  },
  {
    name: "portfolio submission is an application constraint",
    expected: "work-application-constraint|null",
    actual: (() => {
      const result = window.GapcheckNano.testHooks.createExtractedRequirement(
        "Submit a portfolio of recent design work",
        "eligibility",
        null
      );
      return `${result.sourceType}|${result.qualifier}`;
    })(),
  },
  {
    name: "malformed qualifier is rejected",
    expected: true,
    actual: (() => {
      try {
        window.GapcheckNano.testHooks.assertValidPass1ExtractionResult({
          eligibilityRequirements: [
            { requirement: "Know TypeScript", qualifier: "nice-to-have" },
          ],
          responsibilities: [],
        });
        return false;
      } catch (error) {
        return error instanceof Error &&
          error.name === "GapcheckModelOutputError";
      }
    })(),
  },
  {
    name: "missing metadata is rejected",
    expected: true,
    actual: (() => {
      try {
        window.GapcheckNano.testHooks.assertValidPass1ExtractionResult({
          eligibilityRequirements: ["Know TypeScript"],
          responsibilities: [],
        });
        return false;
      } catch (error) {
        return error instanceof Error &&
          error.name === "GapcheckModelOutputError";
      }
    })(),
  },
].map((result) => {
  return {
    ...result,
    passed: result.actual === result.expected,
  };
});

const postgresEvidence =
  "Added Node.js and Express endpoints for shipment exceptions and wrote PostgreSQL queries and migrations for the supporting data.";
const testingEvidence =
  "Wrote Vitest unit coverage for pricing rules and Supertest integration coverage for REST endpoints backed by a test database.";
const diagnosisEvidence =
  "Diagnosed a production filtering defect with browser network tools and service logs, then added a monitor for repeated API failures.";
const normalizedEvidenceFixture =
  window.GapcheckNano.testHooks.normalizePass2EvidenceForTesting(
    [
      "Model and query application data in PostgreSQL",
      "Write unit tests for application logic and integration tests for API and database behavior",
      "Work from the Bellwether City office two days per week",
    ],
    [
      "Junior Software Developer",
      "March 2024 to present",
      postgresEvidence,
      testingEvidence,
      diagnosisEvidence,
    ],
    [
      {
        requirement: "Model and query application data in PostgreSQL",
        status: "partial",
        matchedBullets: ["Junior Software Developer"],
        severity: "medium",
      },
      {
        requirement: "Write unit tests for application logic and integration tests for API and database behavior",
        status: "covered",
        matchedBullets: [diagnosisEvidence],
        severity: null,
      },
      {
        requirement: "Work from the Bellwether City office two days per week",
        status: "partial",
        matchedBullets: [postgresEvidence],
        severity: "medium",
      },
    ]
  );
const normalizedDurationFixture =
  window.GapcheckNano.testHooks.normalizePass2EvidenceForTesting(
    ["Have at least one year of professional software development experience"],
    [
      "Software Developer",
      "March 2024 to present",
      "Built responsive React and TypeScript screens for a parcel-routing dashboard.",
    ],
    [
      {
        requirement:
          "Have at least one year of professional software development experience",
        status: "gap",
        matchedBullets: [],
        severity: "medium",
      },
    ]
  );
const onsiteConstraint =
  "Work from the Bellwether City office two days per week";
const explicitConstraintMatchEvidence =
  "Located in Bellwether City and available to work from the office two days per week.";
const explicitConstraintConflictEvidence =
  "Seeking remote-only roles and unavailable for recurring office attendance.";
const explicitConstraintMatchFixture =
  window.GapcheckNano.testHooks.normalizePass2EvidenceForTesting(
    [onsiteConstraint],
    [explicitConstraintMatchEvidence],
    [
      {
        requirement: onsiteConstraint,
        status: "covered",
        matchedBullets: [explicitConstraintMatchEvidence],
        severity: null,
      },
    ]
  );
const explicitConstraintConflictFixture =
  window.GapcheckNano.testHooks.normalizePass2EvidenceForTesting(
    [onsiteConstraint],
    [explicitConstraintConflictEvidence],
    [
      {
        requirement: onsiteConstraint,
        status: "gap",
        matchedBullets: [],
        severity: "high",
      },
    ]
  );
const missingConstraintInformationFixture =
  window.GapcheckNano.testHooks.normalizePass2EvidenceForTesting(
    [onsiteConstraint],
    ["Built accessible React interfaces for a logistics dashboard."],
    [
      {
        requirement: onsiteConstraint,
        status: "gap",
        matchedBullets: [],
        severity: "medium",
      },
    ]
  );

/**
 * @param {{ status: MatchStatus, matchedBullets: string[], sourceType: string }} match
 * @returns {boolean}
 */
function constraintIsUnknownAndUnscored(match) {
  return match.status === "unknown" &&
    match.matchedBullets.length === 0 &&
    match.sourceType === "work-application-constraint" &&
    window.GapcheckNano.computeOverallScore([
      { status: "covered" },
      match,
    ]) === 100;
}

const evidenceResults = [
  {
    name: "job title is context only",
    expected: true,
    actual: window.GapcheckNano.testHooks.isPass2HeadingOnlyEvidence(
      "Junior Software Developer"
    ),
  },
  {
    name: "month-based date range is context only",
    expected: true,
    actual: window.GapcheckNano.testHooks.isPass2EmploymentContextEvidence(
      "March 2024 to present"
    ),
  },
  {
    name: "software developer title supports software duration context",
    expected: true,
    actual:
      window.GapcheckNano.testHooks.pass2JobTitleSupportsDurationContext(
        "Have at least one year of professional software development experience",
        "Software Developer"
      ),
  },
  {
    name: "unrelated diagnosis does not support testing",
    expected: 0,
    actual: window.GapcheckNano.testHooks.getPass2GapRecoveryEvidenceScore(
      "Write unit tests for application logic and integration tests for API and database behavior",
      "Diagnosed a production filtering defect with browser network tools and service logs, then added a monitor for repeated API failures."
    ),
  },
  {
    name: "direct unit and integration evidence supports testing",
    expected: true,
    actual:
      window.GapcheckNano.testHooks.getPass2GapRecoveryEvidenceScore(
        "Write unit tests for application logic and integration tests for API and database behavior",
        "Wrote Vitest unit coverage for pricing rules and Supertest integration coverage for REST endpoints backed by a test database."
      ) > 0,
  },
  {
    name: "missing end-to-end tests cannot be covered",
    expected: false,
    actual: window.GapcheckNano.testHooks.coveredPass2EvidenceIsComplete(
      "Maintain useful unit, integration, and end-to-end automated tests",
      ["Added Jest unit tests and a small set of API integration tests after implementation."]
    ),
  },
  {
    name: "receiving review does not prove pairing",
    expected: false,
    actual: window.GapcheckNano.testHooks.coveredPass2EvidenceIsComplete(
      "Pair with developers and give and receive constructive code review through Git pull requests",
      ["Used Git pull requests, responded to senior-review feedback, and joined sprint planning with a product manager and designer."]
    ),
  },
  {
    name: "direct PostgreSQL action evidence can repair a gap",
    expected: true,
    actual: window.GapcheckNano.testHooks.pass2EvidenceDirectlyCoversRequirement(
      "Model and query application data in PostgreSQL",
      ["Added Node.js and Express endpoints for shipment exceptions and wrote PostgreSQL queries and migrations for the supporting data."]
    ),
  },
  {
    name: "skills-only evidence cannot be promoted to covered experience",
    expected: false,
    actual: window.GapcheckNano.testHooks.pass2EvidenceDirectlyCoversRequirement(
      "Build responsive and accessible user interfaces with HTML, CSS, TypeScript, and React",
      ["Skills HTML, CSS, JavaScript, introductory TypeScript, React basics, Git, Jest, SQLite"]
    ),
  },
  {
    name: "title citation is replaced with direct PostgreSQL evidence",
    expected: true,
    actual:
      normalizedEvidenceFixture[0].matchedBullets.includes(postgresEvidence) &&
      !normalizedEvidenceFixture[0].matchedBullets.includes(
        "Junior Software Developer"
      ),
  },
  {
    name: "unrelated testing citation is replaced",
    expected: true,
    actual:
      normalizedEvidenceFixture[1].matchedBullets.includes(testingEvidence) &&
      !normalizedEvidenceFixture[1].matchedBullets.includes(diagnosisEvidence),
  },
  {
    name: "work constraint is normalized to unknown without evidence",
    expected: true,
    actual:
      normalizedEvidenceFixture[2].status === "unknown" &&
      normalizedEvidenceFixture[2].matchedBullets.length === 0,
  },
  {
    name: "explicit constraint match remains unknown and unscored",
    expected: true,
    actual: constraintIsUnknownAndUnscored(
      explicitConstraintMatchFixture[0]
    ),
  },
  {
    name: "explicit constraint conflict remains unknown and unscored",
    expected: true,
    actual: constraintIsUnknownAndUnscored(
      explicitConstraintConflictFixture[0]
    ),
  },
  {
    name: "missing constraint information remains unknown and unscored",
    expected: true,
    actual: constraintIsUnknownAndUnscored(
      missingConstraintInformationFixture[0]
    ),
  },
  {
    name: "duration combines role, dates, and substantive evidence",
    expected: true,
    actual:
      normalizedDurationFixture[0].status === "covered" &&
      normalizedDurationFixture[0].matchedBullets.includes(
        "March 2024 to present"
      ) &&
      normalizedDurationFixture[0].matchedBullets.includes(
        "Built responsive React and TypeScript screens for a parcel-routing dashboard."
      ),
  },
].map((result) => {
  return {
    ...result,
    passed: result.actual === result.expected,
  };
});

const allResults = [
  ...results,
  ...sourceTypeResults,
  ...requirementMetadataResults,
  ...evidenceResults,
];
const failures = allResults.filter((result) => !result.passed);
const reportLines = allResults.map((result) => {
  const mark = result.passed ? "PASS" : "FAIL";
  return `${mark} ${result.name}: expected ${result.expected}, got ${result.actual}`;
});

if (testOutput) {
  testOutput.textContent = reportLines.join("\n");
}

if (failures.length > 0) {
  throw new Error(`${failures.length} scoring test(s) failed.`);
}

console.log("GapCheck scoring tests passed.", allResults);
