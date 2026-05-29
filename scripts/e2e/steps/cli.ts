import fs from "fs"
import path from "path"
import { envFlag, llamaAvailable, resolveLlamaPaths, type LlamaPaths } from "../lib/env"
import { waitForLlamaApi } from "../lib/llama"
import { EXE, PKG, ROOT, resolveBun } from "../lib/paths"
import { runCmd, runCmdInherit } from "../lib/runner"

const BUN = resolveBun()

export async function stepBuildCli(): Promise<string> {
  if (envFlag("E2E_SKIP_BUILD")) return "skipped (E2E_SKIP_BUILD=1)"
  if (fs.existsSync(EXE) && envFlag("E2E_SKIP_BUILD_IF_EXISTS", true)) {
    return `reusing ${EXE}`
  }
  const code = await runCmdInherit(BUN, ["run", "build:win"], { cwd: PKG })
  if (code !== 0) throw new Error(`build:win exited ${code}`)
  if (!fs.existsSync(EXE)) throw new Error(`missing ${EXE} after build`)
  return EXE
}

export async function stepCliVersion(): Promise<string> {
  if (!fs.existsSync(EXE)) throw new Error(`missing ${EXE}`)
  const { code, stdout, stderr } = await runCmd(EXE, ["--version"])
  if (code !== 0) throw new Error(`--version exited ${code}: ${stderr}`)
  return stdout.trim()
}

export async function stepCliInvalidModelFailFast(): Promise<string> {
  if (!fs.existsSync(EXE)) throw new Error(`missing ${EXE}`)
  const t0 = Date.now()
  const { code, stderr } = await runCmd(
    EXE,
    ["run", "-m", "invalid-provider/fake-model", "test"],
    { timeoutMs: 15_000 },
  )
  const ms = Date.now() - t0
  if (code === 0) throw new Error("expected non-zero exit for invalid model")
  if (ms > 10_000) throw new Error(`took ${ms}ms — expected fail-fast under 10s`)
  if (!stderr && ms < 1000) throw new Error("no stderr output from invalid model run")
  return `failed in ${ms}ms as expected`
}

export async function stepCliSessionSearch(): Promise<string> {
  if (!fs.existsSync(EXE)) throw new Error(`missing ${EXE}`)
  const { code } = await runCmd(EXE, ["session", "search", "e2e", "--limit", "1"])
  if (code !== 0) throw new Error(`session search exited ${code}`)
  return "ok"
}

export async function stepCliAuthSetApi(): Promise<string> {
  if (!fs.existsSync(EXE)) throw new Error(`missing ${EXE}`)
  const key = `e2e-test-${Date.now()}`
  const { code, stderr } = await runCmd(EXE, [
    "auth", "set-api", "--provider", "openrouter", "--key", key,
  ])
  if (code !== 0) throw new Error(`auth set-api exited ${code}: ${stderr}`)
  return "openrouter key saved"
}

export async function stepCliLlamacppSetup(paths: LlamaPaths): Promise<string> {
  if (envFlag("E2E_SKIP_LLAMA")) return "skipped (E2E_SKIP_LLAMA=1)"
  if (!llamaAvailable(paths)) {
    throw new Error(
      `llama not available — set LOCALCODER_LLAMACPP_DIR and LOCALCODER_LLAMACPP_MODEL or run llamacpp setup once`,
    )
  }
  if (!fs.existsSync(EXE)) throw new Error(`missing ${EXE}`)
  const args = [
    "llamacpp", "setup",
    "--dir", paths.llamaDir,
    "--model", paths.modelPath,
    "--ctx", process.env.LLAMACPP_CTX ?? "16384",
  ]
  if (process.env.LLAMACPP_THINKING === "0") args.push("--thinking", "false")
  else args.push("--thinking", "true")
  const code = await runCmdInherit(EXE, args)
  if (code !== 0) throw new Error(`llamacpp setup exited ${code}`)
  const modelId = await waitForLlamaApi(paths, 600_000)
  return `model=${modelId}`
}

export async function stepCliLlamacppStatus(): Promise<string> {
  if (!fs.existsSync(EXE)) throw new Error(`missing ${EXE}`)
  const { code, stdout } = await runCmd(EXE, ["llamacpp", "status"])
  if (code !== 0) throw new Error(`llamacpp status exited ${code}`)
  const status = JSON.parse(stdout) as { running?: boolean; modelId?: string }
  return `running=${String(status.running)} model=${status.modelId ?? "?"}`
}

export async function stepCliLlamacppChat(paths: LlamaPaths): Promise<string> {
  if (envFlag("E2E_SKIP_LLAMA")) return "skipped"
  const code = await runCmdInherit(BUN, ["run", path.join(ROOT, "scripts", "e2e-llamacpp.ts")], {
    env: { LLAMACPP_SKIP_SERVER: "1", LLAMACPP_API_URL: paths.apiUrl },
  })
  if (code !== 0) throw new Error(`e2e-llamacpp exited ${code}`)
  return "chat/completions OK"
}

export async function stepCliAgentTools(): Promise<string> {
  if (envFlag("E2E_SKIP_AGENT")) return "skipped (E2E_SKIP_AGENT=1)"
  const code = await runCmdInherit(BUN, ["run", path.join(ROOT, "scripts", "agent-tool-e2e.ts")], {
    env: {
      AGENT_LIVE_E2E: "1",
      AGENT_E2E_FAST: "1",
      LLAMACPP_SKIP_SERVER: "1",
      LLAMACPP_CTX: process.env.LLAMACPP_CTX ?? "4096",
      LOCALCODER_EXE: EXE,
      AGENT_RUN_TIMEOUT_MS: process.env.AGENT_RUN_TIMEOUT_MS ?? "240000",
      AGENT_SKIP_EXE: envFlag("E2E_AGENT_SKIP_EXE") ? "1" : "0",
    },
  })
  if (code !== 0) throw new Error(`agent-tool-e2e exited ${code}`)
  return "bash tool via localcoder run OK"
}

export function getLlamaPaths(): LlamaPaths {
  return resolveLlamaPaths()
}
