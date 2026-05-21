import { describe, expect, test } from "bun:test"
import { targetWin32ConsoleMode } from "@/cli/cmd/tui/win32"

describe("targetWin32ConsoleMode", () => {
  test("disables quick edit and enables mouse input", () => {
    const mode = 0x0001 | 0x0040
    const next = targetWin32ConsoleMode(mode)
    expect(next & 0x0001).toBe(0)
    expect(next & 0x0040).toBe(0)
    expect(next & 0x0010).toBe(0x0010)
    expect(next & 0x0080).toBe(0x0080)
  })
})
