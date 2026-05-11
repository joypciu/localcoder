import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

export type ShellLiveSeed = {
  port: number
  password: string
  authToken: string
  url: string
  directory: string
  sessionId: string
  pid?: number
}

const here = path.dirname(fileURLToPath(import.meta.url))
export const seedPath = path.join(here, ".live-session.json")

export function readLiveSeed(): ShellLiveSeed | undefined {
  if (!fs.existsSync(seedPath)) return undefined
  try {
    return JSON.parse(fs.readFileSync(seedPath, "utf8")) as ShellLiveSeed
  } catch {
    return undefined
  }
}

export function shellPageUrl(seed: ShellLiveSeed): string {
  const q = new URLSearchParams({
    password: seed.password,
    directory: seed.directory.replace(/\\/g, "/"),
    session: seed.sessionId,
    proxy: "1",
  })
  return `/?${q.toString()}`
}

export function authHeaders(seed: ShellLiveSeed): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`localcoder:${seed.password}`).toString("base64")}`,
    "Content-Type": "application/json",
    "x-localcoder-directory": seed.directory.replace(/\\/g, "/"),
  }
}

export async function injectPermission(seed: ShellLiveSeed, sessionID: string) {
  const r = await fetch(`${seed.url}/permission/e2e/ask`, {
    method: "POST",
    headers: authHeaders(seed),
    body: JSON.stringify({
      sessionID,
      permission: "bash",
      patterns: ["npm test"],
      metadata: { source: "shell-e2e" },
    }),
  })
  if (!r.ok) throw new Error(`permission e2e inject ${r.status}: ${await r.text()}`)
  return (await r.json()) as { id: string }
}
