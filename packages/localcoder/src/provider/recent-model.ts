import path from "path"
import { Global } from "@localcoder-ai/core/global"
import { ProviderID, ModelID } from "./schema"
import { isRecord } from "@/util/record"
import { Filesystem } from "@/util/filesystem"

export type RecentModel = { providerID: ProviderID; modelID: ModelID }

export async function loadRecentModels(): Promise<RecentModel[]> {
  const file = path.join(Global.Path.state, "model.json")
  const x = await Filesystem.readJson(file).catch(() => null)
  if (!isRecord(x) || !Array.isArray(x.recent)) return []
  return x.recent.flatMap((item) => {
    if (!isRecord(item)) return []
    if (typeof item.providerID !== "string") return []
    if (typeof item.modelID !== "string") return []
    return [{ providerID: ProviderID.make(item.providerID), modelID: ModelID.make(item.modelID) }]
  })
}
