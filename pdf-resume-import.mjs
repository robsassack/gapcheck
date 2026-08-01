// @ts-check

const MAX_PDF_FILE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_PAGES = 50;
const MIN_EXTRACTED_TEXT_CHARACTERS = 20;

/**
 * @typedef {object} PdfTextItem
 * @property {string} str
 * @property {number[]} transform
 * @property {number} [width]
 * @property {number} [height]
 * @property {boolean} [hasEOL]
 */

/**
 * @param {unknown} value
 * @returns {value is PdfTextItem}
 */
function isPdfTextItem(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      "str" in value &&
      typeof value.str === "string" &&
      "transform" in value &&
      Array.isArray(value.transform)
  );
}

/**
 * Rebuild readable lines from PDF.js text fragments while preserving the
 * document's content-stream order. This order is generally more reliable for
 * multi-column resumes than globally sorting every fragment by page position.
 *
 * @param {unknown[]} rawItems
 * @returns {string}
 */
function reconstructPdfPageText(rawItems) {
  /** @type {string[]} */
  const lines = [];
  let currentLine = "";
  /** @type {{ x: number, xEnd: number, y: number, height: number, rawText: string } | null} */
  let previous = null;

  const finishLine = () => {
    const line = currentLine.replace(/[\t ]+/g, " ").trim();

    if (line) {
      lines.push(line);
    }

    currentLine = "";
    previous = null;
  };

  rawItems.filter(isPdfTextItem).forEach((item) => {
    const rawText = item.str.replace(/\u0000/g, "");
    const text = rawText.replace(/\s+/g, " ").trim();

    if (!text) {
      if (item.hasEOL) {
        finishLine();
      }
      return;
    }

    const x = Number(item.transform[4]) || 0;
    const y = Number(item.transform[5]) || 0;
    const height = Math.max(
      1,
      Math.abs(Number(item.height)) ||
        Math.abs(Number(item.transform[3])) ||
        Math.abs(Number(item.transform[0])) ||
        1
    );
    const width = Math.max(0, Number(item.width) || 0);
    const verticalTolerance = previous
      ? Math.max(2, Math.min(previous.height, height) * 0.55)
      : 2;
    const movedToNewLine = previous &&
      (Math.abs(y - previous.y) > verticalTolerance || x + 2 < previous.x);

    if (movedToNewLine) {
      finishLine();
    }

    if (currentLine && previous) {
      const horizontalGap = x - previous.xEnd;
      const explicitWhitespace = /\s$/.test(previous.rawText) || /^\s/.test(rawText);
      const needsSpace = explicitWhitespace ||
        horizontalGap > Math.max(1.5, Math.min(previous.height, height) * 0.12);

      if (needsSpace) {
        currentLine += " ";
      }
    }

    currentLine += text;
    previous = {
      x,
      xEnd: x + width,
      y,
      height,
      rawText,
    };

    if (item.hasEOL) {
      finishLine();
    }
  });

  finishLine();
  return lines.join("\n");
}

/**
 * @param {unknown} error
 * @returns {Error}
 */
function createPdfImportError(error) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error || "");

  if (name === "PasswordException" || /password/i.test(name)) {
    return new Error(
      "Password-protected PDFs aren't supported. Export an unlocked copy or paste your resume text instead."
    );
  }

  if (name === "InvalidPDFException" || /invalid pdf/i.test(message)) {
    return new Error(
      "This PDF appears to be malformed or incomplete. Export a new copy or paste your resume text instead."
    );
  }

  return new Error(
    "GapCheck couldn't read this PDF. Export a new text-based copy or paste your resume text instead."
  );
}

/**
 * @param {Uint8Array} pdfBytes
 * @param {{ onProgress?: (currentPage: number, totalPages: number) => void, pdfjsModule?: any }} [options]
 * @returns {Promise<{ text: string, pageCount: number }>}
 */
async function extractPdfResumeText(pdfBytes, options = {}) {
  if (pdfBytes.byteLength === 0) {
    throw new Error("The selected PDF is empty.");
  }

  if (pdfBytes.byteLength > MAX_PDF_FILE_BYTES) {
    throw new Error("Choose a PDF that is 15 MB or smaller.");
  }

  const pdfjs = options.pdfjsModule || await import("./vendor/pdfjs/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "./vendor/pdfjs/pdf.worker.mjs",
    import.meta.url
  ).href;

  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    disableFontFace: true,
    isEvalSupported: false,
    stopAtErrors: false,
    useWasm: false,
    verbosity: 0,
  });
  let pdfDocument;

  try {
    pdfDocument = await loadingTask.promise;

    if (pdfDocument.numPages > MAX_PDF_PAGES) {
      throw new Error("Choose a PDF with 50 pages or fewer.");
    }

    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      options.onProgress?.(pageNumber, pdfDocument.numPages);
      const page = await pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent({
        disableNormalization: false,
        includeMarkedContent: false,
      });
      const pageText = reconstructPdfPageText(textContent.items);

      if (pageText) {
        pages.push(pageText);
      }

      page.cleanup();
    }

    const text = pages.join("\n\n").trim();
    const meaningfulText = text.replace(/[^\p{L}\p{N}]+/gu, "");

    if (meaningfulText.length < MIN_EXTRACTED_TEXT_CHARACTERS) {
      throw new Error(
        "No selectable resume text was found. This may be an image-only or scanned PDF; paste the text instead."
      );
    }

    return {
      text,
      pageCount: pdfDocument.numPages,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Choose a PDF with 50 pages or fewer." ||
        error.message.startsWith("No selectable resume text was found."))
    ) {
      throw error;
    }

    throw createPdfImportError(error);
  } finally {
    if (pdfDocument) {
      await pdfDocument.cleanup();
    }

    await loadingTask.destroy();
  }
}

/**
 * @param {File} file
 * @param {{ onProgress?: (currentPage: number, totalPages: number) => void, pdfjsModule?: any }} [options]
 * @returns {Promise<{ text: string, pageCount: number }>}
 */
async function extractPdfResumeFile(file, options = {}) {
  const hasPdfExtension = /\.pdf$/i.test(file.name);

  if (file.type && file.type !== "application/pdf" && !hasPdfExtension) {
    throw new Error("Choose a PDF file.");
  }

  if (!file.type && !hasPdfExtension) {
    throw new Error("Choose a PDF file.");
  }

  if (file.size > MAX_PDF_FILE_BYTES) {
    throw new Error("Choose a PDF that is 15 MB or smaller.");
  }

  return extractPdfResumeText(new Uint8Array(await file.arrayBuffer()), options);
}

export {
  MAX_PDF_FILE_BYTES,
  createPdfImportError,
  extractPdfResumeFile,
  extractPdfResumeText,
  reconstructPdfPageText,
};
