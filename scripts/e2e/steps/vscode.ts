import fs from "fs"
import path from "path"
import { envFlag, llamaAvailable, resolveLlamaPaths } from "../lib/env"
import { ROOT, VSCODE, resolveBun } from "../lib/paths"
import { runCmdInherit } from "../lib/runner"
import type { E2eTier } from "../lib/runner"

const BUN = resolveBun()

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8")
}

export async function stepVscodeCompile(): Promise<string> {
  const code = await runCmdInherit(BUN, ["run", "compile"], { cwd: VSCODE })
  if (code !== 0) throw new Error(`compile exited ${code}`)
  const ext = readText(path.join(VSCODE, "dist", "extension.js"))
  for (const needle of ["runLlamaSetupWizard", "pickAndConfigureCloudProvider", "localcoder.setupLlamaCpp"]) {
    if (!ext.includes(needle)) throw new Error(`dist/extension.js missing ${needle}`)
  }
  return "extension.js OK"
}

export async function stepVscodeUnit(): Promise<string> {
  const code = await runCmdInherit(BUN, ["run", "test:unit"], { cwd: VSCODE })
  if (code !== 0) throw new Error(`test:unit exited ${code}`)
  return "contract tests passed"
}

export async function stepVscodeWizardContract(): Promise<string> {
  const html = readText(path.join(VSCODE, "media", "chat.html"))
  const manifest = JSON.parse(readText(path.join(VSCODE, "package.json"))) as {
    contributes?: { commands?: Array<{ command: string }> }
  }
  const commands = (manifest.contributes?.commands ?? []).map((c) => c.command)
  for (const cmd of ["localcoder.setupLlamaCpp", "localcoder.connectProvider"]) {
    if (!commands.includes(cmd)) throw new Error(`missing command ${cmd}`)
  }
  for (const id of ["cfg-llama", "cfg-cloud"]) {
    if (!html.includes(`id="${id}"`)) throw new Error(`chat.html missing #${id}`)
  }
  for (const msg of ["setupLlamaCpp", "connectProvider"]) {
    if (!html.includes(msg)) throw new Error(`chat.html missing message ${msg}`)
  }
  return "wizard UI + commands registered"
}

export async function stepVscodeElectron(): Promise<string> {
  if (envFlag("E2E_SKIP_VSCODE_ELECTRON")) return "skipped (E2E_SKIP_VSCODE_ELECTRON=1)"
  const code = await runCmdInherit(BUN, ["run", "test:all"], {
    cwd: VSCODE,
    env: { VSCODE_LLAMA_E2E: "0" },
  })
  if (code !== 0) throw new Error(`test:all exited ${code}`)
  return "Electron integration passed"
}

export async function stepVscodeBackendLive(): Promise<string> {
  if (envFlag("E2E_SKIP_VSCODE_LIVE")) return "skipped"
  await runCmdInherit(BUN, ["run", "compile-tests"], { cwd: VSCODE })
  const code = await runCmdInherit(BUN, [
    "x", "mocha", "out/test/suite/backend-live.test.js",
    "--ui", "tdd", "--timeout", "120000",
  ], { cwd: VSCODE })
  if (code !== 0) throw new Error(`backend-live exited ${code}`)
  return "serve backend live test passed"
}

export async function stepVscodeLlamaE2e(ctx?: { tier?: E2eTier; hasLlama?: boolean }): Promise<string> {
  if (envFlag("E2E_SKIP_LLAMA_VSCODE")) {
    return "skipped (E2E_SKIP_LLAMA_VSCODE=1)"
  }

  const tier = ctx?.tier ?? "standard"
  const hasLlama = ctx?.hasLlama ?? llamaAvailable(resolveLlamaPaths())
  const force = envFlag("E2E_LLAMA_VSCODE") || envFlag("VSCODE_LLAMA_E2E")

  if (tier !== "full" && !force) {
    return "skipped (full tier only; set E2E_LLAMA_VSCODE=1 to force on other tiers)"
  }
  if (!hasLlama && !force) {
    return "skipped (llama paths not found)"
  }

  const code = await runCmdInherit(BUN, ["run", "test:llama-vscode"], {
    cwd: VSCODE,
    env: { VSCODE_LLAMA_E2E: "1" },
  })
  if (code !== 0) throw new Error(`test:llama-vscode exited ${code}`)

  if (!envFlag("E2E_SKIP_LLAMACPP_E2E")) {
    const mochaCode = await runCmdInherit(BUN, ["run", "test:llama-e2e"], { cwd: VSCODE })
    if (mochaCode !== 0) throw new Error(`test:llama-e2e exited ${mochaCode}`)
    return "live llama VS Code + llamacpp E2E passed"
  }

  return "live llama VS Code E2E passed"
}

export async function stepVscodeExtensionRunner(): Promise<string> {
  const code = await runCmdInherit(BUN, ["run", path.join(ROOT, "scripts", "vscode-extension-e2e.ts")], {
    env: {
      VSCODE_E2E_SKIP_LIVE: envFlag("E2E_SKIP_VSCODE_LIVE") ? "1" : "0",
      VSCODE_E2E_SKIP_VSCODE: envFlag("E2E_SKIP_VSCODE_ELECTRON") ? "1" : "0",
    },
  })
  if (code !== 0) throw new Error(`vscode-extension-e2e exited ${code}`)
  return "vscode-extension-e2e passed"
}

export async function stepVscodeCompiledWizardCliBridge(): Promise<string> {
  const ext = readText(path.join(VSCODE, "dist", "extension.js"))
  if (!ext.includes('"llamacpp"') || !ext.includes('"setup"')) {
    throw new Error("extension does not spawn llamacpp setup")
  }
  if (!ext.includes('"auth"') || !ext.includes('"set-api"')) {
    throw new Error("extension does not spawn auth set-api")
  }
  return "CLI bridge strings present in bundle"
}
