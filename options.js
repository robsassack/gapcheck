const resumeText = document.getElementById("resumeText");
const saveBtn = document.getElementById("saveBtn");
const bulletCount = document.getElementById("bulletCount");
const saveConfirm = document.getElementById("saveConfirm");
const resumeParser = /** @type {Window & { GapcheckResume?: { splitResumeIntoBullets: (rawText: string) => string[] } }} */ (
  window
).GapcheckResume;

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

  if (!resumeParser) {
    throw new Error("GapCheck resume parser is unavailable.");
  }

  const bullets = resumeParser.splitResumeIntoBullets(rawText);

  await chrome.storage.local.set({
    resumeRawText: rawText,
    resumeBullets: bullets,
  });

  updateBulletCount(bullets.length);

  saveConfirm.classList.add("visible");
  setTimeout(() => saveConfirm.classList.remove("visible"), 1500);
});

loadSavedResume();
