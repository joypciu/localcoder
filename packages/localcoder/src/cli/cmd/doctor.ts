import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { UI } from "../ui"
import os from "os"
import path from "path"
import fs from "fs"
import childProcess from "child_process"

function run(cmd: string, args: string[] = []): { ok: boolean; output: string } {
  try {
    const result = childProcess.spawnSync(cmd, args, { encoding: "utf8", timeout: 5000 })
    if (result.error) return { ok: false, output: result.error.message }
    return { ok: result.status === 0, output: (result.stdout || "").trim() }
  } catch (e) {
    return { ok: false, output: String(e) }
  }
}

function check(label: string, ok: boolean, detail: string): string {
  const icon = ok ? UI.Style.TEXT_SUCCESS + "✓" + UI.Style.TEXT_NORMAL : UI.Style.TEXT_DANGER + "✗" + UI.Style.TEXT_NORMAL
  return `${icon} ${label}: ${detail}`
}

export const DoctorCommand = effectCmd({
  command: "doctor",
  describe: "check prerequisites and diagnose common issues",
  instance: false,
  builder: (yargs) =>
    yargs.option("fix", {
      describe: "offer to fix missing configuration when possible",
      type: "boolean",
      default: false,
    }),
  handler: Effect.fn("Cli.doctor")(function* (args) {
    const lines: string[] = []
    lines.push("")
    lines.push(UI.Style.TEXT_INFO_BOLD + "LocalCoder Doctor" + UI.Style.TEXT_NORMAL)
    lines.push("")

    // Platform
    lines.push(check("Platform", true, `${os.platform()} (${os.arch()})`))

    // Bun
    const bun = run("bun", ["--version"])
    lines.push(check("Bun", bun.ok, bun.ok ? bun.output : "not found on PATH"))

    // Node
    const node = run("node", ["--version"])
    lines.push(check("Node.js", node.ok, node.ok ? node.output : "not found on PATH"))

    // Python
    const python = run("python", ["--version"])
    lines.push(check("Python", python.ok, python.ok ? python.output : "not found on PATH"))

    // PowerShell (Windows)
    if (os.platform() === "win32") {
      const ps = run("powershell.exe", ["-Command", "$PSVersionTable.PSVersion.ToString()"])
      lines.push(check("PowerShell", ps.ok, ps.ok ? ps.output : "not found"))
    }

    // LocalCoder config
    const configDir = path.join(os.homedir(), ".localcoder")
    const configExists = fs.existsSync(configDir)
    lines.push(check("Config directory", configExists, configExists ? configDir : "not created yet"))

    // llama.cpp setup
    const llamaConfigPath = path.join(configDir, "llamacpp.json")
    const llamaConfigExists = fs.existsSync(llamaConfigPath)
    if (llamaConfigExists) {
      try {
        const cfg = JSON.parse(fs.readFileSync(llamaConfigPath, "utf8"))
        const exe = path.join(cfg.llamaDir || "", "llama-server.exe")
        const model = cfg.modelPath || ""
        const exeOk = fs.existsSync(exe)
        const modelOk = fs.existsSync(model)
        lines.push(check("llama.cpp binary", exeOk, exeOk ? exe : "not found"))
        lines.push(check("GGUF model", modelOk, modelOk ? path.basename(model) : model || "not set"))
      } catch {
        lines.push(check("llama.cpp config", false, "failed to parse llamacpp.json"))
      }
    } else {
      lines.push(check("llama.cpp setup", false, "not configured — run 'localcoder llamacpp setup'"))
    }

    lines.push("")
    if (args.fix && !llamaConfigExists) {
      lines.push(UI.Style.TEXT_WARNING + "Tip: run 'localcoder llamacpp setup' to configure a local model." + UI.Style.TEXT_NORMAL)
    }

    for (const line of lines) {
      UI.println(line)
    }
  }),
})
