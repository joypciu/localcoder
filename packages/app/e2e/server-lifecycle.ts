import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const here = path.dirname(fileURLToPath(import.meta.url))
const vitePidPath = path.join(here, ".vite-pid.json")

export function saveVitePid(pid: number | undefined) {
  if (!pid) return
  fs.writeFileSync(vitePidPath, JSON.stringify({ pid }))
}

export function killVite() {
  if (!fs.existsSync(vitePidPath)) return
  try {
    const { pid } = JSON.parse(fs.readFileSync(vitePidPath, "utf8")) as { pid?: number }
    if (pid) process.kill(pid)
    fs.unlinkSync(vitePidPath)
  } catch {}
}

export async function waitForHttp(url: string, timeoutMs: number) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Timed out waiting for ${url} after ${timeoutMs}ms`)
}
