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

const summaryResults = [
  {
    name: "summary names covered strengths and prioritizes high-severity gaps",
    expected:
      "Clear alignment: Build TypeScript applications; Work with PostgreSQL. Main gaps: Use a modern testing framework; Deploy to cloud infrastructure.",
    actual: window.GapcheckNano.testHooks.createMatchSummary([
      {
        requirement: "Build TypeScript applications.",
        status: "covered",
        matchedBullets: ["Built TypeScript applications."],
        severity: null,
        sourceType: "required-qualification",
        qualifier: "required",
      },
      {
        requirement: "Deploy to cloud infrastructure.",
        status: "gap",
        matchedBullets: [],
        severity: "medium",
        sourceType: "core-responsibility",
        qualifier: null,
      },
      {
        requirement: "Use a modern testing framework.",
        status: "gap",
        matchedBullets: [],
        severity: "high",
        sourceType: "required-qualification",
        qualifier: "required",
      },
      {
        requirement: "Work with PostgreSQL.",
        status: "covered",
        matchedBullets: ["Wrote PostgreSQL queries."],
        severity: null,
        sourceType: "required-qualification",
        qualifier: "required",
      },
    ]),
  },
  {
    name: "summary explains an all-partial result without claiming full alignment",
    expected:
      "The resume shows relevant experience, but the evidence is only partial. Areas needing clearer evidence: Build accessible interfaces.",
    actual: window.GapcheckNano.testHooks.createMatchSummary([
      {
        requirement: "Build accessible interfaces.",
        status: "partial",
        matchedBullets: ["Built responsive interfaces."],
        severity: "medium",
        sourceType: "core-responsibility",
        qualifier: null,
      },
    ]),
  },
  {
    name: "summary distinguishes unscored constraints from resume gaps",
    expected:
      "Work or application constraints were identified, but no resume-match requirements were scored.",
    actual: window.GapcheckNano.testHooks.createMatchSummary([
      {
        requirement: "Work from the office two days per week.",
        status: "unknown",
        matchedBullets: [],
        severity: null,
        sourceType: "work-application-constraint",
        qualifier: "required",
      },
    ]),
  },
].map((result) => ({
  ...result,
  passed: result.actual === result.expected,
}));

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

const implicitListJobText = [
  "About The Role",
  "",
  "What You'll Do",
  "",
  "Build and maintain production services through architecture, containerization, CI/CD, monitoring, and incident repair.",
  "Integrate governed content from documentation, identity, and service-desk systems.",
  "",
  "What We're Looking For",
  "",
  "Build, deploy, and maintain production applications using Git, CI/CD pipelines, and containerization.",
  "Understand databases, APIs, authentication, hosting, deployment pipelines, and Python.",
  "",
  "Why You'll Love This Role",
  "",
  "Visible impact across the company.",
].join("\n");
const labeledImplicitListJob =
  window.GapcheckNano.testHooks.labelExplicitJobBullets(implicitListJobText);
const roleAndQualificationBoundaryJobText = [
  "About The Role",
  "You will translate customer needs into maintainable product features.",
  "- Build and maintain production APIs with guidance from senior engineers.",
  "",
  "Minimum Qualifications",
  "About five years of relevant software experience is preferred.",
  "Experience configuring E-Verify integrations is required.",
  "We are an equal opportunity employer committed to every protected class.",
  "Experience working with employment agencies on product integrations is helpful.",
  "About Copper Finch Labs",
  "Copper Finch Labs builds scheduling software for local service businesses.",
].join("\n");
const labeledRoleAndQualificationBoundaryJob =
  window.GapcheckNano.testHooks.labelExplicitJobBullets(
    roleAndQualificationBoundaryJobText
  );
const separatelyGroupedImplicitItems =
  window.GapcheckNano.testHooks.mergeRelatedPass1RequirementsToLimit(
    [
      "Own service architecture and containerization",
      "Maintain CI/CD monitoring and production repair",
      "Integrate governed documentation and identity content",
      "Connect service-desk systems",
      "Build and maintain production applications",
      "Use Git and CI/CD pipelines",
      "Apply production application containerization",
      "Understand databases APIs and authentication",
      "Understand hosting deployment pipelines and Python",
    ],
    implicitListJobText
  );
