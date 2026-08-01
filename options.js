// @ts-check

import { extractPdfResumeFile } from "./pdf-resume-import.mjs";

const resumeText = /** @type {HTMLTextAreaElement} */ (document.getElementById("resumeText"));
const saveBtn = /** @type {HTMLButtonElement} */ (document.getElementById("saveBtn"));
const bulletCount = /** @type {HTMLSpanElement} */ (document.getElementById("bulletCount"));
const saveConfirm = /** @type {HTMLSpanElement} */ (document.getElementById("saveConfirm"));
const choosePdfBtn = /** @type {HTMLButtonElement} */ (document.getElementById("choosePdfBtn"));
const pdfFileInput = /** @type {HTMLInputElement} */ (document.getElementById("pdfFileInput"));
const pdfFileName = /** @type {HTMLSpanElement} */ (document.getElementById("pdfFileName"));
const pdfImportStatus = /** @type {HTMLParagraphElement} */ (document.getElementById("pdfImportStatus"));
const pdfPreviewSection = /** @type {HTMLElement} */ (document.getElementById("pdfPreviewSection"));
const pdfPreviewText = /** @type {HTMLPreElement} */ (document.getElementById("pdfPreviewText"));
const pdfPreviewMeta = /** @type {HTMLSpanElement} */ (document.getElementById("pdfPreviewMeta"));
const usePdfBtn = /** @type {HTMLButtonElement} */ (document.getElementById("usePdfBtn"));
const cancelPdfBtn = /** @type {HTMLButtonElement} */ (document.getElementById("cancelPdfBtn"));
const resumeParser = /** @type {Window & { GapcheckResume?: { splitResumeIntoBullets: (rawText: string) => string[] } }} */ (
  window
).GapcheckResume;
let pendingPdfText = "";
let saveConfirmationTimer = 0;

async function loadSavedResume() {
  const { resumeRawText, resumeBullets } = /** @type {{ resumeRawText?: unknown, resumeBullets?: unknown }} */ (
    await chrome.storage.local.get([
      "resumeRawText",
      "resumeBullets",
    ])
  );

  if (typeof resumeRawText === "string") {
    resumeText.value = resumeRawText;
  }

  updateBulletCount(Array.isArray(resumeBullets) ? resumeBullets.length : 0);
}

/** @param {number} count */
function updateBulletCount(count) {
  bulletCount.textContent = count > 0 ? `${count} bullets saved` : "No resume saved yet";
}

/**
 * @param {string} message
 */
function showSaveConfirmation(message) {
  window.clearTimeout(saveConfirmationTimer);
  saveConfirm.textContent = message;
  saveConfirm.classList.add("visible");
  saveConfirmationTimer = window.setTimeout(() => {
    saveConfirm.classList.remove("visible");
  }, 1800);
}

/**
 * @param {string} message
 * @param {"info" | "ok" | "error"} [state]
 */
function setPdfImportStatus(message, state = "info") {
  pdfImportStatus.textContent = message;
  pdfImportStatus.dataset.state = state;
}

function clearPdfPreview() {
  pendingPdfText = "";
  pdfPreviewText.textContent = "";
  pdfPreviewMeta.textContent = "";
  pdfPreviewSection.hidden = true;
}

/**
 * @param {string} rawText
 * @returns {Promise<number>}
 */
async function saveResume(rawText) {

  if (!resumeParser) {
    throw new Error("GapCheck resume parser is unavailable.");
  }

  const bullets = resumeParser.splitResumeIntoBullets(rawText);

  await chrome.storage.local.set({
    resumeRawText: rawText,
    resumeBullets: bullets,
  });

  updateBulletCount(bullets.length);
  return bullets.length;
}

saveBtn.addEventListener("click", async () => {
  await saveResume(resumeText.value);
  showSaveConfirmation("Saved");
});

choosePdfBtn.addEventListener("click", () => {
  pdfFileInput.click();
});

pdfFileInput.addEventListener("change", async () => {
  const file = pdfFileInput.files?.[0];

  if (!file) {
    return;
  }

  clearPdfPreview();
  pdfFileName.textContent = file.name;
  choosePdfBtn.disabled = true;
  setPdfImportStatus("Opening PDF locally…");

  try {
    const result = await extractPdfResumeFile(file, {
      onProgress(currentPage, totalPages) {
        setPdfImportStatus(
          `Extracting page ${currentPage} of ${totalPages} locally…`
        );
      },
    });
    const detectedBullets = resumeParser
      ? resumeParser.splitResumeIntoBullets(result.text).length
      : 0;
    pendingPdfText = result.text;
    pdfPreviewText.textContent = result.text;
    pdfPreviewMeta.textContent =
      `${result.pageCount} ${result.pageCount === 1 ? "page" : "pages"} · ` +
      `${result.text.length.toLocaleString()} characters · ` +
      `${detectedBullets} evidence lines detected`;
    pdfPreviewSection.hidden = false;
    setPdfImportStatus(
      "Review the extracted text below. Your saved resume has not changed.",
      "ok"
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "GapCheck couldn't import this PDF.";
    setPdfImportStatus(message, "error");
  } finally {
    choosePdfBtn.disabled = false;
    pdfFileInput.value = "";
  }
});

usePdfBtn.addEventListener("click", async () => {
  if (!pendingPdfText) {
    return;
  }

  usePdfBtn.disabled = true;

  try {
    resumeText.value = pendingPdfText;
    const importedBulletCount = await saveResume(pendingPdfText);
    clearPdfPreview();
    setPdfImportStatus(
      `PDF imported and saved with ${importedBulletCount} evidence lines.`,
      "ok"
    );
    showSaveConfirmation("Imported and saved");
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "GapCheck couldn't save the imported resume.";
    setPdfImportStatus(message, "error");
  } finally {
    usePdfBtn.disabled = false;
  }
});

cancelPdfBtn.addEventListener("click", () => {
  clearPdfPreview();
  pdfFileName.textContent = "No file selected";
  setPdfImportStatus("Import cancelled. Your saved resume was not changed.");
});

loadSavedResume();
