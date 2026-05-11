import fs from "fs"
import path from "path"
import { DESKTOP, DESKTOP_EXE, EXE, PKG, ROOT, resolveBun } from "../lib/paths"
import { runCmd, runCmdInherit } from "../lib/runner"

const BUN = resolveBun()

export async function stepDesktopShellTypecheck(): Promise<string> {
  const shellRoot = path.join(ROOT, "packages", "desktop-shell")
  const outDir = path.join(ROOT, "scripts", "e2e", ".artifacts", "shell-bundle")
  fs.mkdirSync(outDir, { recursive: true })
  const code = await runCmdInherit(
    BUN,
    [
      "build",
      path.join(shellRoot, "src", "index.tsx"),
      "--outdir",
      outDir,
      "--target",
      "browser",
      "--external",
      "@localcoder-ai/sdk",
      "--external",
      "solid-js",
    ],
    { cwd: shellRoot },
  )
  if (code !== 0) throw new Error(`desktop-shell bundle check exited ${code}`)
  const out = fs.readdirSync(outDir).find((f) => f.endsWith(".js"))
  if (!out) throw new Error("no bundle output from desktop-shell")
  return `bundled ${out}`
}

export async function stepDesktopViteBuild(): Promise<string> {
  const code = await runCmdInherit(BUN, ["run", "build"], { cwd: DESKTOP })
  if (code !== 0) throw new Error(`desktop vite build exited ${code}`)
  const shellHtml = path.join(DESKTOP, "out", "renderer", "shell.html")
  const assets = path.join(DESKTOP, "out", "renderer", "assets")
  const serverBundle = path.join(DESKTOP, "out", "main", "localcoder-server", "node.js")
  if (!fs.existsSync(shellHtml)) {
    throw new Error(`missing ${shellHtml} — shell UI not in renderer output`)
  }
  if (!fs.existsSync(assets)) throw new Error("missing renderer assets")
  if (!fs.existsSync(serverBundle)) throw new Error(`missing ${serverBundle}`)
  return "desktop shell renderer + sidecar bundle OK"
}

/** Non-interactive: version + run fail-fast (same as standard invalid-model). */
export async function stepCliExeSmoke(): Promise<string> {
  if (!fs.existsSync(EXE)) throw new Error(`missing ${EXE}`)
  const ver = await runCmd(EXE, ["--version"], { timeoutMs: 15_000 })
  if (ver.code !== 0) throw new Error(`--version failed: ${ver.stderr}`)
  const run = await runCmd(
    EXE,
    ["run", "-m", "invalid-provider/fake-model", "e2e-smoke"],
    { timeoutMs: 20_000, cwd: ROOT },
  )
  if (run.code === 0) throw new Error("invalid model run should fail")
  return `version=${ver.stdout.trim()} invalid-model fail ok`
}

/** Dev tree: `run` subcommand exits non-zero for bad model. */
export async function stepCliDevRunFailFast(): Promise<string> {
  const t0 = Date.now()
  const { code, stderr } = await runCmd(
    BUN,
    ["run", "--conditions=browser", "./src/index.ts", "run", "-m", "invalid/x", "x"],
    { cwd: PKG, timeoutMs: 30_000 },
  )
  const ms = Date.now() - t0
  if (code === 0) throw new Error("expected non-zero for invalid model")
  if (ms > 25_000) throw new Error(`slow fail-fast: ${ms}ms`)
  if (!stderr.trim()) throw new Error("no stderr from invalid model run")
  return `dev run failed in ${ms}ms`
}

export async function stepDesktopExeShellAsset(): Promise<string> {
  if (!fs.existsSync(DESKTOP_EXE)) {
    throw new Error(`missing ${DESKTOP_EXE} — build desktop first or set E2E_BUILD_DESKTOP_IF_MISSING`)
  }
  const asar = path.join(DESKTOP, "dist", "win-unpacked", "resources", "app.asar")
  if (!fs.existsSync(asar)) {
    return `exe present (${DESKTOP_EXE}), asar not inspected`
  }
  return "LocalCoder.exe present"
}
