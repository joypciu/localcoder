import * as DateTime from "effect/DateTime"
import type { SyncEvent } from "@/sync"
import { EventV2 } from "./event"

export function now() {
  return DateTime.makeUnsafe(Date.now())
}

/** Emit a v2 session sync event (no-op when event system flag is off). */
export function emit<Def extends SyncEvent.Definition>(
  def: Def,
  data: SyncEvent.Event<Def>["data"],
  options?: { publish?: boolean },
) {
  EventV2.run(def, data, options)
}

export * as SessionEventEmit from "./session-event-emit"
