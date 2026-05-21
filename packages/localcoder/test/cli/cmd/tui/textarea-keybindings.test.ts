import { describe, expect, test } from "bun:test"
import { buildTextareaKeybindings } from "@/cli/cmd/tui/component/textarea-keybindings"
import { Keybind } from "@/util/keybind"

describe("buildTextareaKeybindings", () => {
  test("does not bind plain return to submit (handled in prompt onKeyDown)", () => {
    const bindings = buildTextareaKeybindings({
      input_newline: Keybind.parse("shift+return,shift+enter,ctrl+return,ctrl+enter,alt+return,ctrl+j"),
      input_submit: Keybind.parse("return"),
    })

    const plainSubmit = bindings.find((binding) => binding.name === "return" && binding.action === "submit")
    expect(plainSubmit).toBeUndefined()

    const shiftNewline = bindings.find((binding) => binding.name === "return" && binding.shift && binding.action === "newline")
    expect(shiftNewline).toBeDefined()
  })
})
