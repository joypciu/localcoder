#!/usr/bin/env bun
/**
 * Unified LocalCoder E2E runner — CLI, VS Code extension, Windows build.
 *
 * Usage:
 *   bun run scripts/e2e/run.ts                    # standard tier
 *   bun run scripts/e2e/run.ts --tier=smoke       # ~2 min, no llama
 *   bun run scripts/e2e/run.ts --tier=full        # build + llama + agent + vscode + desktop
 *
 * Env:
 *   E2E_TIER=smoke|standard|full
 *   LOCALCODER_LLAMACPP_DIR / LOCALCODER_LLAMACPP_MODEL — or ~/.localcoder/llamacpp.json
 *   E2E_SKIP_BUILD=1          skip CLI rebuild
 *   E2E_SKIP_LLAMA=1          skip llama setup + chat + agent
 *   E2E_SKIP_AGENT=1          skip agent tool E2E
 *   E2E_SKIP_STANDALONE=1     skip portable build (full tier)
 *   E2E_SKIP_VSCODE_ELECTRON=1  skip vscode-test Electron suite
 *   E2E_LLAMA_VSCODE=1        run live llama VS Code E2E (full tier, slow)
 *   LLAMACPP_SKIP_SERVER=1    reuse running llama-server
 */
import fs from "fs"
import { envFlag, llamaAvailable, parseTier, resolveLlamaPaths } from "./lib/env"
import { EXE } from "./lib/paths"
import {
  fail,
  log,
  printReport,
  runStep,
  skipStep,
  type E2eTier,
  type StepResult,
} from "./lib/runner"
import {
  stepBuildCli,
  stepCliAgentTools,
  stepCliAuthSetApi,
  stepCliInvalidModelFailFast,
  stepCliLlamacppChat,
  stepCliLlamacppSetup,
  stepCliLlamacppStatus,
  stepCliSessionSearch,
  stepCliVersion,
} from "./steps/cli"
import {
  stepBuildStandalone,
  stepCliBinarySize,
  stepDesktopArtifacts,
} from "./steps/build"
import { stepServeHealth } from "./steps/serve"
import {
  stepVscodeCompile,
  stepVscodeElectron,
  stepVscodeLlamaE2e,
  stepVscodeUnit,
  stepVscodeWizardContract,
  stepVscodeCompiledWizardCliBridge,
} from "./steps/vscode"
import { stepPlaywrightApp } from "./steps/playwright"

