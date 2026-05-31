import { cmd } from "@/cli/cmd/cmd"
import { UI } from "@/cli/ui"
import { withNetworkOptions, resolveNetworkOptions } from "@/cli/network"
import { Server } from "@/server/server"
import { Flag } from "@localcoder-ai/core/flag/flag"
import { AppRuntime } from "@/effect/app-runtime"
import { Instance } from "@/project/instance"
import { InstanceStore } from "@/project/instance-store"
import { Filesystem } from "@/util/filesystem"
import { Effect } from "effect"
import { runRepl } from "@/cli/simple/repl"
import type { PermissionMode } from "@/cli/simple/context"
import open from "open"
import { networkInterfaces } from "os"
import path from "path"

function getLocalIPs() {
  const nets = networkInterfaces()
  const results: string[] = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.internal || net.family !== "IPv4") continue
      results.push(net.address)
    }
  }
  return results
}

export const SimpleCliCommand = cmd({
  command: "$0",
  describe: "start localcoder server and open web UI",
  builder: (yargs) => withNetworkOptions(yargs),
  handler: async (args) => {
    if (!Flag.LOCALCODER_SERVER_PASSWORD) {
      UI.println(UI.Style.TEXT_WARNING_BOLD + "!  LOCALCODER_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = await resolveNetworkOptions(args as any)
    const server = await Server.listen(opts)
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()

    const localhostUrl = `http://localhost:${server.port}`
    UI.println(UI.Style.TEXT_INFO_BOLD + "  Local:  " + UI.Style.TEXT_NORMAL + localhostUrl)
    if (opts.hostname === "0.0.0.0") {
      for (const ip of getLocalIPs()) {
        UI.println(UI.Style.TEXT_INFO_BOLD + "  Network:" + UI.Style.TEXT_NORMAL + ` http://${ip}:${server.port}`)
      }
    }
    UI.empty()
    UI.println(UI.Style.TEXT_DIM + "  Press Ctrl+C to stop." + UI.Style.TEXT_NORMAL)

    open(localhostUrl).catch(() => {})

    await new Promise<void>((resolve) => {
      process.on("SIGINT", () => resolve())
      process.on("SIGTERM", () => resolve())
    })
    await server.stop(true)
    process.exit(0)
  },
})

export const ReplCommand = cmd({
  command: "repl [project]",
  describe: "start interactive text REPL (no browser UI)",
  builder: (yargs) =>
    yargs
      .positional("project", { type: "string", describe: "path to start localcoder in" })
      .option("model", { type: "string", alias: ["m"], describe: "model to use (provider/model)" })
      .option("agent", { type: "string", describe: "agent to use" })
      .option("continue", { alias: ["c"], type: "boolean", describe: "continue the last session" })
      .option("session", { alias: ["s"], type: "string", describe: "session id to continue" })
      .option("fork", { type: "boolean", describe: "fork session when continuing" })
      .option("prompt", { type: "string", describe: "send an initial message then enter interactive mode" })
      .option("thinking", { type: "boolean", describe: "show reasoning blocks", default: false })
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
    const root = Filesystem.resolve(process.env.PWD ?? process.cwd())
    const next = args.project
      ? Filesystem.resolve(path.isAbsolute(args.project) ? args.project : path.join(root, args.project))
      : Filesystem.resolve(process.cwd())
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
        runRepl({ directory, model: args.model, agent: args.agent, sessionID: args.session,
          continue: args.continue, fork: args.fork, prompt: args.prompt, permissionMode, thinking: args.thinking }),
      )
    } finally {
      await AppRuntime.runPromise(store.dispose(ctx))
    }
    process.exit(0)
  },
})
