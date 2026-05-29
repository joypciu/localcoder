import path from "path"
import fs from "fs"
import { Effect, Option } from "effect"
import { cmd } from "./cmd"
import { effectCmd } from "../effect-cmd"
import * as Bootstrap from "@/llamacpp/bootstrap"
import * as Server from "@/llamacpp/server"
import * as Setup from "@/llamacpp/setup"
import * as Prompt from "../effect/prompt"
import { UI } from "../ui"

const promptValue = <Value>(value: Option.Option<Value>) => {
  if (Option.isNone(value)) return Effect.die(new UI.CancelledError())
  return Effect.succeed(value.value)
}

const interactiveSetup = Effect.fn("Cli.llamacpp.interactiveSetup")(function* () {
  const saved = Setup.loadUserLlamaConfig()
  UI.println(UI.Style.TEXT_INFO_BOLD + "llama.cpp setup" + UI.Style.TEXT_NORMAL)
  UI.println("Pick your llama.cpp folder (must contain llama-server) and a GGUF model.")
  UI.println("LocalCoder will save paths and start the server for you.\n")

  const dirDefault = saved.llamaDir ?? Setup.resolveLlamaDir()
  const dirInput = yield* Prompt.text({
    message: "llama.cpp folder",
    placeholder: dirDefault,
    initialValue: dirDefault,
    validate: (v) => {
      const dir = (v ?? dirDefault).trim()
      const exe = path.join(dir, process.platform === "win32" ? "llama-server.exe" : "llama-server")
      if (!fs.existsSync(exe)) return `llama-server not found in ${dir}`
      return undefined
    },
  })
  const llamaDir = (yield* promptValue(dirInput)).trim() || dirDefault

  const discovered = Setup.findGgufFiles(24)
  let modelPath = saved.modelPath ?? Setup.resolveModelPath() ?? ""
  if (discovered.length > 0) {
    const picked = yield* Prompt.select({
      message: "GGUF model",
      options: [
        ...discovered.map((p) => ({
          label: path.basename(p),
          hint: p,
          value: p,
        })),
        { label: "Enter path manually…", value: "__manual__" as const },
      ],
    })
    const choice = yield* promptValue(picked)
    if (choice !== "__manual__") modelPath = choice
  }
  if (!modelPath || !modelPath.toLowerCase().endsWith(".gguf")) {
    const manual = yield* Prompt.text({
      message: "Path to .gguf model",
      placeholder: modelPath || "C:\\models\\model.gguf",
      initialValue: modelPath || undefined,
      validate: (v) => {
        if (!v?.trim().toLowerCase().endsWith(".gguf")) return "Must be a .gguf file"
        if (!fs.existsSync(v.trim())) return "File not found"
        return undefined
      },
    })
    modelPath = (yield* promptValue(manual)).trim()
  }

  const ctxDefault = Setup.defaultContextSize(modelPath)
  const ctxOptions = [
    ...Setup.CONTEXT_PRESETS.map((n) => ({ label: String(n), value: String(n) })),
    { label: "Custom…", value: "custom" },
  ]
  const ctxPick = yield* Prompt.select({
    message: "Context size (tokens)",
    options: ctxOptions,
    initialValue: Setup.CONTEXT_PRESETS.includes(ctxDefault as (typeof Setup.CONTEXT_PRESETS)[number])
      ? String(ctxDefault)
      : "16384",
  })
  const ctxChoice = yield* promptValue(ctxPick)
  let ctx = ctxChoice === "custom" ? 0 : Number(ctxChoice)
  if (ctxChoice === "custom") {
    const custom = yield* Prompt.text({
      message: "Custom context size",
      validate: (v) => {
        const n = Number(v)
        if (!Number.isInteger(n) || n < 512) return "Enter a positive integer (e.g. 16384)"
        return undefined
      },
    })
    ctx = Number(yield* promptValue(custom))
  }

  let thinking: boolean | undefined
  if (Setup.modelSupportsThinkingToggle(modelPath)) {
    const t = yield* Prompt.select({
      message: "Thinking / reasoning mode",
      options: [
        { label: "Enabled (recommended for Qwen/Qwopus)", value: "on" },
        { label: "Disabled", value: "off" },
      ],
      initialValue: Setup.resolveThinkingEnabled(modelPath) ? "on" : "off",
    })
    thinking = (yield* promptValue(t)) === "on"
  }

  return { llamaDir, modelPath, ctx, thinking }
})

export const LlamacppSetupCommand = effectCmd({
  command: "setup",
  describe: "save paths, configure provider, and start llama-server",
  instance: false,
  builder: (yargs) =>
    yargs
      .option("dir", { type: "string", describe: "Folder containing llama-server (interactive if omitted)" })
      .option("model", { type: "string", describe: "Path to .gguf model file (interactive if omitted)" })
      .option("save-only", { type: "boolean", default: false, describe: "Save config only (do not start server)" })
      .option("no-start", { type: "boolean", default: false, describe: "Alias for --save-only" })
      .option("ctx", { type: "number", describe: "Context size" })
      .option("thinking", { type: "boolean", describe: "Enable thinking mode for Qwen/Qwopus models" }),
  handler: Effect.fn("Cli.llamacpp.setup")(function* (args) {
    let llamaDir = args.dir as string | undefined
    let modelPath = args.model as string | undefined
    let ctx = args.ctx as number | undefined
    let thinking = args.thinking as boolean | undefined

    if (!llamaDir || !modelPath) {
      const picked = yield* interactiveSetup
      llamaDir = llamaDir ?? picked.llamaDir
      modelPath = modelPath ?? picked.modelPath
      ctx = ctx ?? picked.ctx
      thinking = thinking ?? picked.thinking
    }

    const result = yield* Effect.promise(() =>
      Bootstrap.configure({
        llamaDir,
        modelPath,
        autoStart: !(args["save-only"] || args["no-start"]),
        ctx,
        thinking,
      }),
    )
    console.log(JSON.stringify(result, null, 2))
  }),
})

export const LlamacppStatusCommand = effectCmd({
  command: "status",
  describe: "show llama.cpp status",
  instance: false,
  handler: Effect.fn("Cli.llamacpp.status")(function* () {
    const status = yield* Effect.promise(() => Bootstrap.getPublicStatus())
    console.log(JSON.stringify(status, null, 2))
  }),
})

export const LlamacppStopCommand = effectCmd({
  command: "stop",
  describe: "stop managed llama-server",
  instance: false,
  handler: Effect.fn("Cli.llamacpp.stop")(function* () {
    const stopped = yield* Effect.promise(() => Server.stopIfManaged())
    console.log(stopped ? "stopped managed llama-server" : "no managed llama-server")
  }),
})

export const LlamacppCommand = cmd({
  command: "llamacpp",
  describe: "configure and manage local llama.cpp server",
  builder: (yargs) =>
    yargs
      .command(LlamacppSetupCommand)
      .command(LlamacppStatusCommand)
      .command(LlamacppStopCommand)
      .demandCommand(),
  async handler() {},
})