// @ts-check

const testOutput = document.getElementById("testOutput");

/**
 * @typedef {"covered" | "partial" | "gap"} MatchStatus
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
];

const failures = results.filter((result) => !result.passed);
const reportLines = results.map((result) => {
  const mark = result.passed ? "PASS" : "FAIL";
  return `${mark} ${result.name}: expected ${result.expected}, got ${result.actual}`;
});

if (testOutput) {
  testOutput.textContent = reportLines.join("\n");
}

if (failures.length > 0) {
  throw new Error(`${failures.length} scoring test(s) failed.`);
}

console.log("GapCheck scoring tests passed.", results);