const proseSentenceJobText = [
  "About The Role",
  "",
  "You will build, deploy, and maintain production applications. You will translate stakeholder requirements into technical systems. You will design reliability controls for multi-model services.",
].join("\n");
const separatelyGroupedProseSentences =
  window.GapcheckNano.testHooks.mergeRelatedPass1RequirementsToLimit(
    [
      "Build production applications",
      "Deploy production applications",
      "Maintain production applications",
      "Ship production software",
      "Support deployed applications",
      "Maintain application releases",
      "Build deployed software",
      "Translate stakeholder requirements",
      "Turn stakeholder needs into systems",
      "Understand business requirements",
      "Design technical systems",
      "Scope stakeholder problems",
      "Translate business needs",
      "Build stakeholder solutions",
      "Design reliability controls",
      "Support multi-model services",
      "Build service fallback controls",
      "Maintain model reliability",
      "Validate model service output",
      "Monitor reliability controls",
      "Design multi-model infrastructure",
    ],
    proseSentenceJobText
  );
const lateLongInputRequirement =
  "Candidates must hold a commercial pilot license.";
const longInputJobText = [
  "About the company",
  "Northstar builds workflow software for regional organizations. ".repeat(125),
  "Qualifications",
  lateLongInputRequirement,
].join("\n\n");
const longInputPlan =
  window.GapcheckNano.testHooks.splitJobTextForPass1(longInputJobText);
const oversizedInputPlan =
  window.GapcheckNano.testHooks.splitJobTextForPass1(
    "Additional company and benefits information. ".repeat(700)
  );
const consolidatedLongInputRequirements =
  window.GapcheckNano.testHooks.consolidatePass1ChunkExtractions(
    [
      {
        eligibilityRequirements: [
          {
            requirement: "Five years of software operations experience is required.",
            qualifier: "required",
          },
        ],
        responsibilities: [],
      },
      {
        eligibilityRequirements: [
          {
            requirement: lateLongInputRequirement,
            qualifier: "required",
          },
        ],
        responsibilities: [],
      },
    ],
    longInputPlan.chunks.join("\n\n")
  );
