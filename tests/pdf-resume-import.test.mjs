import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as nodePdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  extractPdfResumeText,
  reconstructPdfPageText,
} from "../pdf-resume-import.mjs";

function extractTestPdf(pdfBytes, options = {}) {
  return extractPdfResumeText(pdfBytes, {
    ...options,
    pdfjsModule: nodePdfjs,
  });
}

function escapePdfText(text) {
  return text.replace(/([\\()])/g, "\\$1");
}

function createTextCommands(blocks) {
  return blocks.map((block) => {
    const lines = block.lines.map((line, index) => {
      const move = index === 0 ? "" : "0 -16 Td\n";
      return `${move}(${escapePdfText(line)}) Tj\n`;
    }).join("");

    return `BT\n/F1 12 Tf\n${block.x} ${block.y} Td\n${lines}ET\n`;
  }).join("");
}

function createPdf(pages) {
  const objectCount = 3 + pages.length * 2;
  const fontObjectId = objectCount;
  const objects = new Map();
  const pageObjectIds = pages.map((_, index) => 3 + index * 2);

  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`
  );

  pages.forEach((blocks, index) => {
    const pageObjectId = pageObjectIds[index];
    const contentObjectId = pageObjectId + 1;
    const stream = createTextCommands(blocks);
    objects.set(
      pageObjectId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`
    );
    objects.set(
      contentObjectId,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`
    );
  });

  objects.set(
    fontObjectId,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  );

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    offsets[objectId] = Buffer.byteLength(pdf);
    pdf += `${objectId} 0 obj\n${objects.get(objectId)}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objectCount + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(pdf, "binary"));
}

function createStreamObject(data, dictionary = "") {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, "binary");
  return Buffer.concat([
    Buffer.from(`<< ${dictionary}/Length ${bytes.length} >>\nstream\n`, "binary"),
    bytes,
    Buffer.from("\nendstream", "binary"),
  ]);
}

