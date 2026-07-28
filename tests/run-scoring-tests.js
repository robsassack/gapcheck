const fs = require("node:fs");
const vm = require("node:vm");

const testOutput = { textContent: "" };
const context = {
  console: {
    error: console.error,
    info() {},
    log() {},
    warn: console.warn,
  },
  document: {
    getElementById(id) {
      return id === "testOutput" ? testOutput : null;
    },
  },
  localStorage: {
    getItem() {
      return null;
    },
    removeItem() {},
    setItem() {},
  },
  window: {},
};

context.globalThis = context;
vm.createContext(context);

try {
  for (const file of ["nano.js", "tests/scoring.test.js"]) {
    const source = fs.readFileSync(file, "utf8");
    vm.runInContext(source, context, { filename: file });
  }
} catch (error) {
  process.stdout.write(`${testOutput.textContent}\n`);
  throw error;
}

process.stdout.write(`${testOutput.textContent}\n`);