async function runTier(tier: E2eTier) {
  if (process.platform !== "win32") {
    fail("preflight", "E2E tiers are designed for Windows (CLI binary + desktop artifacts)")
  }

  const results: StepResult[] = []
  const llama = resolveLlamaPaths()
  const hasLlama = llamaAvailable(llama)
  const hasExe = fs.existsSync(EXE)

  log("preflight", `tier=${tier} exe=${hasExe} llama=${hasLlama}`)
  if (hasLlama) {
    log("preflight", `llamaDir=${llama.llamaDir}`)
    log("preflight", `model=${llama.modelPath}`)
  }

  const run = async (id: string, name: string, fn: () => Promise<string | void>) => {
    await runStep(id, name, fn, results)
  }

  try {
    // ── VS Code (all tiers) ──────────────────────────────────────────────
    await run("vscode-compile", "VS Code: compile extension", stepVscodeCompile)
    await run("vscode-wizard", "VS Code: zero-config wizard contract", stepVscodeWizardContract)
    await run("vscode-bridge", "VS Code: wizard CLI bridge in bundle", stepVscodeCompiledWizardCliBridge)
    await run("vscode-unit", "VS Code: contract unit tests", stepVscodeUnit)

    if (tier === "smoke") {
      if (hasExe) {
        await run("cli-version", "CLI: --version", stepCliVersion)
        await run("cli-invalid-model", "CLI: invalid model fail-fast", stepCliInvalidModelFailFast)
        await run("cli-session", "CLI: session search", stepCliSessionSearch)
      } else {
        skipStep("cli-version", "CLI: --version", "no localcoder.exe — run standard/full tier or build first", results)
        skipStep("cli-invalid-model", "CLI: invalid model fail-fast", "no exe", results)
        skipStep("cli-session", "CLI: session search", "no exe", results)
      }
      skipStep("cli-build", "CLI: build:win", "smoke tier skips build", results)
      skipStep("llama", "CLI: llama.cpp", "smoke tier skips llama", results)
      skipStep("agent", "CLI: agent tools", "smoke tier skips agent", results)
      skipStep("serve", "CLI: serve API", "smoke tier skips serve", results)
      skipStep("vscode-electron", "VS Code: Electron tests", "smoke tier skips Electron", results)
      skipStep("build-standalone", "Windows: portable build", "smoke tier skips build", results)
      skipStep("desktop", "Windows: desktop artifacts", "smoke tier skips desktop gate", results)
    }

    if (tier === "standard" || tier === "full") {
      await run("cli-build", "CLI: build Windows binary", stepBuildCli)
      await run("cli-version", "CLI: --version", stepCliVersion)
      await run("cli-size", "CLI: binary size check", stepCliBinarySize)
      await run("cli-invalid-model", "CLI: invalid model fail-fast", stepCliInvalidModelFailFast)
      await run("cli-session", "CLI: session search", stepCliSessionSearch)
      await run("cli-auth", "CLI: auth set-api (cloud wizard backend)", stepCliAuthSetApi)

      if (envFlag("E2E_SKIP_LLAMA") || !hasLlama) {
        skipStep("llama-setup", "CLI: llamacpp setup", envFlag("E2E_SKIP_LLAMA") ? "E2E_SKIP_LLAMA=1" : "llama paths not found", results)
        skipStep("llama-status", "CLI: llamacpp status", "skipped", results)
        skipStep("llama-chat", "CLI: llama chat smoke", "skipped", results)
        skipStep("agent", "CLI: agent bash tool", "skipped", results)
      } else {
        await run("llama-setup", "CLI: llamacpp setup (zero-config wizard path)", () => stepCliLlamacppSetup(llama))
        await run("llama-status", "CLI: llamacpp status", stepCliLlamacppStatus)
        await run("llama-chat", "CLI: llama chat smoke", () => stepCliLlamacppChat(llama))
        if (!envFlag("E2E_SKIP_AGENT")) {
          await run("agent", "CLI: agent bash tool (live LLM)", stepCliAgentTools)
        } else {
          skipStep("agent", "CLI: agent bash tool", "E2E_SKIP_AGENT=1", results)
        }
      }

      await run("serve", "CLI: serve health + session + llamacpp status", stepServeHealth)
      await run("vscode-electron", "VS Code: Electron integration (test:all)", stepVscodeElectron)
      await run("desktop", "Windows: desktop artifact check", stepDesktopArtifacts)
      if (!envFlag("E2E_SKIP_PLAYWRIGHT")) {
        await run("playwright", "Desktop UI: Playwright app smoke", stepPlaywrightApp)
      } else {
        skipStep("playwright", "Desktop UI: Playwright app smoke", "E2E_SKIP_PLAYWRIGHT=1", results)
      }
    }

    if (tier === "full") {
      await run("build-standalone", "Windows: build portable (fast pack)", stepBuildStandalone)
      await run("vscode-llama", "VS Code: live llama E2E (optional)", stepVscodeLlamaE2e)
    }

    printReport(tier, results)
    console.log(`\n[e2e] ALL PASSED — tier=${tier} in ${results.reduce((s, r) => s + r.durationMs, 0)}ms step time\n`)
  } catch {
    printReport(tier, results)
    process.exit(1)
  }
}

const tier = parseTier()
runTier(tier).catch((err) => {
  console.error(err)
  process.exit(1)
})
