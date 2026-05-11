import { createMemo } from "solid-js"
import type { KeyBinding } from "@opentui/core"
import { useKeybind } from "../context/keybind"
import { Keybind } from "@/util/keybind"

const TEXTAREA_ACTIONS = [
  "submit",
  "newline",
  "move-left",
  "move-right",
  "move-up",
  "move-down",
  "select-left",
  "select-right",
  "select-up",
  "select-down",
  "line-home",
  "line-end",
  "select-line-home",
  "select-line-end",
  "visual-line-home",
  "visual-line-end",
  "select-visual-line-home",
  "select-visual-line-end",
  "buffer-home",
  "buffer-end",
  "select-buffer-home",
  "select-buffer-end",
  "delete-line",
  "delete-to-line-end",
  "delete-to-line-start",
  "backspace",
  "delete",
  "undo",
  "redo",
  "word-forward",
  "word-backward",
  "select-word-forward",
  "select-word-backward",
  "delete-word-forward",
  "delete-word-backward",
] as const

function mapTextareaKeybindings(
  keybinds: Record<string, Keybind.Info[]>,
  action: (typeof TEXTAREA_ACTIONS)[number],
): KeyBinding[] {
  const configKey = `input_${action.replace(/-/g, "_")}`
  const bindings = keybinds[configKey]
  if (!bindings) return []
  return bindings.map((binding) => ({
    name: binding.name,
    ctrl: binding.ctrl || undefined,
    meta: binding.meta || undefined,
    shift: binding.shift || undefined,
    super: binding.super || undefined,
    action,
  }))
}

export function buildTextareaKeybindings(keybinds: Record<string, Keybind.Info[]>) {
  return [
    { name: "return", shift: true, action: "newline" },
    { name: "return", ctrl: true, action: "newline" },
    { name: "return", meta: true, action: "newline" },
    ...TEXTAREA_ACTIONS.filter((action) => action !== "submit").flatMap((action) =>
      mapTextareaKeybindings(keybinds, action),
    ),
    ...mapTextareaKeybindings(keybinds, "submit"),
    { name: "return", action: "submit" },
  ] satisfies KeyBinding[]
}

export function useTextareaKeybindings() {
  const keybind = useKeybind()

  return createMemo(() => buildTextareaKeybindings(keybind.all))
}
