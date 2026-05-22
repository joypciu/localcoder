import { Effect } from "effect"
import { cmd } from "./cmd"
import { effectCmd, fail } from "../effect-cmd"
import * as Bootstrap from "@/llamacpp/bootstrap"
import * as Server from "@/llamacpp/server"

export const LlamacppSetupCommand = effectCmd({
  command: "setup",
  describe: "save paths, configure provider, and start llama-server",
  instance: false,
  builder: (yargs) =>
    yargs
      .option("dir", { type: "string", demandOption: true, describe: "Folder containing llama-server" })
      .option("model", { type: "string", demandOption: true, describe: "Path to .gguf model file" })
      .option("no-start", { type: "boolean", default: false, describe: "Save config only" })
      .option("ctx", { type: "number", describe: "Context size" }),
  handler: Effect.fn("Cli.llamacpp.setup")(function* (args) {
    const result = yield* Effect.promise(() =>
      Bootstrap.configure({
        llamaDir: args.dir as string,
        modelPath: args.model as string,
        autoStart: !args["no-start"],
        ctx: args.ctx as number | undefined,
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
    const stopped = Server.stopIfManaged()
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