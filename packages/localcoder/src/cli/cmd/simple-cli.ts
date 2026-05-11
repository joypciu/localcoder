import { cmd } from "@/cli/cmd/cmd"
import { runRepl } from "@/cli/simple/repl"
import { resolveThreadDirectory } from "@/cli/cmd/tui/thread"
import { UI } from "@/cli/ui"
import { AppRuntime } from "@/effect/app-runtime"
import { Instance } from "@/project/instance"
import { InstanceStore } from "@/project/instance-store"
import { Filesystem } from "@/util/filesystem"
import { Effect } from "effect"
import type { PermissionMode } from "@/cli/simple/context"

export const SimpleCliCommand = cmd({
  command: "$0 [project]",
  describe: "start localcoder interactive CLI",
  builder: (yargs) =>
    yargs
      .positional("project", {
        type: "string",
        describe: "path to start localcoder in",
      })
      .option("model", {
        type: "string",
        alias: ["m"],
        describe: "model to use (provider/model)",
      })
      .option("agent", {
        type: "string",
        describe: "agent to use",
      })
      .option("continue", {
        alias: ["c"],
        type: "boolean",
        describe: "continue the last session",
      })
      .option("session", {
        alias: ["s"],
        type: "string",
        describe: "session id to continue",
      })
      .option("fork", {
        type: "boolean",
        describe: "fork session when continuing",
      })
      .option("prompt", {
        type: "string",
        describe: "send an initial message, then enter interactive mode",
      })
      .option("thinking", {
        type: "boolean",
        describe: "show reasoning blocks",
        default: false,
      })
      .option("permission-mode", {
        type: "string",
        choices: ["interactive", "accept", "reject"] as const,
        describe: "how to handle permission prompts (default: interactive)",
      })
      .option("dangerously-skip-permissions", {
        type: "boolean",
        describe: "alias for --permission-mode accept (dangerous)",
        default: false,
      }),
  handler: async (args) => {
    const next = resolveThreadDirectory(args.project)
    try {
      process.chdir(next)
    } catch {
      UI.error("Failed to change directory to " + next)
      process.exit(1)
    }
    const directory = Filesystem.resolve(process.cwd())

    const permissionMode: PermissionMode = args["dangerously-skip-permissions"]
      ? "accept"
      : ((args["permission-mode"] as PermissionMode | undefined) ?? "interactive")

    const { store, ctx } = await AppRuntime.runPromise(
      InstanceStore.Service.use((store) =>
        store.load({ directory }).pipe(Effect.map((ctx) => ({ store, ctx }))),
      ),
    )

    try {
      await Instance.restore(ctx, () =>
        runRepl({
          directory,
          model: args.model,
          agent: args.agent,
          sessionID: args.session,
          continue: args.continue,
          fork: args.fork,
          prompt: args.prompt,
          permissionMode,
          thinking: args.thinking,
        }),
      )
    } finally {
      await AppRuntime.runPromise(store.dispose(ctx))
    }
    process.exit(0)
  },
})
