import { describe, expect, test } from "bun:test"
import { buildTextareaKeybindings } from "@/cli/cmd/tui/component/textarea-keybindings"
import { Keybind } from "@/util/keybind"

describe("buildTextareaKeybindings", () => {
  test("matches newline return variants before plain return submit", () => {
    const bindings = buildTextareaKeybindings({
      input_newline: Keybind.parse("shift+return,shift+enter,ctrl+return,ctrl+enter,alt+return,ctrl+j"),
      input_submit: Keybind.parse("return"),
    })

    const firstPlainReturn = bindings.findIndex((binding) => binding.name === "return" && binding.action === "submit")
    const newlineReturns = bindings
      .map((binding, index) => ({ binding, index }))
      .filter((item) => item.binding.name === "return" && item.binding.action === "newline")

    expect(firstPlainReturn).toBeGreaterThan(-1)
    expect(newlineReturns.length).toBeGreaterThan(0)
    expect(newlineReturns.every((item) => item.index < firstPlainReturn)).toBe(true)
  })
})
