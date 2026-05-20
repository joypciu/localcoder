import path from "path"
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { AppFileSystem } from "@localcoder-ai/core/filesystem"
import { assertExternalDirectoryEffect } from "./external-directory"
import DESCRIPTION from "./list.txt"
import * as Tool from "./tool"

const MAX_ENTRIES = 200

export const Parameters = Schema.Struct({
  path: Schema.optional(Schema.String).annotate({
    description: "Directory to list. Defaults to the working directory.",
  }),
})

export const ListTool = Tool.define(
  "list",
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { path?: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const ins = yield* InstanceState.context
          yield* ctx.ask({
            permission: "list",
            patterns: ["*"],
            always: ["*"],
            metadata: { path: params.path },
          })
          let target = params.path ?? ins.directory
          target = path.isAbsolute(target) ? target : path.resolve(ins.directory, target)
          yield* assertExternalDirectoryEffect(ctx, target, { kind: "directory" })
          const names = yield* fs.readDirectory(target).pipe(Effect.catch(() => Effect.succeed([] as string[])))
          const lines: string[] = []
          for (const name of names) {
            if (name.startsWith(".") || name === "node_modules") continue
            const full = path.join(target, name)
            const info = yield* fs.stat(full).pipe(Effect.catch(() => Effect.succeed(undefined)))
            if (!info) continue
            const kind = info.type === "Directory" ? "d" : "f"
            lines.push(`${kind} ${name}`)
            if (lines.length >= MAX_ENTRIES) break
          }
          lines.sort()
          const rel = path.relative(ins.directory, target) || "."
          const output = ["Directory: " + rel, ...lines].join("\n")
          return { title: rel, output: output || "(empty)", metadata: { path: rel } }
        }).pipe(Effect.orDie),
    }
  }),
)