const consolidatedLateRequirement = consolidatedLongInputRequirements.find(
  (requirement) => {
    return requirement.text.replace(/[.;]\s*$/, "") ===
      lateLongInputRequirement.replace(/[.;]\s*$/, "");
  }
);
const pass1GroupingResults = [
  {
    name: "implicit list lines receive source bullet boundaries",
    expected: 4,
    actual:
      labeledImplicitListJob.match(
        /\[SOURCE BULLET J\d+ - KEEP AS ONE REQUIREMENT\]/g
      )?.length || 0,
  },
  {
    name: "about-the-role prose remains available to requirement extraction",
    expected: true,
    actual: labeledRoleAndQualificationBoundaryJob.includes(
      "You will translate customer needs into maintainable product features."
    ),
  },
  {
    name: "explicit role bullets remain labeled after an about-the-role heading",
    expected: true,
    actual: /\[SOURCE BULLET J\d+ - KEEP AS ONE REQUIREMENT\] Build and maintain production APIs/.test(
      labeledRoleAndQualificationBoundaryJob
    ),
  },
  {
    name: "about-duration qualifications are not mistaken for company headings",
    expected: true,
    actual: /\[SOURCE BULLET J\d+ - KEEP AS ONE REQUIREMENT\] About five years of relevant software experience/.test(
      labeledRoleAndQualificationBoundaryJob
    ),
  },
  {
    name: "legitimate E-Verify qualifications remain labeled",
    expected: true,
    actual: /\[SOURCE BULLET J\d+ - KEEP AS ONE REQUIREMENT\] Experience configuring E-Verify integrations/.test(
      labeledRoleAndQualificationBoundaryJob
    ),
  },
  {
    name: "legal boilerplate is removed without closing the qualification list",
    expected: true,
    actual:
      !labeledRoleAndQualificationBoundaryJob.includes(
        "equal opportunity employer"
      ) &&
      /\[SOURCE BULLET J\d+ - KEEP AS ONE REQUIREMENT\] Experience working with employment agencies/.test(
        labeledRoleAndQualificationBoundaryJob
      ),
  },
  {
    name: "named company headings close qualification lists without hiding company context",
    expected: true,
    actual:
      labeledRoleAndQualificationBoundaryJob.includes(
        "Copper Finch Labs builds scheduling software"
      ) &&
      !/\[SOURCE BULLET J\d+ - KEEP AS ONE REQUIREMENT\] Copper Finch Labs builds scheduling software/.test(
        labeledRoleAndQualificationBoundaryJob
      ),
  },
  {
    name: "implicit source items consolidate fragments independently",
    expected: 4,
    actual: separatelyGroupedImplicitItems.length,
  },
  {
    name: "separate implicit responsibilities are not merged together",
    expected: false,
    actual: separatelyGroupedImplicitItems.some((requirement) => {
      return /containerization/i.test(requirement) &&
        /governed documentation/i.test(requirement);
    }),
  },
  {
    name: "separate prose sentences are not merged into one mega-requirement",
    expected: false,
    actual: separatelyGroupedProseSentences.some((requirement) => {
      return /production applications/i.test(requirement) &&
        /stakeholder requirements/i.test(requirement);
    }),
  },
  {
    name: "long posting fixture places an important requirement after character 6000",
    expected: true,
    actual:
      longInputJobText.indexOf(lateLongInputRequirement) >
      window.GapcheckNano.pass1ChunkCharLimit,
  },
  {
    name: "long postings are divided into bounded Pass 1 sections",
    expected: true,
    actual:
      longInputPlan.chunks.length > 1 &&
      longInputPlan.chunks.every((chunk) => {
        return chunk.length <= window.GapcheckNano.pass1ChunkCharLimit;
      }),
  },
  {
    name: "important requirements after the first Pass 1 boundary are retained",
    expected: true,
    actual:
      longInputPlan.excludedCharCount === 0 &&
      longInputPlan.chunks.some((chunk) => {
        return chunk.includes(lateLongInputRequirement);
      }),
  },
  {
    name: "cross-section consolidation preserves late requirement metadata",
    expected: "required-qualification|required",
    actual: consolidatedLateRequirement
      ? `${consolidatedLateRequirement.sourceType}|${consolidatedLateRequirement.qualifier}`
      : "missing",
  },
  {
    name: "extreme inputs remain bounded and report excluded characters",
    expected: true,
    actual:
      oversizedInputPlan.analyzedCharCount <=
        window.GapcheckNano.pass1TotalJobTextCharLimit &&
      oversizedInputPlan.excludedCharCount > 0 &&
      oversizedInputPlan.chunks.every((chunk) => {
        return chunk.length <= window.GapcheckNano.pass1ChunkCharLimit;
      }),
  },
].map((result) => ({
  ...result,
  passed: result.actual === result.expected,
}));

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
const languagesEvidence =
  "Languages: TypeScript, JavaScript, Python, HTML / CSS, Java, Apex, SOQL";
const languageListGapRecoveryFixture =
  window.GapcheckNano.testHooks.normalizePass2EvidenceForTesting(
    [
      "Develop front-end application features using HTML",
      "Experience with HTML5",
    ],
    [languagesEvidence],
    [
      {
        requirement: "Develop front-end application features using HTML",
        status: "gap",
        matchedBullets: [],
        severity: "medium",
      },
      {
        requirement: "Experience with HTML5",
        status: "gap",
        matchedBullets: [],
        severity: "medium",
      },
    ]
  );
