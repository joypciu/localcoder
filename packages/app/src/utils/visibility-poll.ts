/** Shared intervals — slower when tab/window is hidden to save CPU. */
export const HEALTH_POLL_MS = 30_000
export const HEALTH_POLL_HIDDEN_MS = 120_000

export function createVisibilityPoll(run: () => void, activeMs = HEALTH_POLL_MS, hiddenMs = HEALTH_POLL_HIDDEN_MS) {
  let interval: ReturnType<typeof setInterval> | undefined

  const schedule = () => {
    if (interval) clearInterval(interval)
    const ms = typeof document !== "undefined" && document.visibilityState === "hidden" ? hiddenMs : activeMs
    interval = setInterval(run, ms)
  }

  run()
  schedule()

  const onVisibility = () => {
    run()
    schedule()
  }
  document.addEventListener("visibilitychange", onVisibility)

  return () => {
    if (interval) clearInterval(interval)
    document.removeEventListener("visibilitychange", onVisibility)
  }
}
