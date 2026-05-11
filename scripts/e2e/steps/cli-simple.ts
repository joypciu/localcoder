import fs from "fs"
import { EXE, PKG, resolveBun } from "../lib/paths"
import { runCmd } from "../lib/runner"

const BUN = resolveBun()

/** Dev tree: verify default interactive CLI is wired (no Windows exe required). */
export async function stepCliSimpleDevHelp(): Promise<string> {
  const { code, stdout, stderr } = await runCmd(BUN, [
    "run",
    "--conditions=browser",
    "./src/index.ts",
    "--help",
  ], { cwd: PKG, timeoutMs: 60_000 })
  const out = `${stdout}\n${stderr}`
  if (code !== 0) throw new Error(`simple CLI --help exited ${code}`)
  if (!out.includes("interactive CLI")) throw new Error("help missing interactive CLI default")
  if (!out.includes("permission-mode")) throw new Error("help missing --permission-mode")
  if (!out.includes("localcoder tui")) throw new Error("help missing legacy tui subcommand")
  return "dev help ok"
}

export async function stepCliSimpleExeHelp(): Promise<string> {
  if (!fs.existsSync(EXE)) throw new Error(`missing ${EXE}`)
  const { code, stdout, stderr } = await runCmd(EXE, ["--help"], { timeoutMs: 30_000 })
  const out = `${stdout}\n${stderr}`
  if (code !== 0) throw new Error(`exe --help exited ${code}`)
  if (!out.includes("interactive CLI")) throw new Error("built exe help missing interactive CLI")
  if (out.includes("start localcoder tui") && out.match(/\[default\]/)) {
    const line = out.split("\n").find((l) => l.includes("[default]") && l.includes("tui"))
    if (line && !line.includes("interactive CLI")) {
      throw new Error("stale exe: TUI still default — run build:win or E2E_FORCE_CLI_BUILD=1")
    }
  }
  return "exe help ok"
}
