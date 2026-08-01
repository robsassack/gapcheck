// @ts-check

const modelOutputRetryTestWindow = /** @type {Window & {
 *   GapcheckModelOutputRetryTestPromise?: Promise<void>
 * }} */ (window);

modelOutputRetryTestWindow.GapcheckModelOutputRetryTestPromise = (async () => {
  const retry = /** @type {{
   *   GapcheckNano: {
   *     testHooks: {
   *       withModelOutputRetry: <T>(
   *         operation: (isRetry: boolean) => Promise<T>,
   *         label: string,
   *         options?: { retryOutputLimit?: boolean }
   *       ) => Promise<T>,
   *       runAdaptiveModelBatches: <TItem, TResult>(
   *         items: TItem[],
   *         operation: (batch: TItem[]) => Promise<TResult[]>,
   *         label: string
   *       ) => Promise<TResult[]>
   *     }
   *   }
   * }} */ (/** @type {unknown} */ (window)).GapcheckNano.testHooks
    .withModelOutputRetry;
  const runAdaptiveModelBatches = (/** @type {{
   *   GapcheckNano: {
   *     testHooks: {
   *       runAdaptiveModelBatches: <TItem, TResult>(
   *         items: TItem[],
   *         operation: (batch: TItem[]) => Promise<TResult[]>,
   *         label: string
   *       ) => Promise<TResult[]>
   *     }
   *   }
   * }} */ (/** @type {unknown} */ (window))).GapcheckNano.testHooks
    .runAdaptiveModelBatches;

  /** @returns {Error} */
  function createMalformedOutputError() {
    const error = new Error("Model returned invalid JSON.");
    error.name = "GapcheckModelOutputError";
    return error;
  }

  /** @type {boolean[]} */
  const retryFlags = [];
  let recoveryCalls = 0;
  const recoveredValue = await retry(async (isRetry) => {
    recoveryCalls += 1;
    retryFlags.push(isRetry);

    if (!isRetry) {
      throw createMalformedOutputError();
    }

    return "recovered";
  }, "Retry recovery test");

  let repeatedFailureCalls = 0;
  let repeatedFailureMessage = "";
  try {
    await retry(async () => {
      repeatedFailureCalls += 1;
      throw createMalformedOutputError();
    }, "Repeated failure test");
  } catch (error) {
    repeatedFailureMessage = error instanceof Error ? error.message : String(error);
  }

  const runtimeError = new Error("Model process could not start.");
  let runtimeFailureCalls = 0;
  let preservedRuntimeError = false;
  try {
    await retry(async () => {
      runtimeFailureCalls += 1;
      throw runtimeError;
    }, "Runtime failure test");
  } catch (error) {
    preservedRuntimeError = error === runtimeError;
  }

  const outputLimitError = new Error(
    "The response exceeded output limits and was truncated."
  );
  let outputLimitCalls = 0;
  let preservedOutputLimitError = false;
  try {
    await retry(async () => {
      outputLimitCalls += 1;
      throw outputLimitError;
    }, "Output limit test", { retryOutputLimit: false });
  } catch (error) {
    preservedOutputLimitError = error === outputLimitError;
  }

  /** @type {number[]} */
  const adaptiveBatchSizes = [];
  const adaptiveResult = await runAdaptiveModelBatches(
    [1, 2, 3, 4],
    async (batch) => {
      adaptiveBatchSizes.push(batch.length);

      if (batch.length > 2) {
        throw outputLimitError;
      }

      return batch.map((item) => item * 10);
    },
    "Adaptive output limit test"
  );

  const cases = [
    {
      name: "malformed output is retried once and can recover",
      expected: "recovered|2|false,true",
      actual: `${recoveredValue}|${recoveryCalls}|${retryFlags.join(",")}`,
    },
    {
      name: "repeated malformed output fails after one retry",
      expected: true,
      actual:
        repeatedFailureCalls === 2 &&
        repeatedFailureMessage.includes(
          "Repeated failure test returned malformed output after retry"
        ),
    },
    {
      name: "ordinary runtime errors are not retried",
      expected: true,
      actual: runtimeFailureCalls === 1 && preservedRuntimeError,
    },
    {
      name: "known output-limit failures can bypass an identical retry",
      expected: true,
      actual: outputLimitCalls === 1 && preservedOutputLimitError,
    },
    {
      name: "output-limit failures fall back to ordered smaller batches",
      expected: "4,2,2|10,20,30,40",
      actual: `${adaptiveBatchSizes.join(",")}|${adaptiveResult.join(",")}`,
    },
  ].map((testCase) => ({
    ...testCase,
    passed: testCase.actual === testCase.expected,
  }));
  const failures = cases.filter((testCase) => !testCase.passed);
  const lines = cases.map((testCase) => {
    const mark = testCase.passed ? "PASS" : "FAIL";
    return `${mark} ${testCase.name}: expected ${testCase.expected}, got ${testCase.actual}`;
  });
  const testOutput = document.getElementById("testOutput");

  if (testOutput) {
    testOutput.textContent = [testOutput.textContent, ...lines]
      .filter(Boolean)
      .join("\n");
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} model output retry test(s) failed.`);
  }

  console.log("GapCheck model output retry tests passed.", cases);
})();
