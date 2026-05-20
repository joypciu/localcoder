import { createMemo } from "solid-js"
import { useSync } from "@tui/context/sync"

export function useConnected() {
  const sync = useSync()
  return createMemo(() =>
    sync.data.provider.some((x) => {
      if (x.id === "llamacpp" && Object.keys(x.models).length > 0) return true
      if (x.id !== "localcoder") return Object.keys(x.models).length > 0
      return Object.values(x.models).some((y) => y.cost?.input !== 0)
    }),
  )
}

export function hasLlamaCppProvider() {
  const sync = useSync()
  return createMemo(() => sync.data.provider.some((x) => x.id === "llamacpp"))
}
