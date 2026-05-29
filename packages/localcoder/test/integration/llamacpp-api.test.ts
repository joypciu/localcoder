import { describe, expect, test } from "bun:test"

const apiUrl = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"
const modelId = process.env.LLAMACPP_MODEL_ID

describe("integration/llamacpp-api", () => {
  test.skipIf(!modelId)("chat completions returns text", async () => {
    const res = await fetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "Say pong" }],
        max_tokens: 64,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(120_000),
    })
    expect(res.ok).toBe(true)
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    expect(json.choices?.[0]?.message?.content?.length).toBeGreaterThan(0)
  })

  test.skipIf(!modelId)("models endpoint lists configured model", async () => {
    const res = await fetch(`${apiUrl}/models`, { signal: AbortSignal.timeout(10_000) })
    expect(res.ok).toBe(true)
    const json = (await res.json()) as { data?: Array<{ id?: string }> }
    expect(json.data?.some((item) => item.id === modelId)).toBe(true)
  })
})
