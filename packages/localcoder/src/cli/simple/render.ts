import path from "path"
import type { ToolPart } from "@localcoder-ai/sdk/v2"
import { Tool } from "@/tool/tool"
import { GlobTool } from "@/tool/glob"
import { GrepTool } from "@/tool/grep"
import { ReadTool } from "@/tool/read"
import { WebFetchTool } from "@/tool/webfetch"
import { EditTool } from "@/tool/edit"
import { WriteTool } from "@/tool/write"
import { WebSearchTool } from "@/tool/websearch"
import { TaskTool } from "@/tool/task"
import { SkillTool } from "@/tool/skill"
import { ShellTool } from "@/tool/shell"
import { ShellID } from "@/tool/shell/id"
import { TodoWriteTool } from "@/tool/todo"
import { UI } from "@/cli/ui"
import { Locale } from "@/util/locale"
import { toolBlock, toolLine } from "./display"

type ToolProps<T> = {
  input: Tool.InferParameters<T>
  metadata: Tool.InferMetadata<T>
  part: ToolPart
}

function props<T>(part: ToolPart): ToolProps<T> {
  const state = part.state
  return {
    input: state.input as Tool.InferParameters<T>,
    metadata: ("metadata" in state ? state.metadata : {}) as Tool.InferMetadata<T>,
    part,
  }
}

function normalizePath(input?: string) {
  if (!input) return ""
  if (path.isAbsolute(input)) return path.relative(process.cwd(), input) || "."
  return input
}

export function renderTool(part: ToolPart) {
  try {
    if (part.tool === ShellID.ToolID) {
      const info = props<typeof ShellTool>(part)
      const out =
        part.state.status === "completed" && "output" in part.state
          ? part.state.output?.trim()
          : undefined
      toolBlock("$", info.input.command, out)
      return
    }
    if (part.tool === "glob") {
      const info = props<typeof GlobTool>(part)
      const num = info.metadata.count
      toolLine("✱", `Glob ${info.input.pattern}`, num !== undefined ? `${num} matches` : undefined)
      return
    }
    if (part.tool === "grep") {
      const info = props<typeof GrepTool>(part)
      const num = info.metadata.matches
      toolLine("✱", `Grep ${info.input.pattern}`, num !== undefined ? `${num} matches` : undefined)
      return
    }
    if (part.tool === "read") {
      const info = props<typeof ReadTool>(part)
      toolLine("→", `Read ${normalizePath(info.input.filePath)}`)
      return
    }
    if (part.tool === "write") {
      const info = props<typeof WriteTool>(part)
      toolLine("←", `Write ${normalizePath(info.input.filePath)}`)
      return
    }
    if (part.tool === "webfetch") {
      toolLine("%", `Fetch ${props<typeof WebFetchTool>(part).input.url}`)
      return
    }
    if (part.tool === "edit") {
      const info = props<typeof EditTool>(part)
      toolBlock("←", `Edit ${normalizePath(info.input.filePath)}`, info.metadata.diff)
      return
    }
    if (part.tool === "websearch") {
      toolLine("◈", `Search ${props<typeof WebSearchTool>(part).input.query}`)
      return
    }
    if (part.tool === "task") {
      const info = props<typeof TaskTool>(part)
      const input = info.part.state.input
      const status = info.part.state.status
      const subagent =
        typeof input.subagent_type === "string" && input.subagent_type.trim().length > 0
          ? input.subagent_type
          : "unknown"
      const icon = status === "error" ? "✗" : status === "running" ? "•" : "✓"
      toolLine(icon, `${Locale.titlecase(subagent)} task`, input.description as string | undefined)
      return
    }
    if (part.tool === "skill") {
      toolLine("→", `Skill ${props<typeof SkillTool>(part).input.name}`)
      return
    }
    if (part.tool === "todowrite") {
      const info = props<typeof TodoWriteTool>(part)
      toolBlock(
        "#",
        "Todos",
        info.input.todos.map((t) => `${t.status === "completed" ? "[x]" : "[ ]"} ${t.content}`).join("\n"),
      )
      return
    }
  } catch {
    // fall through
  }
  const state = part.state
  const title =
    ("title" in state && state.title) ||
    ("input" in state && typeof state.input === "object" ? JSON.stringify(state.input).slice(0, 80) : part.tool)
  toolLine("⚙", `${part.tool} ${title}`)
  if (state.status === "error" && "error" in state) {
    UI.error(String(state.error))
  }
}
