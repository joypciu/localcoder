import { afterEach, expect, test } from "bun:test"
import { Flag } from "@localcoder-ai/core/flag/flag"
import { CrossSpawnSpawner } from "@localcoder-ai/core/cross-spawn-spawner"
import * as DateTime from "effect/DateTime"
import { Effect } from "effect"
import { Database } from "@/storage/db"
import { eq } from "drizzle-orm"
import * as Log from "@localcoder-ai/core/util/log"
import { WithInstance } from "../../src/project/with-instance"
import { Session } from "@/session/session"
import { SessionMessageTable } from "@/session/session.sql"
import { SyncEvent } from "@/sync"
import { SessionEvent } from "../../src/v2/session-event"
import { Modelv2 } from "../../src/v2/model"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, tmpdir } from "../fixture/fixture"

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

test("projectors-next writes assistant rows to SessionMessageTable", async () => {
  await using tmp = await tmpdir({ config: { formatter: false, lsp: false } })
  Flag.LOCALCODER_EXPERIMENTAL_EVENT_SYSTEM = true

  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const session = await runSession(Session.Service.use((svc) => svc.create({ title: "v2 projector" })))

      SyncEvent.run(SessionEvent.Step.Started.Sync, {
        sessionID: session.id,
        timestamp: DateTime.makeUnsafe(1),
        agent: "build",
        model: modelRef,
      })
      SyncEvent.run(SessionEvent.Text.Started.Sync, {
        sessionID: session.id,
        timestamp: DateTime.makeUnsafe(2),
      })
      SyncEvent.run(SessionEvent.Text.Ended.Sync, {
        sessionID: session.id,
        timestamp: DateTime.makeUnsafe(3),
        text: "projected hello",
      })

      const rows = Database.use((db) =>
        db.select().from(SessionMessageTable).where(eq(SessionMessageTable.session_id, session.id)).all(),
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]?.type).toBe("assistant")
      expect(rows[0]?.data).toMatchObject({
        agent: "build",
        content: [{ type: "text", text: "projected hello" }],
      })
    },
  })
})

test("projectors-next writes user rows from prompted events", async () => {
  await using tmp = await tmpdir({ config: { formatter: false, lsp: false } })
  Flag.LOCALCODER_EXPERIMENTAL_EVENT_SYSTEM = true

  await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const session = await runSession(Session.Service.use((svc) => svc.create({ title: "v2 user" })))

      SyncEvent.run(SessionEvent.Prompted.Sync, {
        sessionID: session.id,
        timestamp: DateTime.makeUnsafe(1),
        prompt: { text: "hello projector", files: [], agents: [] },
      })

      const rows = Database.use((db) =>
        db.select().from(SessionMessageTable).where(eq(SessionMessageTable.session_id, session.id)).all(),
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]?.type).toBe("user")
      expect(rows[0]?.data).toMatchObject({ text: "hello projector" })
    },
  })
})
