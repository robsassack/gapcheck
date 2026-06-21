const resumeText = document.getElementById("resumeText");
const saveBtn = document.getElementById("saveBtn");
const bulletCount = document.getElementById("bulletCount");
const saveConfirm = document.getElementById("saveConfirm");

// Naive split for v1: one bullet per non-empty line, with common bullet
// characters stripped from the front. Good enough for a pasted resume;
// can get smarter later if formatting turns out to need it.
function splitIntoBullets(rawText) {
  return rawText
    .split("\n")
    .map((line) => line.replace(/^[\s•\-*▪◦]+/, "").trim())
    .filter((line) => line.length > 3);
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
