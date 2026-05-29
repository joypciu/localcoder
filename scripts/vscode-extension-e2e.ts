#!/usr/bin/env bun
/**
 * LocalCoder VS Code extension E2E runner.
 *   bun run scripts/vscode-extension-e2e.ts
 *   VSCODE_E2E_SKIP_LIVE=1 bun run scripts/vscode-extension-e2e.ts
 *   VSCODE_E2E_SKIP_VSCODE=1 bun run scripts/vscode-extension-e2e.ts
 */
import { spawnSync } from "child_process";
import * as path from "path";

const VSCODE_DIR = path.join(import.meta.dir, "..", "sdks", "vscode");
const skipLive = process.env.VSCODE_E2E_SKIP_LIVE === "1";
const skipVscode = process.env.VSCODE_E2E_SKIP_VSCODE === "1";

function run(cmd: string, args: string[], cwd: string, env?: Record<string, string>) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true, env: { ...process.env, ...env } });
  if (r.status !== 0) { process.exit(r.status ?? 1); }
}

console.log("=== LocalCoder VS Code Extension E2E ===\n");

run("bun", ["run", "compile"], VSCODE_DIR);
run("bun", ["run", "compile-tests"], VSCODE_DIR);

const mochaArgs = [
  "mocha", "out/test/suite/**/*.test.js",
  "--ui", "tdd", "--timeout", "120000",
  "--exclude", "out/test/suite/extension-integration.test.js",
];
if (skipLive) {
  mochaArgs.push("--exclude", "out/test/suite/backend-live.test.js");
}
run("npx", mochaArgs, VSCODE_DIR);

if (!skipVscode) {
  console.log("\n=== VS Code integration tests (Electron) ===\n");
  run("bun", ["run", "test"], VSCODE_DIR);
} else {
  console.log("\n(skipped vscode-test — VSCODE_E2E_SKIP_VSCODE=1)");
}

console.log("\n=== All E2E stages passed ===\n");

