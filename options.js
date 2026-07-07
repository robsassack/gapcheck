const resumeText = document.getElementById("resumeText");
const saveBtn = document.getElementById("saveBtn");
const bulletCount = document.getElementById("bulletCount");
const saveConfirm = document.getElementById("saveConfirm");

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
  return /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}\b|\b\d{4}\b.*\b(?:present|\d{4})\b/i.test(line);
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

function splitIntoBullets(rawText) {
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

async function loadSavedResume() {
  const { resumeRawText, resumeBullets } = await chrome.storage.local.get([
    "resumeRawText",
    "resumeBullets",
  ]);

  if (resumeRawText) {
    resumeText.value = resumeRawText;
  }

  updateBulletCount(resumeBullets ? resumeBullets.length : 0);
}

function updateBulletCount(count) {
  bulletCount.textContent = count > 0 ? `${count} bullets saved` : "No resume saved yet";
}

saveBtn.addEventListener("click", async () => {
  const rawText = resumeText.value;
  const bullets = splitIntoBullets(rawText);

  await chrome.storage.local.set({
    resumeRawText: rawText,
    resumeBullets: bullets,
  });

  updateBulletCount(bullets.length);

  saveConfirm.classList.add("visible");
  setTimeout(() => saveConfirm.classList.remove("visible"), 1500);
});

loadSavedResume();
