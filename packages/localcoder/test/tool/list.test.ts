import { describe, expect } from "bun:test"
import path from "path"
import * as fs from "fs/promises"
import { Effect, Layer } from "effect"
import { ListTool } from "../../src/tool/list"
import { SessionID, MessageID } from "../../src/session/schema"
import { CrossSpawnSpawner } from "@localcoder-ai/core/cross-spawn-spawner"
import { AppFileSystem } from "@localcoder-ai/core/filesystem"
import { Agent } from "../../src/agent/agent"
import { Truncate } from "@/tool/truncate"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(CrossSpawnSpawner.defaultLayer, AppFileSystem.defaultLayer, Agent.defaultLayer, Truncate.defaultLayer),
)

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make(""),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

describe("tool.list", () => {
  it.instance("lists directory entries", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Bun.write(path.join(test.directory, "a.ts"), "x"))
      yield* Effect.promise(() => fs.mkdir(path.join(test.directory, "subdir")))
      const info = yield* ListTool
      const list = yield* info.init()
      const result = yield* list.execute({ path: test.directory }, ctx)
      expect(result.output).toContain("a.ts")
      expect(result.output).toContain("subdir")
    }),
  )
})