function serializeBinaryPdf(objects, trailerFields = "") {
  const objectCount = Math.max(...objects.keys());
  const chunks = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "binary")];
  const offsets = [0];
  let byteLength = chunks[0].length;

  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    const body = objects.get(objectId);
    assert.ok(body, `Missing PDF object ${objectId}`);
    const objectBytes = Buffer.concat([
      Buffer.from(`${objectId} 0 obj\n`, "binary"),
      Buffer.isBuffer(body) ? body : Buffer.from(body, "binary"),
      Buffer.from("\nendobj\n", "binary"),
    ]);
    offsets[objectId] = byteLength;
    chunks.push(objectBytes);
    byteLength += objectBytes.length;
  }

  const xrefOffset = byteLength;
  const xrefLines = offsets.slice(1).map((offset) =>
    `${String(offset).padStart(10, "0")} 00000 n \n`
  ).join("");
  chunks.push(Buffer.from(
    `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n${xrefLines}` +
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R ${trailerFields}>>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`,
    "binary"
  ));

  return new Uint8Array(Buffer.concat(chunks));
}

function createImageOnlyPdf() {
  const objects = new Map([
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
    [3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>"],
    [4, createStreamObject(Buffer.from([45, 118, 181]), "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 ")],
    [5, createStreamObject("q\n200 0 0 80 72 640 cm\n/Im1 Do\nQ")],
  ]);

  return serializeBinaryPdf(objects);
}

const PDF_PASSWORD_PADDING = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
  0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

function md5(bytes) {
  return createHash("md5").update(bytes).digest();
}

function padPdfPassword(password) {
  return Buffer.concat([
    Buffer.from(password, "binary"),
    PDF_PASSWORD_PADDING,
  ]).subarray(0, 32);
}

function rc4(key, input) {
  const state = Uint8Array.from({ length: 256 }, (_, index) => index);
  let j = 0;

  for (let i = 0; i < 256; i += 1) {
    j = (j + state[i] + key[i % key.length]) & 0xff;
    [state[i], state[j]] = [state[j], state[i]];
  }

  const output = Buffer.alloc(input.length);
  let i = 0;
  j = 0;

  for (let index = 0; index < input.length; index += 1) {
    i = (i + 1) & 0xff;
    j = (j + state[i]) & 0xff;
    [state[i], state[j]] = [state[j], state[i]];
    output[index] = input[index] ^ state[(state[i] + state[j]) & 0xff];
  }

  return output;
}

function createPasswordProtectedPdf(password) {
  const fileId = md5(Buffer.from("GapCheck encrypted PDF test fixture", "binary"));
  const paddedPassword = padPdfPassword(password);
  const ownerKey = md5(paddedPassword).subarray(0, 5);
  const ownerEntry = rc4(ownerKey, paddedPassword);
  const permissions = Buffer.alloc(4);
  permissions.writeInt32LE(-4);
  const fileKey = md5(Buffer.concat([
    paddedPassword,
    ownerEntry,
    permissions,
    fileId,
  ])).subarray(0, 5);
  const userEntry = rc4(fileKey, PDF_PASSWORD_PADDING);
  const content = Buffer.from(createTextCommands([
    { x: 72, y: 720, lines: ["Password protected resume fixture"] },
  ]), "binary");
  const objectKey = md5(Buffer.concat([
    fileKey,
    Buffer.from([4, 0, 0, 0, 0]),
  ])).subarray(0, 10);
  const encryptedContent = rc4(objectKey, content);
  const objects = new Map([
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
    [3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"],
    [4, createStreamObject(encryptedContent)],
    [5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"],
    [6, `<< /Filter /Standard /V 1 /R 2 /Length 40 /O <${ownerEntry.toString("hex")}> /U <${userEntry.toString("hex")}> /P -4 >>`],
  ]);
  const idHex = fileId.toString("hex");

  return serializeBinaryPdf(
    objects,
    `/Encrypt 6 0 R /ID [<${idHex}> <${idHex}>] `
  );
}

const reconstructed = reconstructPdfPageText([
  { str: "Built", transform: [12, 0, 0, 12, 72, 720], width: 24, height: 12 },
  { str: " APIs", transform: [12, 0, 0, 12, 98, 720], width: 28, height: 12, hasEOL: true },
  { str: "Reduced latency", transform: [12, 0, 0, 12, 72, 704], width: 86, height: 12 },
]);
assert.equal(reconstructed, "Built APIs\nReduced latency");
console.log("PASS PDF text fragments reconstruct into readable resume lines.");

const singleColumnPdf = createPdf([
  [{ x: 72, y: 720, lines: [
    "Maya Rook",
    "PROFESSIONAL EXPERIENCE",
    "Built accessible React interfaces for customer workflows.",
    "Reduced page load time by 35 percent.",
  ] }],
]);
const singleColumnResult = await extractTestPdf(singleColumnPdf);
assert.equal(singleColumnResult.pageCount, 1);
assert.match(singleColumnResult.text, /Built accessible React interfaces/);
assert.match(singleColumnResult.text, /Reduced page load time/);
console.log("PASS a representative single-column resume PDF extracts locally.");

const multiColumnPdf = createPdf([
  [
    { x: 40, y: 700, lines: ["SKILLS", "React", "TypeScript", "PostgreSQL"] },
    { x: 235, y: 700, lines: [
      "EXPERIENCE",
      "Developed full-stack product features.",
      "Collaborated through Git pull requests.",
    ] },
  ],
]);
const multiColumnResult = await extractTestPdf(multiColumnPdf);
assert.match(multiColumnResult.text, /SKILLS[\s\S]*PostgreSQL[\s\S]*EXPERIENCE/);
assert.match(multiColumnResult.text, /Collaborated through Git pull requests/);
console.log("PASS a representative two-column resume preserves content-stream order.");

const longPdf = createPdf(
  Array.from({ length: 8 }, (_, index) => [
    { x: 72, y: 720, lines: [
      `PROJECT ${index + 1}`,
      `Delivered production improvement number ${index + 1}.`,
    ] },
  ])
);
const progressPages = [];
const longResult = await extractTestPdf(longPdf, {
  onProgress(currentPage) {
    progressPages.push(currentPage);
  },
});
assert.equal(longResult.pageCount, 8);
assert.deepEqual(progressPages, [1, 2, 3, 4, 5, 6, 7, 8]);
assert.match(longResult.text, /PROJECT 8/);
console.log("PASS a long multi-page resume reports progress and retains late pages.");

const imageOnlyPdf = createImageOnlyPdf();
await assert.rejects(
  extractTestPdf(imageOnlyPdf),
  /No selectable resume text was found/
);
console.log("PASS an image-only PDF receives a clear unsupported-file error.");

await assert.rejects(
  extractTestPdf(new Uint8Array(Buffer.from("not a pdf"))),
  /malformed|couldn't read/i
);
console.log("PASS a malformed PDF receives a clear import error.");

const passwordProtectedPdf = createPasswordProtectedPdf("secret");
const unlockTask = nodePdfjs.getDocument({
  data: passwordProtectedPdf.slice(),
  password: "secret",
  useWasm: false,
  verbosity: 0,
});

try {
  const unlockedDocument = await unlockTask.promise;
  const unlockedPage = await unlockedDocument.getPage(1);
  const unlockedTextContent = await unlockedPage.getTextContent();
  assert.match(
    reconstructPdfPageText(unlockedTextContent.items),
    /Password protected resume fixture/
  );
} finally {
  await unlockTask.destroy();
}

await assert.rejects(
  extractTestPdf(passwordProtectedPdf),
  /Password-protected PDFs aren't supported/
);
console.log("PASS a password-protected PDF receives a clear unsupported-file error.");
