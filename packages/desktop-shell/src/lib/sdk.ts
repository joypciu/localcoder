import { createlocalcoderClient, type localcoderClient } from "@localcoder-ai/sdk/v2/client"

export type ShellServer = {
  url: string
  username?: string
  password?: string
  directory: string
}

function authHeader(server: ShellServer): Record<string, string> | undefined {
  if (!server.password) return undefined
  const user = server.username ?? "localcoder"
  const token = btoa(`${user}:${server.password}`)
  return { Authorization: `Basic ${token}` }
}

export function createShellSdk(server: ShellServer): localcoderClient {
  return createlocalcoderClient({
    baseUrl: server.url,
    directory: server.directory,
    headers: authHeader(server),
  })
}
