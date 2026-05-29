import { afterEach, expect, test } from "bun:test"
import { Flag } from "@localcoder-ai/core/flag/flag"
import { CrossSpawnSpawner } from "@localcoder-ai/core/cross-spawn-spawner"
import * as DateTime from "effect/DateTime"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import * as Log from "@localcoder-ai/core/util/log"
import { WithInstance } from "../../src/project/with-instance"
import { Session } from "@/session/session"
import { SessionMessageTable } from "@/session/session.sql"
import { SyncEvent } from "@/sync"
import { SessionEvent } from "../../src/v2/session-event"
import { SessionV2 } from "../../src/v2/session"
import { Modelv2 } from "../../src/v2/model"
import { summarizeV2Message, v2SummariesMatchV1Text } from "../../src/session/v2-read-bridge"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"
import { Database } from "@/storage/db"

void Log.init({ print: false })

const modelRef = {
  id: Modelv2.ID.make("model"),
  providerID: Modelv2.ProviderID.make("provider"),
  variant: Modelv2.VariantID.make("default"),
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

function runSession<A, E>(fx: Effect.Effect<A, E, Session.Service>) {
  return Effect.runPromise(fx.pipe(Effect.provide(Session.defaultLayer), Effect.provide(CrossSpawnSpawner.defaultLayer)))
}

function runV2<A, E>(fx: Effect.Effect<A, E, SessionV2.Service>) {
  return Effect.runPromise(fx.pipe(Effect.provide(SessionV2.defaultLayer)))
}

test("v2 read path returns projected messages matching bridge summaries", async () => {
  await using tmp = await tmpdir({ config: { formatter: false, lsp: false } })
  Flag.LOCALCODER_EXPERIMENTAL_EVENT_SYSTEM = true

  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const session = await runSession(Session.Service.use((svc) => svc.create({ title: "v2 read parity" })))

      SyncEvent.run(SessionEvent.Prompted.Sync, {
        sessionID: session.id,
        timestamp: DateTime.makeUnsafe(1),
        prompt: { text: "hello v2 read", files: [], agents: [] },
      })
      SyncEvent.run(SessionEvent.Step.Started.Sync, {
        sessionID: session.id,
        timestamp: DateTime.makeUnsafe(2),
        agent: "build",
        model: modelRef,
      })
      SyncEvent.run(SessionEvent.Text.Started.Sync, {
        sessionID: session.id,
        timestamp: DateTime.makeUnsafe(3),
      })
      SyncEvent.run(SessionEvent.Text.Ended.Sync, {
        sessionID: session.id,
        timestamp: DateTime.makeUnsafe(4),
        text: "projected reply",
      })
      SyncEvent.run(SessionEvent.Step.Ended.Sync, {
        sessionID: session.id,
        timestamp: DateTime.makeUnsafe(5),
        finish: "stop",
        cost: 0,
        tokens: { input: 1, output: 2, reasoning: 0, cache: { read: 0, write: 0 } },
      })

      const rows = Database.use((db) =>
        db.select().from(SessionMessageTable).where(eq(SessionMessageTable.session_id, session.id)).all(),
      )
      expect(rows.length).toBeGreaterThanOrEqual(2)

      const v2Messages = await runV2(
        SessionV2.Service.use((svc) => svc.messages({ sessionID: session.id, order: "asc" })),
      )
      expect(v2Messages.length).toBeGreaterThanOrEqual(2)

      const summaries = v2Messages.map(summarizeV2Message)
      expect(
        v2SummariesMatchV1Text(summaries, {
          user: ["hello v2 read"],
          assistant: ["projected reply"],
        }),
      ).toBe(true)
    },
  })
})
