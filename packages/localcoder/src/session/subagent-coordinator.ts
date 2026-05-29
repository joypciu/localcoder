import { Effect, Semaphore } from "effect"

function maxConcurrency(): number {
  const raw = Number(process.env.LOCALCODER_SUBAGENT_CONCURRENCY ?? "2")
  const n = Number.isFinite(raw) ? raw : 2
  return Math.max(1, Math.min(8, Math.floor(n)))
}

let sem: Semaphore.Semaphore | undefined

function semaphore(): Semaphore.Semaphore {
  if (!sem) { sem = Semaphore.makeUnsafe(maxConcurrency()) }
  return sem
}

/** Limits concurrent subagent (task tool) runs — Hermes-style parallel delegation with a cap. */
export function withSubagentSlot<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return semaphore().withPermits(1)(effect)
}

export function subagentConcurrencyLimit(): number {
  return maxConcurrency()
}
