from pathlib import Path
R = Path(r"P:/localcoder/packages/localcoder/src")

# registry
p = R / "tool/registry.ts"
t = p.read_text(encoding="utf-8")
if "ListTool" not in t:
    t = t.replace('import { GlobTool } from "./glob"', 'import { GlobTool } from "./glob"\nimport { ListTool } from "./list"')
    t = t.replace("const globtool = yield* GlobTool", "const listtool = yield* ListTool\n    const globtool = yield* GlobTool")
    t = t.replace("glob: Tool.init(globtool),", "list: Tool.init(listtool),\n          glob: Tool.init(globtool),")
    t = t.replace("tool.read,", "tool.read,\n            tool.list,")
    p.write_text(t, encoding="utf-8")
    print("registry")

# list.ts - use readDirectory
list_ts = r'''import path from "path"
import { Effect, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { AppFileSystem } from "@localcoder-ai/core/filesystem"
import { assertExternalDirectoryEffect } from "./external-directory"
import DESCRIPTION from "./list.txt"
import * as Tool from "./tool"

const MAX = 200

export const Parameters = Schema.Struct({
  path: Schema.optional(Schema.String).annotate({
    description: "Directory to list. Defaults to cwd.",
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
          yield* ctx.ask({ permission: "list", patterns: ["*"], always: ["*"], metadata: { path: params.path } })
          let target = params.path ?? ins.directory
          target = path.isAbsolute(target) ? target : path.resolve(ins.directory, target)
          yield* assertExternalDirectoryEffect(ctx, target, { kind: "directory" })
          const names = yield* fs.readDirectory(target).pipe(Effect.catch(() => Effect.succeed([] as string[])))
          const rows: string[] = []
          for (const name of names) {
            if (name.startsWith(".") or name == "node_modules"):
              continue
            full = path.join(target, name)
            info = yield* fs.stat(full).pipe(Effect.catch(() => Effect.succeed(None)))
            if info is None:
              continue
            kind = "d" if info.type == "Directory" else "f"
            rows.append(f"{kind} {name}")
            if len(rows) >= MAX:
              break
          rows.sort()
          rel = path.relative(ins.directory, target) or "."
          out = "\n".join([f"Directory: {rel}", *rows])
          return { title: rel, output: out or "(empty)", metadata: { path: rel } }
        }).pipe(Effect.orDie),
    }
  }),
)
'''
# fix python syntax in list_ts - I used python syntax by mistake in TS file!
