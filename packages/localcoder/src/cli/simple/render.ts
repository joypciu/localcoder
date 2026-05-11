import path from "path"
import { UI } from "@/cli/ui"
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
import { Locale } from "@/util/locale"

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

function inline(icon: string, title: string, description?: string) {
  const suffix = description ? UI.Style.TEXT_DIM + ` ${description}` + UI.Style.TEXT_NORMAL : ""
  UI.println(UI.Style.TEXT_NORMAL + icon, UI.Style.TEXT_NORMAL + title + suffix)
}

function block(icon: string, title: string, output?: string) {
  UI.empty()
  inline(icon, title)
  if (output?.trim()) UI.println(output)
  UI.empty()
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
      block("$", info.input.command, info.part.state.status === "completed" ? info.part.state.output?.trim() : undefined)
      return
    }
    if (part.tool === "glob") {
      const info = props<typeof GlobTool>(part)
      const root = info.input.path ?? ""
      const num = info.metadata.count
      inline("✱", `Glob "${info.input.pattern}"`, num !== undefined ? `${num} matches` : root || undefined)
      return
    }
    if (part.tool === "grep") {
      const info = props<typeof GrepTool>(part)
      const num = info.metadata.matches
      inline("✱", `Grep "${info.input.pattern}"`, num !== undefined ? `${num} matches` : undefined)
      return
    }
    if (part.tool === "read") {
      const info = props<typeof ReadTool>(part)
      inline("→", `Read ${normalizePath(info.input.filePath)}`)
      return
    }
    if (part.tool === "write") {
      const info = props<typeof WriteTool>(part)
      block("←", `Write ${normalizePath(info.input.filePath)}`, info.part.state.status === "completed" ? info.part.state.output : undefined)
      return
    }
    if (part.tool === "webfetch") {
      inline("%", `WebFetch ${props<typeof WebFetchTool>(part).input.url}`)
      return
    }
    if (part.tool === "edit") {
      const info = props<typeof EditTool>(part)
      block("←", `Edit ${normalizePath(info.input.filePath)}`, info.metadata.diff)
      return
    }
    if (part.tool === "websearch") {
      inline("◈", `WebSearch "${props<typeof WebSearchTool>(part).input.query}"`)
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
      inline(icon, Locale.titlecase(subagent) + " task", input.description as string | undefined)
      return
    }
    if (part.tool === "skill") {
      inline("→", `Skill "${props<typeof SkillTool>(part).input.name}"`)
      return
    }
    if (part.tool === "todowrite") {
      const info = props<typeof TodoWriteTool>(part)
      block(
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
  inline("⚙", `${part.tool} ${title}`)
  if (state.status === "error" && "error" in state) UI.error(String(state.error))
}
