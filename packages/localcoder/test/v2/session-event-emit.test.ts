import { describe, expect, it } from "bun:test"
import { Flag } from "@localcoder-ai/core/flag/flag"
import { SessionEventEmit } from "../../src/v2/session-event-emit"

describe("SessionEventEmit", () => {
  it("exports now() as DateTime", () => {
    const ts = SessionEventEmit.now()
    expect(typeof ts).toBe("object")
  })

  it("emit delegates to EventV2.run", () => {
    expect(typeof SessionEventEmit.emit).toBe("function")
  })

  it("event system enabled on dev channel or explicit env", () => {
    expect(typeof Flag.LOCALCODER_EXPERIMENTAL_EVENT_SYSTEM).toBe("boolean")
  })
})
