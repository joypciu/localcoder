import { defineConfig } from "@vscode/test-cli";

export default defineConfig([
  {
    label: "default",
    files: [
      "out/test/suite/**/*.test.js",
      "!out/test/suite/localcoder-llamacpp.test.js",
      "!out/test/suite/extension-llamacpp.test.js",
    ],
    mocha: { timeout: 120_000 },
  },
  {
    label: "llama-extension",
    files: "out/test/suite/extension-llamacpp.test.js",
    workspaceFolder: `${import.meta.dirname}/test-fixtures/llama-e2e-workspace`,
    mocha: { timeout: 300_000 },
  },
  {
    label: "llama-backend",
    files: "out/test/suite/localcoder-llamacpp.test.js",
    mocha: { timeout: 300_000 },
  },
]);