const basicHtmlClassificationFixture =
  window.GapcheckNano.testHooks.normalizePass2EvidenceForTesting(
    ["Build websites with HTML", "Know basic HTML"],
    [languagesEvidence],
    [
      {
        requirement: "Build websites with HTML",
        status: "covered",
        matchedBullets: [languagesEvidence],
        severity: null,
      },
      {
        requirement: "Know basic HTML",
        status: "partial",
        matchedBullets: [languagesEvidence],
        severity: "low",
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
const explicitEngineeringEvidenceFixture =
  window.GapcheckNano.testHooks.normalizePass2EvidenceForTesting(
    [
      "Understanding of version control (Git/GitHub).",
      "Experience with CI/CD pipelines.",
      "Experience with containerization.",
      "Knowledge of software deployment and maintenance.",
      "Comfortable in Python for production services and able to apply sound systems judgment.",
      "Experience with Terraform.",
      "Design resilience controls for inference services, including fallback routing and circuit breakers.",
    ],
    [
      "Technical Skills: Python, Podman, Git, Jenkins, MariaDB",
      "Built Python release-check automation in Jenkins, publishing test reports and enforcing deployment gates.",
      "Develop and maintain production applications, shipping features across multiple release cycles.",
      "Uses consumer AI coding assistants daily.",
    ],
    [
      {
        requirement: "Understanding of version control (Git/GitHub).",
        status: "gap",
        matchedBullets: [],
        severity: "medium",
      },
      {
        requirement: "Experience with CI/CD pipelines.",
        status: "gap",
        matchedBullets: [],
        severity: "medium",
      },
      {
        requirement: "Experience with containerization.",
        status: "gap",
        matchedBullets: [],
        severity: "medium",
      },
      {
        requirement: "Knowledge of software deployment and maintenance.",
        status: "gap",
        matchedBullets: [],
        severity: "medium",
      },
      {
        requirement:
          "Comfortable in Python for production services and able to apply sound systems judgment.",
        status: "gap",
        matchedBullets: [],
        severity: "medium",
      },
      {
        requirement: "Experience with Terraform.",
        status: "gap",
        matchedBullets: [],
        severity: "medium",
      },
      {
        requirement:
          "Design resilience controls for inference services, including fallback routing and circuit breakers.",
        status: "gap",
        matchedBullets: [],
        severity: "medium",
      },
    ]
  );
const unsupportedSpecializedEvidenceFixture =
  window.GapcheckNano.testHooks.normalizePass2EvidenceForTesting(
    [
      "Enforce regulated-record access controls across identity and data-classification systems.",
      "Design resilience controls for inference services, including schema validation, fallback routing, and circuit breakers.",
    ],
    [
      "Summary Software engineer experienced with production applications and daily use of AI-assisted development tools.",
      "Uses consumer AI coding assistants daily.",
    ],
    [
      {
        requirement:
          "Enforce regulated-record access controls across identity and data-classification systems.",
        status: "partial",
        matchedBullets: [
          "Summary Software engineer experienced with production applications and daily use of AI-assisted development tools.",
        ],
        severity: "medium",
      },
      {
        requirement:
          "Design resilience controls for inference services, including schema validation, fallback routing, and circuit breakers.",
        status: "partial",
        matchedBullets: [
          "Summary Software engineer experienced with production applications and daily use of AI-assisted development tools.",
        ],
        severity: "medium",
      },
    ]
  );
const directPartialPromotionFixture =
  window.GapcheckNano.testHooks.normalizePass2EvidenceForTesting(
    [
      "Build, deploy, and maintain production applications.",
      "Comfortable in Python.",
      "Experience with containerization.",
    ],
    [
      "Develop and maintain production applications, shipping production features across multiple release cycles.",
      "Built Python release-check automation in deployment pipelines.",
      "Technical Skills: Python, Podman, Git, Jenkins",
    ],
    [
      {
        requirement: "Build, deploy, and maintain production applications.",
        status: "partial",
        matchedBullets: [
          "Develop and maintain production applications, shipping production features across multiple release cycles.",
        ],
        severity: "low",
      },
      {
        requirement: "Comfortable in Python.",
        status: "partial",
        matchedBullets: [
          "Built Python release-check automation in deployment pipelines.",
        ],
        severity: "medium",
      },
      {
        requirement: "Experience with containerization.",
        status: "partial",
        matchedBullets: [
          "Technical Skills: Python, Podman, Git, Jenkins",
        ],
        severity: "medium",
      },
    ]
  );
const productOperationsRequirements = [
  "Candidates should be able to create adaptable, repeatable processes for roadmap intake, release readiness, customer feedback triage, and post-launch measurement",
  "They must be able to document decisions, maintain clear owners and next steps, and follow through consistently",
  "Strong written communication is important because recommendations must be concise and useful to stakeholders who cannot review every raw data source or meeting note",
  "Strong cross-functional collaboration is required",
  "Candidates should have at least five years of experience in product operations, business operations, product analytics, program management, consulting, or a similar role supporting software teams",
  "Identify patterns, surface risks early, and help teams decide where process, tooling, or communication changes will have the greatest impact.",
  "Coordinate launches across product, engineering, customer-facing teams, and operational stakeholders.",
  "Experience supporting agile product teams, working with Jira or Linear, maintaining documentation in Confluence or Notion, and coordinating release planning across multiple teams is preferred",
  "Candidates do not need to be data scientists, but they should be comfortable querying or analyzing data, finding inconsistencies, and explaining what the numbers do and do not prove; SQL experience is strongly preferred; Experience with a BI tool such as Looker, Tableau, Mode, or Power BI is helpful; Strong spreadsheet skills are needed for quick analysis, scenario modeling, and operational tracking; Candidates should be able to combine quantitative findings with qualitative customer feedback instead of relying on a single source",
  "Prepare launch checklists, track dependencies, confirm enablement materials, monitor early adoption, and coordinate follow-up when customers experience confusion or friction.",
];
const productOperationsEvidence = [
  "PRODUCT OPERATIONS MANAGER",
  "Brightline Care Software | 2022-2026",
  "Introduced a structured intake workflow that consolidated requests from sales, support, and implementation, cutting duplicate submissions by 35 percent.",
  "Built Looker dashboards with SQL to track activation, feature adoption, and workflow completion after releases.",
  "Paired usage trends with interview notes and support themes to explain why customers abandoned a new referral workflow and recommend corrective changes.",
  "Owned readiness reviews for monthly releases, bringing engineering, product, design, training, support, and implementation leads together around risks and unresolved dependencies.",
  "Created reusable Jira templates and Notion playbooks for beta enrollment, launch approvals, customer communications, and post-release follow-up.",
  "Redesigned the feedback-triage process and established service levels for reviewing, grouping, and routing customer-reported problems.",
  "Prepared short decision memos for directors that distinguished confirmed findings from assumptions and identified decisions requiring escalation.",
  "Facilitated quarterly planning and roadmap-review sessions, recording owners, deadlines, tradeoffs, and unresolved questions.",
  "PRODUCT OPERATIONS ANALYST",
  "Fieldstone Workflow Systems | 2019-2022",
  "Coordinated pilot programs and release retrospectives across two agile product teams using Jira and Confluence.",
  "Wrote implementation summaries and enablement notes for customer-facing teams before major releases.",
  "Investigated inconsistent data across billing, CRM, and analytics systems and clearly documented the limitations of the resulting analysis.",
  "Used advanced spreadsheets for capacity planning, cohort comparisons, scenario models, and weekly operational reporting.",
  "Coordinated corrective action when early usage data and customer reports revealed confusion in a clinical scheduling feature.",
];
const productOperationsEvidenceFixture =
  window.GapcheckNano.testHooks.normalizePass2EvidenceForTesting(
    productOperationsRequirements,
    productOperationsEvidence,
    [
      {
        requirement: productOperationsRequirements[0],
        status: "partial",
        matchedBullets: [productOperationsEvidence[6]],
        severity: "medium",
      },
      {
        requirement: productOperationsRequirements[1],
        status: "covered",
        matchedBullets: [productOperationsEvidence[14]],
        severity: null,
      },
      {
        requirement: productOperationsRequirements[2],
        status: "covered",
        matchedBullets: [productOperationsEvidence[4]],
        severity: null,
      },
      {
        requirement: productOperationsRequirements[3],
        status: "partial",
        matchedBullets: [productOperationsEvidence[4]],
        severity: "medium",
      },
      {
        requirement: productOperationsRequirements[4],
        status: "partial",
        matchedBullets: [
          productOperationsEvidence[6],
          productOperationsEvidence[1],
          productOperationsEvidence[11],
        ],
        severity: "low",
      },
      {
        requirement: productOperationsRequirements[5],
        status: "gap",
        matchedBullets: [],
        severity: "medium",
      },
      {
        requirement: productOperationsRequirements[6],
        status: "partial",
        matchedBullets: [productOperationsEvidence[3]],
        severity: "medium",
      },
      {
        requirement: productOperationsRequirements[7],
        status: "covered",
        matchedBullets: [
          productOperationsEvidence[12],
          productOperationsEvidence[3],
        ],
        severity: null,
      },
      {
        requirement: productOperationsRequirements[8],
        status: "covered",
        matchedBullets: [productOperationsEvidence[4]],
        severity: null,
      },
      {
        requirement: productOperationsRequirements[9],
        status: "covered",
        matchedBullets: [productOperationsEvidence[16]],
        severity: null,
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
    name: "contact details are context only",
    expected: true,
    actual: window.GapcheckNano.testHooks.isPass2HeadingOnlyEvidence(
      "candidate@example.com – 555-010-2020 – github.com/candidate"
    ),
  },
  {
    name: "languages list is substantive skill evidence",
    expected: false,
    actual: window.GapcheckNano.testHooks.isPass2HeadingOnlyEvidence(
      "Languages: TypeScript, JavaScript, Python, HTML / CSS, Java, Apex, SOQL"
    ),
  },
  {
    name: "common technology list labels are substantive skill evidence",
    expected: true,
    actual: [
      "Programming Languages: JavaScript, Python",
      "Technologies: HTML, CSS, React",
      "Tools & Technologies: Git, Docker, AWS",
      "Frameworks & Libraries: React, Express",
      "Databases: PostgreSQL, SQLite",
      "Core Competencies: Accessibility, Responsive Design",
    ].every((evidenceText) => {
      return !window.GapcheckNano.testHooks.isPass2HeadingOnlyEvidence(
        evidenceText
      );
    }),
  },
  {
    name: "HTML in a languages list repairs an incorrect model gap",
    expected: "partial",
    actual: languageListGapRecoveryFixture[0].status,
  },
  {
    name: "HTML in a languages list supports an HTML5 requirement",
    expected: "partial",
    actual: languageListGapRecoveryFixture[1].status,
  },
  {
    name: "skills-only HTML evidence is cited but not overstated as experience",
    expected: true,
    actual:
      languageListGapRecoveryFixture[0].matchedBullets.includes(
        languagesEvidence
      ) && languageListGapRecoveryFixture[0].status !== "covered",
  },
  {
    name: "skills list does not fully prove building websites",
    expected: "partial",
    actual: basicHtmlClassificationFixture[0].status,
  },
  {
    name: "skills list directly covers basic HTML knowledge",
    expected: "covered",
    actual: basicHtmlClassificationFixture[1].status,
  },
  {
    name: "session creation failure is recognized as a model runtime error",
    expected: true,
    actual: window.GapcheckNano.testHooks.isLanguageModelRuntimeError(
      new Error(
        "The device is unable to create a session to run the model. Please check the result of availability() first."
      )
    ),
  },
  {
    name: "ordinary model output errors are not runtime availability errors",
    expected: false,
    actual: window.GapcheckNano.testHooks.isLanguageModelRuntimeError(
      new Error("Pass 1 returned invalid JSON.")
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
  {
    name: "explicit Git evidence cannot remain a gap",
    expected: true,
    actual:
      explicitEngineeringEvidenceFixture[0].status !== "gap" &&
      explicitEngineeringEvidenceFixture[0].matchedBullets.length > 0,
  },
  {
    name: "explicit CI/CD pipeline evidence cannot remain a gap",
    expected: true,
    actual:
      explicitEngineeringEvidenceFixture[1].status !== "gap" &&
      explicitEngineeringEvidenceFixture[1].matchedBullets.length > 0,
  },
  {
    name: "explicit Docker evidence cannot remain a containerization gap",
    expected: true,
    actual:
      explicitEngineeringEvidenceFixture[2].status !== "gap" &&
      explicitEngineeringEvidenceFixture[2].matchedBullets.length > 0,
  },
  {
    name: "explicit deployment evidence cannot remain a deployment gap",
    expected: true,
    actual:
      explicitEngineeringEvidenceFixture[3].status !== "gap" &&
      explicitEngineeringEvidenceFixture[3].matchedBullets.length > 0,
  },
  {
    name: "explicit Python action evidence cannot remain a compound Python gap",
    expected: true,
    actual:
      explicitEngineeringEvidenceFixture[4].status !== "gap" &&
      explicitEngineeringEvidenceFixture[4].matchedBullets.length > 0,
  },
  {
    name: "unmentioned named infrastructure tool remains a gap",
    expected: "gap",
    actual: explicitEngineeringEvidenceFixture[5].status,
  },
  {
    name: "AI tool usage does not prove inference-service reliability engineering",
    expected: "gap",
    actual: explicitEngineeringEvidenceFixture[6].status,
  },
  {
    name: "AI tool usage does not support regulated-record governance",
    expected: "gap",
    actual: unsupportedSpecializedEvidenceFixture[0].status,
  },
  {
    name: "AI tool usage cannot keep an inference-service reliability partial",
    expected: "gap",
    actual: unsupportedSpecializedEvidenceFixture[1].status,
  },
  {
    name: "compound production lifecycle evidence is not overpromoted",
    expected: "partial",
    actual: directPartialPromotionFixture[0].status,
  },
  {
    name: "action-based Python evidence promotes a simple Python partial",
    expected: "covered",
    actual: directPartialPromotionFixture[1].status,
  },
  {
    name: "skills-only Docker evidence remains partial",
    expected: "partial",
    actual: directPartialPromotionFixture[2].status,
  },
  {
    name: "strong product operations process lifecycle is covered across bullets",
    expected: "covered",
    actual: productOperationsEvidenceFixture[0].status,
  },
  {
    name: "decision documentation combines ownership and follow-through evidence",
    expected: "covered",
    actual: productOperationsEvidenceFixture[1].status,
  },
  {
    name: "written decision artifacts cover written communication",
    expected: "covered",
    actual: productOperationsEvidenceFixture[2].status,
  },
  {
    name: "interview notes alone do not remain written communication evidence",
    expected: false,
    actual: productOperationsEvidenceFixture[2].matchedBullets.includes(
      productOperationsEvidence[4]
    ),
  },
  {
    name: "multi-function readiness reviews cover cross-functional collaboration",
    expected: "covered",
    actual: productOperationsEvidenceFixture[3].status,
  },
  {
    name: "multiple dated product operations roles cover required duration",
    expected: "covered",
    actual: productOperationsEvidenceFixture[4].status,
  },
  {
    name: "duration replaces weak citations with software-team role evidence",
    expected: true,
    actual:
      productOperationsEvidenceFixture[4].matchedBullets.includes(
        productOperationsEvidence[5]
      ) ||
      productOperationsEvidenceFixture[4].matchedBullets.includes(
        productOperationsEvidence[12]
      ),
  },
  {
    name: "trend risk and recommendation evidence covers pattern-driven decisions",
    expected: "covered",
    actual: productOperationsEvidenceFixture[5].status,
  },
  {
    name: "functional equivalents cover cross-functional launch audiences",
    expected: "covered",
    actual: productOperationsEvidenceFixture[6].status,
  },
  {
    name: "irrelevant dashboard citation is removed from agile evidence",
    expected: false,
    actual: productOperationsEvidenceFixture[7].matchedBullets.includes(
      productOperationsEvidence[3]
    ),
  },
  {
    name: "quantitative and qualitative analysis is covered across complementary bullets",
    expected: "covered",
    actual: productOperationsEvidenceFixture[8].status,
  },
  {
    name: "compound analytics citations retain SQL BI spreadsheet and inconsistency evidence",
    expected: true,
    actual:
      productOperationsEvidenceFixture[8].matchedBullets.includes(
        productOperationsEvidence[3]
      ) &&
      productOperationsEvidenceFixture[8].matchedBullets.includes(
        productOperationsEvidence[4]
      ) &&
      productOperationsEvidenceFixture[8].matchedBullets.includes(
        productOperationsEvidence[14]
      ) &&
      productOperationsEvidenceFixture[8].matchedBullets.includes(
        productOperationsEvidence[15]
      ),
  },
  {
    name: "launch lifecycle is covered only after complementary evidence is assembled",
    expected: "covered",
    actual: productOperationsEvidenceFixture[9].status,
  },
  {
    name: "launch lifecycle retains explicit enablement artifact evidence",
    expected: true,
    actual: productOperationsEvidenceFixture[9].matchedBullets.includes(
      productOperationsEvidence[13]
    ),
  },
  {
    name: "corrective action alone does not cover the launch lifecycle",
    expected: false,
    actual: window.GapcheckNano.testHooks.pass2EvidenceDirectlyCoversRequirement(
      productOperationsRequirements[9],
      [productOperationsEvidence[16]]
    ),
  },
  {
    name: "incomplete process lifecycle evidence is not overpromoted",
    expected: false,
    actual: window.GapcheckNano.testHooks.pass2EvidenceDirectlyCoversRequirement(
      productOperationsRequirements[0],
      [productOperationsEvidence[6]]
    ),
  },
  {
    name: "unrelated customer coordination is not cross-functional collaboration",
    expected: false,
    actual: window.GapcheckNano.testHooks.pass2EvidenceDirectlyCoversRequirement(
      productOperationsRequirements[3],
      [
        "Communicated with front-of-house staff about allergens, sell-out timing, product descriptions, and customer pickup details.",
      ]
    ),
  },
  {
    name: "customer-facing launch evidence alone does not cover every audience",
    expected: false,
    actual: window.GapcheckNano.testHooks.pass2EvidenceDirectlyCoversRequirement(
      productOperationsRequirements[6],
      [productOperationsEvidence[13]]
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
  ...summaryResults,
  ...sourceTypeResults,
  ...requirementMetadataResults,
  ...pass1GroupingResults,
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
