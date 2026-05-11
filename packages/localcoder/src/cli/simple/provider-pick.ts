import { isCancel, select } from "@clack/prompts"
import type { localcoderClient } from "@localcoder-ai/sdk/v2"
import { UI } from "@/cli/ui"

export type ProviderListData = NonNullable<Awaited<ReturnType<localcoderClient["provider"]["list"]>>["data"]>

export function parseModelRef(ref: string): { providerID: string; modelID: string } | undefined {
  const i = ref.indexOf("/")
  if (i <= 0) return undefined
  return { providerID: ref.slice(0, i), modelID: ref.slice(i + 1) }
}

export function providerEntry(data: ProviderListData, providerID: string) {
  return data.all.find((p) => p.id === providerID)
}

export function connectedProviders(data: ProviderListData) {
  const set = new Set(data.connected)
  return data.all.filter((p) => set.has(p.id))
}

export function modelsForProvider(
  data: ProviderListData,
  providerID: string,
  opts?: { connectedOnly?: boolean },
) {
  const p = providerEntry(data, providerID)
  if (!p) return []
  const connected = opts?.connectedOnly && !data.connected.includes(providerID)
  if (connected) return []
  return Object.keys(p.models)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({
      id,
      name: p.models[id]?.name ?? id,
      ref: `${providerID}/${id}`,
    }))
}

export async function fetchProviderList(sdk: localcoderClient) {
  const list = await sdk.provider.list()
  return list.data
}

export function printProviders(data: ProviderListData) {
  const connected = new Set(data.connected)
  UI.println(UI.Style.TEXT_INFO_BOLD + "Providers" + UI.Style.TEXT_NORMAL)
  for (const p of data.all) {
    const isConnected = connected.has(p.id)
    const modelCount = Object.keys(p.models).length
    const mark = isConnected ? UI.Style.TEXT_SUCCESS + "●" : UI.Style.TEXT_DIM + "○"
    const status = isConnected ? "connected" : "not connected"
    UI.println(
      `${mark}${UI.Style.TEXT_NORMAL} ${p.id.padEnd(18)} ${UI.Style.TEXT_DIM}${status}${UI.Style.TEXT_NORMAL}  ${modelCount} model(s)`,
    )
  }
  UI.empty()
  UI.println(
    UI.Style.TEXT_DIM +
      "  Use /providers to pick a provider, then /model for its models. Run: localcoder providers login <id>" +
      UI.Style.TEXT_NORMAL,
  )
}

export async function pickProvider(
  sdk: localcoderClient,
  current?: string,
): Promise<string | undefined> {
  const data = await fetchProviderList(sdk)
  if (!data) return undefined

  const connected = connectedProviders(data)
  const options: { value: string; label: string; hint?: string }[] = []

  for (const p of connected) {
    const def = data.default[p.id]
    const hint = def ? `default: ${def}` : "connected"
    options.push({ value: p.id, label: `${p.name} (${p.id})`, hint })
  }

  if (connected.length < data.all.length) {
    options.push({
      value: "__browse__",
      label: "Browse all providers…",
      hint: "includes providers without credentials",
    })
  }

  if (options.length === 0) {
    UI.println(UI.Style.TEXT_WARNING + "No providers configured." + UI.Style.TEXT_NORMAL)
    return undefined
  }

  const picked = await select({
    message: "Provider",
    options,
    initialValue: current && options.some((o) => o.value === current) ? current : options[0]?.value,
  })
  if (isCancel(picked)) return undefined

  if (picked === "__browse__") {
    const allOpts = data.all
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => ({
        value: p.id,
        label: `${p.name} (${p.id})`,
        hint: data.connected.includes(p.id) ? "connected" : "not connected",
      }))
    const allPicked = await select({ message: "All providers", options: allOpts })
    if (isCancel(allPicked)) return undefined
    return String(allPicked)
  }

  return String(picked)
}

export async function pickModel(
  sdk: localcoderClient,
  opts?: { providerID?: string; connectedOnly?: boolean },
): Promise<string | undefined> {
  const data = await fetchProviderList(sdk)
  if (!data) return undefined

  let providerID = opts?.providerID
  if (!providerID) {
    if (data.connected.length === 1) {
      providerID = data.connected[0]
    } else if (data.connected.length > 0) {
      providerID = await pickProvider(sdk)
    } else {
      UI.println(
        UI.Style.TEXT_WARNING +
          "No connected providers. Use /providers or: localcoder providers login <id>" +
          UI.Style.TEXT_NORMAL,
      )
      return undefined
    }
  }
  if (!providerID) return undefined

  const models = modelsForProvider(data, providerID, { connectedOnly: opts?.connectedOnly ?? true })
  if (models.length === 0) {
    UI.println(UI.Style.TEXT_WARNING + `No models for provider ${providerID}.` + UI.Style.TEXT_NORMAL)
    return undefined
  }

  const p = providerEntry(data, providerID)
  const options = models.map((m) => ({
    value: m.ref,
    label: m.name === m.id ? m.id : `${m.name} (${m.id})`,
  }))

  const defaultMid = data.default[providerID]
  const initial = defaultMid ? `${providerID}/${defaultMid}` : options[0]?.value

  const picked = await select({
    message: `Model · ${p?.name ?? providerID}`,
    options,
    initialValue: initial && options.some((o) => o.value === initial) ? initial : options[0]?.value,
  })
  if (isCancel(picked)) return undefined
  return String(picked)
}
