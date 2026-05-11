#!/usr/bin/env bun
/**
 * CLI + Windows desktop focused E2E (no VS Code / visual / llama required).
 *
 *   bun run scripts/e2e/run-cli-desktop.ts
 *
 * Env:
 *   E2E_SKIP_BUILD=1
 *   E2E_SKIP_DESKTOP_BUILD=1
 *   E2E_BUILD_DESKTOP_IF_MISSING=1  build desktop when exe missing (slow)
 *   E2E_SKIP_LLAMA=1 (default implicit — no llama steps here)
 */
import fs from "fs"
import { envFlag } from "./lib/env"
import { EXE, DESKTOP_EXE } from "./lib/paths"
import { log, printReport, runStep, skipStep, type StepResult } from "./lib/runner"
import { stepBuildCli } from "./steps/cli"
import { stepCliSimpleDevHelp, stepCliSimpleExeHelp } from "./steps/cli-simple"
import {
  stepCliDevRunFailFast,
  stepCliExeSmoke,
  stepDesktopExeShellAsset,
  stepDesktopShellTypecheck,
  stepDesktopViteBuild,
} from "./steps/cli-desktop"
import { stepCliVersion, stepCliInvalidModelFailFast, stepCliSessionSearch } from "./steps/cli"
import { stepDesktopExeLaunch } from "./steps/playwright"
import { stepPlaywrightShell } from "./steps/shell-playwright"

async function main() {
  if (process.platform !== "win32") {
    console.error("[e2e-cli-desktop] Windows only")
    process.exit(1)
  }

  const results: StepResult[] = []
  const run = async (id: string, name: string, fn: () => Promise<string | void>) => {
    await runStep(id, name, fn, results)
  }

  log("preflight", `exe=${fs.existsSync(EXE)} desktop=${fs.existsSync(DESKTOP_EXE)}`)

  try {
    await run("shell-typecheck", "Desktop-shell: typecheck", stepDesktopShellTypecheck)
    await run("cli-simple-dev", "CLI: dev --help", stepCliSimpleDevHelp)
    await run("cli-dev-run-fail", "CLI: dev run invalid model fail-fast", stepCliDevRunFailFast)

    if (!envFlag("E2E_SKIP_BUILD")) {
      await run("cli-build", "CLI: build:win", stepBuildCli)
    } else {
      skipStep("cli-build", "CLI: build:win", "E2E_SKIP_BUILD=1", results)
    }

    if (fs.existsSync(EXE) || !envFlag("E2E_SKIP_BUILD")) {
      await run("cli-version", "CLI: --version", stepCliVersion)
      await run("cli-simple-exe", "CLI: exe --help", stepCliSimpleExeHelp)
      await run("cli-invalid", "CLI: invalid model fail-fast", stepCliInvalidModelFailFast)
      await run("cli-session", "CLI: session search", stepCliSessionSearch)
      await run("cli-exe-smoke", "CLI: version + run smoke", stepCliExeSmoke)
    }

    if (!envFlag("E2E_SKIP_DESKTOP_BUILD")) {
      await run("desktop-vite", "Desktop: electron-vite build (shell UI)", stepDesktopViteBuild)
    } else {
      skipStep("desktop-vite", "Desktop: vite build", "E2E_SKIP_DESKTOP_BUILD=1", results)
    }

    await run("desktop-exe-check", "Desktop: LocalCoder.exe artifact", stepDesktopExeShellAsset)
    await run("shell-playwright", "Desktop-shell: Playwright UI (mock)", stepPlaywrightShell)

    if (fs.existsSync(DESKTOP_EXE) && !envFlag("E2E_SKIP_DESKTOP_LAUNCH")) {
      await run("desktop-launch", "Desktop: headed exe smoke", stepDesktopExeLaunch)
    } else {
      skipStep(
        "desktop-launch",
        "Desktop: headed launch",
        fs.existsSync(DESKTOP_EXE) ? "E2E_SKIP_DESKTOP_LAUNCH=1" : "no unpacked exe",
        results,
      )
    }

    printReport("cli-desktop", results)
    console.log("\n[e2e-cli-desktop] ALL PASSED\n")
  } catch {
    printReport("cli-desktop", results)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
