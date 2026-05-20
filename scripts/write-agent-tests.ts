import path from "path"

const ROOT = path.join(import.meta.dir, "..", "packages", "localcoder")

const stack = `import { NodeFileSystem } from "@effect/platform-node"
import { FetchHttpClient } from "effect/unstable/http"
import { Effect, Layer } from "effect"
import { Agent as AgentSvc } from "../../src/agent/agent"
import { Bus } from "../../src/bus"
import { Command } from "../../src/command"
import { Config } from "@/config/config"
import { LSP } from "@/lsp/lsp"
import { MCP } from "../../src/mcp"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider as ProviderSvc } from "@/provider/provider"
import { Env } from "../../src/env"
import { Question } from "../../src/question"
import { Todo } from "../../src/session/todo"
import { Session } from "@/session/session"
import { LLM } from "../../src/session/llm"
import { AppFileSystem } from "@localcoder-ai/core/filesystem"
import { SessionCompaction } from "../../src/session/compaction"
import { SessionSummary } from "../../src/session/summary"
import { Instruction } from "../../src/session/instruction"
import { SessionProcessor } from "../../src/session/processor"
import { SessionPrompt } from "../../src/session/prompt"
import { SessionRevert } from "../../src/session/revert"
import { SessionRunState } from "../../src/session/run-state"
import { SessionStatus } from "../../src/session/status"
import { Skill } from "../../src/skill"
import { SystemPrompt } from "../../src/session/system"
import { Snapshot } from "../../src/snapshot"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { CrossSpawnSpawner } from "@localcoder-ai/core/cross-spawn-spawner"
import { Ripgrep } from "../../src/file/ripgrep"
import { Format } from "../../src/format"
import { TestLLMServer } from "../lib/llm-server"

const summary = Layer.succeed(SessionSummary.Service, SessionSummary.Service.of({
  summarize: () => Effect.void,
  diff: () => Effect.succeed([]),
  computeDiff: () => Effect.succeed([]),
}))

const mcp = Layer.succeed(MCP.Service, MCP.Service.of({
  status: () => Effect.succeed({}),
  clients: () => Effect.succeed({}),
  tools: () => Effect.succeed({}),
  prompts: () => Effect.succeed({}),
  resources: () => Effect.succeed({}),
  add: () => Effect.succeed({ status: { status: "disabled" as const } }),
  connect: () => Effect.void,
  disconnect: () => Effect.void,
  getPrompt: () => Effect.succeed(undefined),
  readResource: () => Effect.succeed(undefined),
  startAuth: () => Effect.die("unexpected MCP auth"),
  authenticate: () => Effect.die("unexpected MCP auth"),
  finishAuth: () => Effect.die("unexpected MCP auth"),
  removeAuth: () => Effect.void,
  supportsOAuth: () => Effect.succeed(false),
  hasStoredTokens: () => Effect.succeed(false),
  getAuthStatus: () => Effect.succeed("not_authenticated" as const),
}))

const lsp = Layer.succeed(LSP.Service, LSP.Service.of({
  init: () => Effect.void,
  status: () => Effect.succeed([]),
  hasClients: () => Effect.succeed(false),
  touchFile: () => Effect.void,
  diagnostics: () => Effect.succeed({}),
  hover: () => Effect.succeed(undefined),
  definition: () => Effect.succeed([]),
  references: () => Effect.succeed([]),
  implementation: () => Effect.succeed([]),
  documentSymbol: () => Effect.succeed([]),
  workspaceSymbol: () => Effect.succeed([]),
  prepareCallHierarchy: () => Effect.succeed([]),
  incomingCalls: () => Effect.succeed([]),
  outgoingCalls: () => Effect.succeed([]),
}))

const status = SessionStatus.layer.pipe(Layer.provideMerge(Bus.layer))
const run = SessionRunState.layer.pipe(Layer.provide(status))
const infra = Layer.mergeAll(NodeFileSystem.layer, CrossSpawnSpawner.defaultLayer)

export function makePromptTestLayer() {
  const deps = Layer.mergeAll(
    Session.defaultLayer, Snapshot.defaultLayer, LLM.defaultLayer, Env.defaultLayer,
    AgentSvc.defaultLayer, Command.defaultLayer, Permission.defaultLayer, Plugin.defaultLayer,
    Config.defaultLayer, ProviderSvc.defaultLayer, lsp, mcp, AppFileSystem.defaultLayer, status,
  ).pipe(Layer.provideMerge(infra))
  const question = Question.layer.pipe(Layer.provideMerge(deps))
  const todo = Todo.layer.pipe(Layer.provideMerge(deps))
  const registry = ToolRegistry.layer.pipe(
    Layer.provide(Skill.defaultLayer), Layer.provide(FetchHttpClient.layer),
    Layer.provide(CrossSpawnSpawner.defaultLayer), Layer.provide(Ripgrep.defaultLayer),
    Layer.provide(Format.defaultLayer), Layer.provideMerge(todo), Layer.provideMerge(question), Layer.provideMerge(deps),
  )
  const trunc = Truncate.layer.pipe(Layer.provideMerge(deps))
  const proc = SessionProcessor.layer.pipe(Layer.provide(summary), Layer.provideMerge(deps))
  const compact = SessionCompaction.layer.pipe(Layer.provideMerge(proc), Layer.provideMerge(deps))
  return Layer.mergeAll(
    TestLLMServer.layer,
    SessionPrompt.layer.pipe(
      Layer.provide(SessionRevert.defaultLayer), Layer.provide(summary),
      Layer.provideMerge(run), Layer.provideMerge(compact), Layer.provideMerge(proc),
      Layer.provideMerge(registry), Layer.provideMerge(trunc),
      Layer.provide(Instruction.defaultLayer), Layer.provide(SystemPrompt.defaultLayer), Layer.provideMerge(deps),
    ),
  ).pipe(Layer.provide(summary))
}

const cfg = {
  provider: {
    test: {
      name: "Test", id: "test", env: [], npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model", name: "Test Model", attachment: false, reasoning: false, temperature: false,
          tool_call: true, release_date: "2025-01-01", limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 }, options: {},
        },
      },
      options: { apiKey: "test-key", baseURL: "http://localhost:1/v1" },
    },
  },
}

export function providerCfg(url: string) {
  return { ...cfg, provider: { ...cfg.provider, test: { ...cfg.provider.test, options: { ...cfg.provider.test.options, baseURL: url } } } }
}

export const allowAll = [{ permission: "*", pattern: "*", action: "allow" as const }]
`

const agentTest = `import { expect } from "bun:test"
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
    const content = "print('sum_1_to_10=55')\\n"
    yield* prompt.prompt({ sessionID: session.id, agent: "build", noReply: true, parts: [{ type: "text", text: "write script" }] })
    yield* llm.tool("write", { filePath: scriptPath, content })
    yield* llm.text("done")
    yield* prompt.loop({ sessionID: session.id })
    expect(await Bun.file(scriptPath).exists()).toBe(true)
    const proc = Bun.spawn(["python", scriptPath], { cwd: dir, stdout: "pipe" })
    expect(await proc.exited).toBe(0)
    expect(await new Response(proc.stdout).text()).toContain("sum_1_to_10=55")
    const msgs = yield* MessageV2.filterCompactedEffect(session.id)
    expect(findTool(msgs, "write")).toBeDefined()
  }), { git: true, config: providerCfg }), 60_000)
`

await Bun.write(path.join(ROOT, "test/lib/session-prompt-stack.ts"), stack)
await Bun.write(path.join(ROOT, "test/integration/agent-tools.test.ts"), agentTest)
console.log("wrote agent tool tests")
