import path from "path"
const p = path.join(import.meta.dir, "agent-tool-e2e.ts")
let t = await Bun.file(p).text()
const old = `      provider: {
        llamacpp: {
          npm: "@ai-sdk/openai-compatible",
          options: { baseURL: API_URL, apiKey: "not-needed" },
        },
      },`
const neu = `      provider: {
        llamacpp: {
          npm: "@ai-sdk/openai-compatible",
          options: { baseURL: API_URL, apiKey: "not-needed" },
          models: {
            [model]: {
              id: model,
              name: model,
              tool_call: true,
              temperature: true,
              limit: { context: CTX, output: 4096 },
            },
          },
        },
      },`
if (!t.includes(old)) throw new Error("config block missing")
await Bun.write(p, t.replace(old, neu))
console.log("config models added")
