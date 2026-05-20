import path from "node:path"
import { Global } from "@localcoder-ai/core/global"
import { Filesystem } from "@/util/filesystem"
import { isRecord } from "@/util/record"

const FILE = () => path.join(Global.Path.state, "last-session.json")

export async function saveLastSession(directory: string, sessionID: string) {
  const key = path.resolve(directory)
  const existing = await Filesystem.readJson(FILE()).catch(() => ({}))
  const map = isRecord(existing) ? { ...existing } : {}
  map[key] = { sessionID, updated: Date.now() }
  await Filesystem.writeJson(FILE(), map)
}

export async function loadLastSession(directory: string): Promise<string | undefined> {
  const key = path.resolve(directory)
  const data = await Filesystem.readJson(FILE()).catch(() => null)
  if (!isRecord(data)) return undefined
  const entry = data[key]
  if (!isRecord(entry) || typeof entry.sessionID !== "string") return undefined
  return entry.sessionID
}
