// @ts-check

const analysisCancellationTestWindow = /** @type {Window & {
 *   GapcheckAnalysisCancellationTestPromise?: Promise<void>
 * }} */ (window);

analysisCancellationTestWindow.GapcheckAnalysisCancellationTestPromise = (async () => {
  const gapcheckNano = /** @type {{
   *   analyzeRequirementsWithResumeBullets: (
   *     requirements: string[],
   *     resumeBullets: string[],
   *     options: { signal: AbortSignal }
   *   ) => Promise<unknown>
   * }} */ (/** @type {{ GapcheckNano: unknown }} */ (
    /** @type {unknown} */ (window)
  ).GapcheckNano);
  const controller = new AbortController();
  /** @type {AbortSignal | undefined} */
  let createSignal;
  /** @type {AbortSignal | undefined} */
  let promptSignal;
  let sessionDestroyed = false;

  const session = {
    /**
     * @param {string} _input
     * @param {{ signal?: AbortSignal }} [options]
     * @returns {Promise<string>}
     */
    prompt(_input, options = {}) {
      promptSignal = options.signal;

      return new Promise((resolve, reject) => {
        if (!options.signal) {
          reject(new Error("The model prompt did not receive an abort signal."));
          return;
        }

        options.signal.addEventListener("abort", () => {
          reject(options.signal?.reason);
        }, { once: true });
      });
    },
    destroy() {
      sessionDestroyed = true;
    },
  };
  const cancellationGlobal = /** @type {typeof globalThis & {
   *   LanguageModel?: {
   *     availability: () => Promise<"available">,
   *     create: (options?: { signal?: AbortSignal }) => Promise<typeof session>
   *   }
   * }} */ (globalThis);

  cancellationGlobal.LanguageModel = {
    async availability() {
      return "available";
    },
    async create(options = {}) {
      createSignal = options.signal;
      return session;
    },
  };

  const analysisPromise = gapcheckNano.analyzeRequirementsWithResumeBullets(
    ["Experience building accessible web applications is required."],
    ["Built accessible web applications."],
    { signal: controller.signal }
  );

  while (!promptSignal) {
    await Promise.resolve();
  }

  const cancellationReason = new DOMException(
    "The analysis was cancelled.",
    "AbortError"
  );
  controller.abort(cancellationReason);

  let receivedCancellationReason = false;
  try {
    await analysisPromise;
  } catch (error) {
    receivedCancellationReason = error === cancellationReason;
  } finally {
    delete cancellationGlobal.LanguageModel;
  }

  const passed =
    createSignal === controller.signal &&
    promptSignal === controller.signal &&
    sessionDestroyed &&
    receivedCancellationReason;
  const line = `${passed ? "PASS" : "FAIL"} active analysis aborts the model prompt and destroys its session: expected true, got ${passed}`;
  const testOutput = document.getElementById("testOutput");

  if (testOutput) {
    testOutput.textContent = [testOutput.textContent, line]
      .filter(Boolean)
      .join("\n");
  }

  if (!passed) {
    throw new Error("Analysis cancellation did not cleanly abort the active model session.");
  }
})();
