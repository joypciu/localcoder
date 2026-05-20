import { describe, expect, test } from "bun:test"
import { shouldContinueToolLoop, hasPendingClientTools } from "../../src/session/tool-phase"
import { SessionID, MessageID, PartID } from "../../src/session/schema"
import { ModelID, ProviderID } from "../../src/provider/schema"
import type { MessageV2 } from "../../src/session/message-v2"

const sessionID = SessionID.make("ses_test")
const modelID = ModelID.make("gpt-4")
const providerID = ProviderID.make("openai")
const userID = MessageID.make("msg_00000001")
const assistantID = MessageID.make("msg_00000002")

describe("session/tool-phase", () => {
  test("hasPendingClientTools detects running tools", () => {
    const msg: MessageV2.WithParts = {
      info: {
        id: assistantID,
        sessionID,
        role: "assistant",
        time: { created: 2 },
        agent: "build",
        modelID,
        providerID,
        mode: "build",
        path: { cwd: "/", root: "/" },
      } as MessageV2.Assistant,
      parts: [{
        id: PartID.make("p1"),
        messageID: assistantID,
        sessionID,
        type: "tool",
        tool: "read",
        callID: "c1",
        state: { status: "running", input: {}, time: { start: 1 } },
      }],
    }
    expect(hasPendingClientTools(msg)).toBe(true)
  })

  test("shouldContinueToolLoop exits on completed assistant", () => {
    expect(shouldContinueToolLoop({
      lastUser: { id: userID, sessionID, role: "user", time: { created: 1 }, agent: "build", model: { providerID, modelID } } as MessageV2.User,
      lastAssistant: { id: assistantID, sessionID, role: "assistant", time: { created: 2, completed: 3 }, agent: "build", modelID, providerID, mode: "build", finish: "stop", path: { cwd: "/", root: "/" } } as MessageV2.Assistant,
      lastAssistantMsg: { info: {} as MessageV2.Assistant, parts: [] },
    })).toBe(false)
  })

  test("shouldContinueToolLoop continues on tool-calls finish", () => {
    expect(shouldContinueToolLoop({
      lastUser: { id: userID, sessionID, role: "user", time: { created: 1 }, agent: "build", model: { providerID, modelID } } as MessageV2.User,
      lastAssistant: { id: assistantID, sessionID, role: "assistant", time: { created: 2 }, agent: "build", modelID, providerID, mode: "build", finish: "tool-calls", path: { cwd: "/", root: "/" } } as MessageV2.Assistant,
      lastAssistantMsg: { info: {} as MessageV2.Assistant, parts: [] },
    })).toBe(true)
  })
})
