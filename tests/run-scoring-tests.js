const fs = require("node:fs");
const vm = require("node:vm");

const testOutput = { textContent: "" };
const context = {
  console: {
    error: console.error,
    info() {},
    log() {},
    warn: console.warn,
  },
  document: {
    getElementById(id) {
      return id === "testOutput" ? testOutput : null;
    },
  },
  localStorage: {
    getItem() {
      return null;
    },
    removeItem() {},
    setItem() {},
  },
  window: {},
};

context.globalThis = context;
vm.createContext(context);

try {
  for (const file of [
    "nano.js",
    "tests/benchmark-scoring.js",
    "tests/scoring.test.js",
    "tests/score-sensitivity.test.js",
    "tests/requirement-aware-scoring.test.js",
    "tests/model-output-retry.test.js",
  ]) {
    const source = fs.readFileSync(file, "utf8");
    vm.runInContext(source, context, { filename: file });
  }
} catch (error) {
  process.stdout.write(`${testOutput.textContent}\n`);
  throw error;
}

const retryTestPromise = context.window.GapcheckModelOutputRetryTestPromise;

Promise.resolve(retryTestPromise).then(() => {
  process.stdout.write(`${testOutput.textContent}\n`);

const pinnedRequirementCounts = fs
  .readdirSync("tests/fixtures", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const fixturePath =
      `tests/fixtures/${entry.name}/pinned-requirements.json`;

    if (!fs.existsSync(fixturePath)) {
      return null;
    }

    const requirements = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

    if (!Array.isArray(requirements)) {
      throw new Error(`${fixturePath} must contain an array.`);
    }

    const sourceTypes = new Set([
      "required-qualification",
      "preferred-qualification",
      "core-responsibility",
      "work-application-constraint",
    ]);
    const qualifiers = new Set([
      "required",
      "preferred",
      "desirable",
      "plus",
      "not-required",
      null,
    ]);
    const malformedRequirement = requirements.find((requirement) => {
      return !requirement ||
        typeof requirement !== "object" ||
        Array.isArray(requirement) ||
        typeof requirement.text !== "string" ||
        requirement.text.trim().length === 0 ||
        !sourceTypes.has(requirement.sourceType) ||
        !qualifiers.has(requirement.qualifier);
    });

    if (malformedRequirement) {
      throw new Error(
        `${fixturePath} contains malformed pinned requirement metadata.`
      );
    }

    return {
      family: entry.name,
      count: requirements.length,
    };
  })
  .filter(Boolean);

const cappedFixture = pinnedRequirementCounts.find(
  (fixture) => fixture.count >= context.window.GapcheckNano.pass1MaxRequirements
);

if (cappedFixture) {
  throw new Error(
    `${cappedFixture.family} reaches the production requirement cap with ${cappedFixture.count} pinned items.`
  );
}

process.stdout.write(
  `PASS sensitivity audit: representative pinned sets remain below the 20-item cap (${pinnedRequirementCounts
    .map((fixture) => `${fixture.family}: ${fixture.count}`)
    .join(", ")}).\n`
);
}).catch((error) => {
  process.stdout.write(`${testOutput.textContent}\n`);
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
