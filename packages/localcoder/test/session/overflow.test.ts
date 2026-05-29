import { describe, expect, test } from "bun:test"
import type { Config } from "@/config/config"
import type { Provider } from "@/provider/provider"
import { isOverflow, isAutoCompactDue, tokenCount, usable } from "@/session/overflow"

const cfg = {} as Config.Info

function llamaModel(ctx: number, output = 4096): Provider.Model {
  return {
    id: "test.gguf" as Provider.Model["id"],
    name: "test.gguf",
    providerID: "llamacpp" as Provider.Model["providerID"],
    status: "active",
    family: "",
    release_date: "",
    headers: {},
    options: {},
    variants: {},
    api: { npm: "@ai-sdk/openai-compatible", id: "test.gguf", url: "http://127.0.0.1:8080/v1" },
    limit: { context: ctx, output },
    capabilities: {
      reasoning: true,
      temperature: true,
      toolcall: true,
      attachment: false,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
  }
}

describe("session.overflow", () => {
  test("tokenCount includes reasoning when total is unset", () => {
    expect(
      tokenCount({
        input: 10_000,
        output: 1_000,
        reasoning: 2_000,
        cache: { read: 0, write: 0 },
      }),
    ).toBe(13_000)
  })

  test("llamacpp 16K ctx leaves more usable budget than cloud defaults", () => {
    const llama = usable({ cfg, model: llamaModel(16_384, 4096) })
    const cloud = usable({
      cfg,
      model: {
        ...llamaModel(16_384, 4096),
        providerID: "openai" as Provider.Model["providerID"],
      },
    })
    expect(llama).toBeGreaterThan(cloud)
    expect(llama).toBeGreaterThan(14_000)
  })

  test("llamacpp short chat below usable is not overflow", () => {
    const model = llamaModel(16_384, 4096)
    const tokens = { input: 13_400, output: 200, reasoning: 400, cache: { read: 0, write: 0 } }
    expect(isOverflow({ cfg, tokens, model })).toBe(false)
  })

  test("llamacpp respects tokens.total from provider", () => {
    const model = llamaModel(16_384, 4096)
    const tokens = {
      input: 10_000,
      output: 200,
      reasoning: 400,
      cache: { read: 0, write: 0 },
      total: 13_400,
    }
    expect(isOverflow({ cfg, tokens, model })).toBe(false)
  })

  test("isAutoCompactDue at 100% ctx meter for llamacpp", () => {
    const model = llamaModel(16_384, 4096)
    const budget = usable({ cfg, model })
    const tokens = { input: budget, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
    expect(isAutoCompactDue({ cfg, tokens, model })).toBe(true)
  })

  test("llamacpp 128K ctx leaves large usable budget", () => {
    const model = llamaModel(131_072, 4096)
    const budget = usable({ cfg, model })
    expect(budget).toBeGreaterThan(100_000)
    const tokens = { input: 40_000, output: 2_000, reasoning: 3_000, cache: { read: 0, write: 0 } }
    expect(isOverflow({ cfg, tokens, model })).toBe(false)
  })

  test("llamacpp still overflows near hard context limit", () => {
    const model = llamaModel(16_384, 4096)
    const tokens = { input: 15_000, output: 500, reasoning: 500, cache: { read: 0, write: 0 } }
    expect(isOverflow({ cfg, tokens, model })).toBe(true)
  })
})
