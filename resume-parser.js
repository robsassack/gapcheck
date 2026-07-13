// @ts-check

const RESUME_SECTION_HEADINGS = new Set([
  "summary",
  "technical skills",
  "professional experience",
  "projects",
  "education",
  "relevant coursework",
]);

/**
 * @param {string} line
 * @returns {boolean}
 */
function isResumeSectionHeading(line) {
  return RESUME_SECTION_HEADINGS.has(line.toLowerCase());
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function startsWithBullet(line) {
  return /^[\s•\-*▪◦]+/.test(line);
}

/**
 * @param {string} line
 * @returns {string}
 */
function stripBulletMarker(line) {
  return line.replace(/^[\s•\-*▪◦]+/, "").trim();
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function hasContactInfo(line) {
  return /@|https?:\/\/|www\.|github\.com|\d{3}[-.\s]\d{3}[-.\s]\d{4}/i.test(line);
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function hasDateRange(line) {
  return /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}\b|\b\d{4}\b.*\b(?:present|\d{4})\b/i.test(
    line
  );
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isLikelyTitleLine(line) {
  const words = line.split(/\s+/);

  return words.length <= 5 && words.every((word) => /^[A-Z][A-Za-z.+#]*$|^[IVX]+$/.test(word));
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isStandaloneResumeLine(line) {
  return (
    isResumeSectionHeading(line) ||
    line.includes(":") ||
    hasContactInfo(line) ||
    hasDateRange(line) ||
    isLikelyTitleLine(line)
  );
}

/**
 * Convert pasted or fixture resume text into the bullets used by Pass 2.
 *
 * @param {string} rawText
 * @returns {string[]}
 */
function splitResumeIntoBullets(rawText) {
  /** @type {string[]} */
  const bullets = [];

  rawText.split("\n").forEach((rawLine) => {
    const line = rawLine.trim();

    if (line.length <= 3) {
      return;
    }

    if (startsWithBullet(line)) {
      bullets.push(stripBulletMarker(line));
      return;
    }

    const previousIndex = bullets.length - 1;
    const isContinuation = previousIndex >= 0 && !isStandaloneResumeLine(line);

    if (isContinuation) {
      bullets[previousIndex] = `${bullets[previousIndex]} ${line}`;
      return;
    }

    bullets.push(line);
  });

  return bullets;
}

/** @type {Window & { GapcheckResume?: { splitResumeIntoBullets: typeof splitResumeIntoBullets } }} */
const resumeParserWindow = window;

resumeParserWindow.GapcheckResume = Object.freeze({
  splitResumeIntoBullets,
});
