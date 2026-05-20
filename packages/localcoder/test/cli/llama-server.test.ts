import { describe, expect, test } from "bun:test"
import { getConfig, probe } from "../../src/cli/cmd/tui/llama-server"

describe("llama-server", () => {
  test("getConfig returns paths and api url", () => {
    const cfg = getConfig()
    expect(cfg.serverExe).toContain("llama-server")
    expect(typeof cfg.modelPath).toBe("string")
    expect(cfg.apiUrl).toMatch(/\/v1$/)
  })

  test("probe returns not ok when server is down", async () => {
    const result = await probe("http://127.0.0.1:59999/v1")
    expect(result.ok).toBe(false)
  })
})
