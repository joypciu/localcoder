import { expect } from "bun:test"
import { Effect } from "effect"
import path from "path"
import { MessageV2 } from "../../src/session/message-v2"
import { Session } from "@/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { provideTmpdirServer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { allowAll, makePromptTestLayer, providerCfg } from "../lib/session-prompt-stack"

const it = testEffect(makePromptTestLayer())

type CompletedToolPart = MessageV2.ToolPart & { state: MessageV2.ToolStateCompleted }

function findTool(messages: MessageV2.WithParts[], name: string) {
  return messages.flatMap((m) => m.parts).find(
    (p): p is CompletedToolPart => p.type === "tool" && p.tool === name && p.state.status === "completed",
  )
}

it.live("agent webfetch fetches JSON from the internet", () =>
  provideTmpdirServer(({ llm }) => Effect.gen(function* () {
    const prompt = yield* SessionPrompt.Service
    const sessions = yield* Session.Service
    const session = yield* sessions.create({ title: "webfetch", permission: allowAll })
    const url = "https://httpbin.org/json"
    yield* prompt.prompt({ sessionID: session.id, agent: "build", noReply: true, parts: [{ type: "text", text: "fetch " + url }] })
    yield* llm.tool("webfetch", { url, format: "text" })
    yield* llm.text("done")
    yield* prompt.loop({ sessionID: session.id })
    const msgs = yield* MessageV2.filterCompactedEffect(session.id)
    const part = findTool(msgs, "webfetch")
    expect(part).toBeDefined()
    expect(part!.state.output).toMatch(/slideshow|httpbin/i)
  }), { git: true, config: providerCfg }), 60_000)

it.live("agent write creates runnable Python script", () =>
  provideTmpdirServer(({ dir, llm }) => Effect.gen(function* () {
    const prompt = yield* SessionPrompt.Service
    const sessions = yield* Session.Service
    const session = yield* sessions.create({ title: "write py", permission: allowAll })
    const scriptPath = path.join(dir, "agent_e2e_sum.py")
    const content = "print('sum_1_to_10=55')\n"
    yield* prompt.prompt({ sessionID: session.id, agent: "build", noReply: true, parts: [{ type: "text", text: "write script" }] })
    yield* llm.tool("write", { filePath: scriptPath, content })
    yield* llm.text("done")
    yield* prompt.loop({ sessionID: session.id })
    const exists = yield* Effect.promise(() => Bun.file(scriptPath).exists())
    expect(exists).toBe(true)
    const runOut = yield* Effect.promise(async () => {
      const proc = Bun.spawn(["python", scriptPath], { cwd: dir, stdout: "pipe" })
      return { code: await proc.exited, text: await new Response(proc.stdout).text() }
    })
    expect(runOut.code).toBe(0)
    expect(runOut.text).toContain("sum_1_to_10=55")
    const msgs = yield* MessageV2.filterCompactedEffect(session.id)
    expect(findTool(msgs, "write")).toBeDefined()
  }), { git: true, config: providerCfg }), 60_000)
