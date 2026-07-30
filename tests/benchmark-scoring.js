// @ts-check

/**
 * Comparison-only scoring formulas for Phase 6 calibration. The extension
 * continues to use GapcheckNano.computeOverallScore until benchmark evidence
 * supports adopting one of these candidates.
 */

const BENCHMARK_STATUS_VALUES = Object.freeze({
  covered: 1,
  partial: 0.5,
  gap: 0,
  unknown: 0,
});

const BENCHMARK_SOURCE_WEIGHTS = Object.freeze({
  "required-qualification": 1,
  "preferred-qualification": 0.5,
  "core-responsibility": 0.75,
  "work-application-constraint": 0,
});

const BENCHMARK_SEVERITY_WEIGHTS = Object.freeze({
  low: 0.5,
  medium: 1,
  high: 1.5,
});

const BENCHMARK_SCORE_VARIANT_LABELS = Object.freeze({
  statusOnly: "Status only",
  sourceWeighted: "Source weighted",
  severityWeighted: "Severity weighted",
  combined: "Combined",
});

/**
 * @typedef {"covered" | "partial" | "gap" | "unknown"} BenchmarkScoringStatus
 * @typedef {"required-qualification" | "preferred-qualification" | "core-responsibility" | "work-application-constraint"} BenchmarkScoringSourceType
 * @typedef {"low" | "medium" | "high"} BenchmarkScoringSeverity
 * @typedef {{ status: BenchmarkScoringStatus, sourceType: BenchmarkScoringSourceType, severity: BenchmarkScoringSeverity | null }} BenchmarkScoringMatch
 * @typedef {{ statusOnly: number, sourceWeighted: number, severityWeighted: number, combined: number }} CalibrationScoreVariants
 */

/**
 * @param {BenchmarkScoringMatch} match
 * @param {boolean} useSeverity
 * @returns {number}
 */
function getBenchmarkItemWeight(match, useSeverity) {
  if (match.status === "unknown") {
    return 0;
  }

  if (!useSeverity || match.status === "covered") {
    return 1;
  }

  return match.severity === null
    ? BENCHMARK_SEVERITY_WEIGHTS.medium
    : BENCHMARK_SEVERITY_WEIGHTS[match.severity];
}

/**
 * @param {BenchmarkScoringMatch[]} matches
 * @param {boolean} useSeverity
 * @returns {number}
 */
function computeBenchmarkItemMean(matches, useSeverity) {
  let weightedStatusTotal = 0;
  let weightTotal = 0;

  matches.forEach((match) => {
    const itemWeight = getBenchmarkItemWeight(match, useSeverity);

    weightedStatusTotal += BENCHMARK_STATUS_VALUES[match.status] * itemWeight;
    weightTotal += itemWeight;
  });

  return weightTotal === 0 ? 0 : weightedStatusTotal / weightTotal;
}

/**
 * Source-aware candidates normalize within source-type buckets before applying
 * bucket weights. This prevents a long responsibilities list from gaining
 * influence merely because it contains more extracted items.
 *
 * @param {BenchmarkScoringMatch[]} matches
 * @param {boolean} useSeverity
 * @returns {number}
 */
function computeBenchmarkSourceBucketScore(matches, useSeverity) {
  /** @type {Map<BenchmarkScoringSourceType, BenchmarkScoringMatch[]>} */
  const matchesBySource = new Map();

  matches.forEach((match) => {
    const sourceWeight = BENCHMARK_SOURCE_WEIGHTS[match.sourceType];

    if (match.status === "unknown" || sourceWeight === 0) {
      return;
    }

    const sourceMatches = matchesBySource.get(match.sourceType) || [];
    sourceMatches.push(match);
    matchesBySource.set(match.sourceType, sourceMatches);
  });

  let weightedBucketTotal = 0;
  let bucketWeightTotal = 0;

  matchesBySource.forEach((sourceMatches, sourceType) => {
    const sourceWeight = BENCHMARK_SOURCE_WEIGHTS[sourceType];
    weightedBucketTotal +=
      computeBenchmarkItemMean(sourceMatches, useSeverity) * sourceWeight;
    bucketWeightTotal += sourceWeight;
  });

  return bucketWeightTotal === 0
    ? 0
    : Math.round((weightedBucketTotal / bucketWeightTotal) * 100);
}

/**
 * @param {BenchmarkScoringMatch[]} matches
 * @returns {CalibrationScoreVariants}
 */
function computeBenchmarkScoreVariants(matches) {
  return {
    statusOnly: Math.round(computeBenchmarkItemMean(matches, false) * 100),
    sourceWeighted: computeBenchmarkSourceBucketScore(matches, false),
    severityWeighted: Math.round(
      computeBenchmarkItemMean(matches, true) * 100
    ),
    combined: computeBenchmarkSourceBucketScore(matches, true),
  };
}

(/** @type {Window & {
 *   GapcheckBenchmarkScoring?: {
 *     configuration: {
 *       statusValues: typeof BENCHMARK_STATUS_VALUES,
 *       sourceWeights: typeof BENCHMARK_SOURCE_WEIGHTS,
 *       severityWeights: typeof BENCHMARK_SEVERITY_WEIGHTS,
 *       variantLabels: typeof BENCHMARK_SCORE_VARIANT_LABELS,
 *       sourceAggregation: string
 *     },
 *     computeScoreVariants: typeof computeBenchmarkScoreVariants
 *   }
 * }} */ (window)).GapcheckBenchmarkScoring = Object.freeze({
  configuration: Object.freeze({
    statusValues: BENCHMARK_STATUS_VALUES,
    sourceWeights: BENCHMARK_SOURCE_WEIGHTS,
    severityWeights: BENCHMARK_SEVERITY_WEIGHTS,
    variantLabels: BENCHMARK_SCORE_VARIANT_LABELS,
    sourceAggregation: "normalize-within-source-buckets",
  }),
  computeScoreVariants: computeBenchmarkScoreVariants,
});
