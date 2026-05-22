import { authTokenFromCredentials } from "@/utils/server"
import type { ServerConnection } from "@/context/server"

export type LlamaCppPublicStatus = {
  running: boolean
  modelId?: string
  managed: boolean
  apiUrl: string
  logPath?: string
  llamaDir: string
  modelPath: string
  ctx: number
  saved: Record<string, unknown>
  discoveredModels: string[]
  serverExe: string
  thinking?: boolean
  thinkingSupported?: boolean
}

export type LlamaCppSetupResult = {
  model: string
  modelId?: string
  running: boolean
  alreadyRunning?: boolean
  apiUrl: string
  logPath?: string
  error?: string
}

export type LlamaCppStartResult = {
  modelId?: string
  alreadyRunning?: boolean
  model?: string
  logPath?: string
}

function headers(server: ServerConnection.HttpBase) {
  const next: Record<string, string> = { "Content-Type": "application/json" }
  if (server.password) {
    next.Authorization = `Basic ${authTokenFromCredentials({ username: server.username, password: server.password })}`
  }
  return next
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? res.statusText)
  return data
}

export async function getLlamaCppStatus(server: ServerConnection.HttpBase) {
  const res = await fetch(`${server.url}/global/llamacpp/status`, { headers: headers(server) })
  return parse<LlamaCppPublicStatus>(res)
}

export async function setupLlamaCpp(
  server: ServerConnection.HttpBase,
  body: { llamaDir: string; modelPath: string; autoStart?: boolean; ctx?: number; thinking?: boolean },
) {
  const res = await fetch(`${server.url}/global/llamacpp/setup`, {
    method: "POST",
    headers: headers(server),
    body: JSON.stringify(body),
  })
  return parse<LlamaCppSetupResult>(res)
}

export async function startLlamaCpp(server: ServerConnection.HttpBase) {
  const res = await fetch(`${server.url}/global/llamacpp/start`, {
    method: "POST",
    headers: headers(server),
  })
  return parse<LlamaCppStartResult>(res)
}

export async function stopLlamaCpp(server: ServerConnection.HttpBase) {
  const res = await fetch(`${server.url}/global/llamacpp/stop`, {
    method: "POST",
    headers: headers(server),
  })
  return parse<{ stopped: boolean }>(res)
}

export async function setLlamaCppThinking(server: ServerConnection.HttpBase, thinking: boolean) {
  const res = await fetch(`${server.url}/global/llamacpp/thinking`, {
    method: "POST",
    headers: headers(server),
    body: JSON.stringify({ thinking }),
  })
  return parse<{ thinking: boolean; modelId?: string; model?: string }>(res)
}
