import type { QueryClient } from "@tanstack/solid-query"
import type { useGlobalSDK } from "@/context/global-sdk"
import { normalizeProviderList } from "@/context/global-sync/utils"
import { retry } from "@localcoder-ai/core/util/retry"

type GlobalSDK = ReturnType<typeof useGlobalSDK>

export function llamaModelBasename(modelId: string) {
  const base = modelId.split(/[/\\]/).pop()
  return base && base.length > 0 ? base : modelId
}

export async function refreshLlamaProviders(input: {
  globalSDK: GlobalSDK
  queryClient: QueryClient
  directory?: string
}) {
  await input.globalSDK.client.global.dispose().catch(() => undefined)
  await input.queryClient.invalidateQueries({ queryKey: [null, "providers"] })
  if (input.directory) {
    await input.queryClient.invalidateQueries({ queryKey: [input.directory, "providers"] })
  }
  await input.queryClient.fetchQuery({ queryKey: ["bootstrap"] })

  const globalProviders = await retry(() =>
    input.globalSDK.client.provider.list().then((x) => normalizeProviderList(x.data!)),
  )
  if (input.directory) {
    const sdk = input.globalSDK.createClient({ directory: input.directory, throwOnError: true })
    await retry(() =>
      input.queryClient.fetchQuery({
        queryKey: [input.directory, "providers"],
        queryFn: () => sdk.provider.list().then((x) => normalizeProviderList(x.data!)),
      }),
    )
  }
  return globalProviders
}

export function findLlamaModelId(
  providers: { all: Array<{ id: string; models: Record<string, { id: string }> }>; connected: string[] },
  modelId: string,
) {
  const connected = new Set(providers.connected)
  if (!connected.has("llamacpp")) return undefined
  const provider = providers.all.find((p) => p.id === "llamacpp")
  if (!provider) return undefined
  if (!modelId) return Object.keys(provider.models)[0]
  const names = [modelId, llamaModelBasename(modelId)]
  for (const name of names) {
    if (provider.models[name]) return name
  }
  const first = Object.keys(provider.models)[0]
  return first
}

export async function waitForLlamaProvider(input: {
  globalSDK: GlobalSDK
  queryClient: QueryClient
  modelId: string
  directory?: string
  tries?: number
}) {
  const tries = input.tries ?? 12
  for (let i = 0; i < tries; i++) {
    const providers = await refreshLlamaProviders(input)
    const resolved = findLlamaModelId(providers, input.modelId)
    if (resolved) return resolved
    await new Promise((r) => setTimeout(r, 400))
  }
  return undefined
}
