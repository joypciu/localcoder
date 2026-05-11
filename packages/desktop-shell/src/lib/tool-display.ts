import type { Part } from "@localcoder-ai/sdk/v2"

export type ToolDisplay = {
  icon: string
  title: string
  detail?: string
  diff?: string
}

function pathLabel(input?: string) {
  if (!input) return ""
  return input.replace(/\\/g, "/")
}

export function toolDisplay(part: Extract<Part, { type: "tool" }>): ToolDisplay {
  const state = part.state
  const input = "input" in state ? (state.input as Record<string, unknown>) : {}

  if (part.tool === "bash" || part.tool === "shell") {
    return {
      icon: "$",
      title: `$ ${String(input.command ?? "")}`,
      detail: state.status === "completed" && "output" in state ? String(state.output ?? "").trim() : undefined,
    }
  }
  if (part.tool === "read") {
    return { icon: "→", title: `Read ${pathLabel(String(input.filePath ?? ""))}` }
  }
  if (part.tool === "write") {
    return {
      icon: "←",
      title: `Write ${pathLabel(String(input.filePath ?? ""))}`,
      detail: state.status === "completed" && "output" in state ? String(state.output ?? "") : undefined,
    }
  }
  if (part.tool === "edit" || part.tool === "patch") {
    const meta = "metadata" in state ? (state.metadata as { diff?: string }) : {}
    return {
      icon: "←",
      title: `${part.tool === "patch" ? "Patch" : "Edit"} ${pathLabel(String(input.filePath ?? ""))}`,
      diff: meta.diff,
    }
  }
  if (part.tool === "glob") {
    const meta = "metadata" in state ? (state.metadata as { count?: number }) : {}
    return { icon: "✱", title: `Glob "${String(input.pattern ?? "")}"`, detail: meta.count !== undefined ? `${meta.count} matches` : undefined }
  }
  if (part.tool === "grep") {
    const meta = "metadata" in state ? (state.metadata as { matches?: number }) : {}
    return { icon: "✱", title: `Grep "${String(input.pattern ?? "")}"`, detail: meta.matches !== undefined ? `${meta.matches} matches` : undefined }
  }

  return { icon: "⚙", title: part.tool }
}
