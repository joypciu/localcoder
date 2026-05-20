import { describe, expect, test } from "bun:test"
import * as Selection from "@/cli/cmd/tui/util/selection"

describe("selection util", () => {
  test("selectedText returns undefined when no selection", () => {
    const renderer = { getSelection: () => null, clearSelection: () => {} }
    expect(Selection.selectedText(renderer)).toBeUndefined()
  })

  test("selectedText returns selection text", () => {
    const renderer = {
      getSelection: () => ({ getSelectedText: () => "hello world" }),
      clearSelection: () => {},
    }
    expect(Selection.selectedText(renderer)).toBe("hello world")
  })
})
