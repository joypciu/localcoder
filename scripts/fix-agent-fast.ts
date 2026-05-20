import path from "path"
const p = path.join(import.meta.dir, "agent-tool-e2e.ts")
let t = await Bun.file(p).text()
const header = `/**
 * OPTIONAL live agent E2E (slow — 35B model, large prompts).
 * Fast agent+tool tests: bun test packages/localcoder/test/integration/agent-tools.test.ts
 *
 * Only runs when: AGENT_LIVE_E2E=1
 * Reuse server:    AGENT_LIVE_E2E=1 LLAMACPP_SKIP_SERVER=1 bun run scripts/agent-tool-e2e.ts
 */
`
t = t.replace(/^\/\*\*[\s\S]*?\*\/\n/, header)
const guard = `
const LIVE = process.env.AGENT_LIVE_E2E === "1"
if (!LIVE) {
  console.log("[agent-e2e] Skipped (set AGENT_LIVE_E2E=1 for slow live run with local LLM).")
  console.log("[agent-e2e] Fast tests: bun test packages/localcoder/test/integration/agent-tools.test.ts")
  process.exit(0)
}
`
if (!t.includes("AGENT_LIVE_E2E")) {
  t = t.replace("const CTX = Number(process.env.LLAMACPP_CTX ?? 2048)", `const CTX = Number(process.env.LLAMACPP_CTX ?? 8192)\n${guard}`)
}
t = t.replace("timeoutMs = 600_000", "timeoutMs = 120_000")
await Bun.write(p, t)
console.log("agent-tool-e2e now opt-in only")
