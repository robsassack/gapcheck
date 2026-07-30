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
    "tests/scoring.test.js",
    "tests/score-sensitivity.test.js",
  ]) {
    const source = fs.readFileSync(file, "utf8");
    vm.runInContext(source, context, { filename: file });
  }
} catch (error) {
  process.stdout.write(`${testOutput.textContent}\n`);
  throw error;
}

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
