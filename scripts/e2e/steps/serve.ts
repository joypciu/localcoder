import crypto from "crypto"
import net from "net"
import { spawn, type ChildProcess } from "child_process"
import { EXE } from "../lib/paths"
import { runCmd } from "../lib/runner"

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port
      s.close(() => resolve(p))
    })
    s.on("error", reject)
  })
}

async function waitForHealth(port: number, password: string, timeoutMs = 60_000) {
  const auth = Buffer.from(`localcoder:${password}`).toString("base64")
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/global/health`, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(3000),
      })
      if (r.ok) return
    } catch {}
    await Bun.sleep(500)
  }
  throw new Error("localcoder serve did not become healthy")
}

export async function stepServeHealth(): Promise<string> {
  const port = await findFreePort()
  const password = crypto.randomBytes(16).toString("hex")
  let serveProc: ChildProcess | undefined
  try {
    serveProc = spawn(EXE, ["serve", "--port", String(port), "--hostname", "127.0.0.1", "--cors"], {
      env: { ...process.env, LOCALCODER_SERVER_PASSWORD: password, LOCALCODER_CALLER: "e2e" },
      stdio: "ignore",
    })
    await waitForHealth(port, password)
    const auth = Buffer.from(`localcoder:${password}`).toString("base64")

    const sessionRes = await fetch(`http://127.0.0.1:${port}/session`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "e2e-smoke" }),
    })
    if (!sessionRes.ok) throw new Error(`POST /session ${sessionRes.status}`)

    const statusRes = await fetch(`http://127.0.0.1:${port}/global/llamacpp/status`, {
      headers: { Authorization: `Basic ${auth}` },
    })
    if (!statusRes.ok) throw new Error(`/global/llamacpp/status ${statusRes.status}`)
    const status = (await statusRes.json()) as { running?: boolean }
    return `health OK, session created, llamacpp running=${String(status.running)}`
  } finally {
    serveProc?.kill()
  }
}

export async function stepServeInvalidModel(): Promise<string> {
  const port = await findFreePort()
  const password = crypto.randomBytes(16).toString("hex")
  let serveProc: ChildProcess | undefined
  try {
    serveProc = spawn(EXE, ["serve", "--port", String(port), "--hostname", "127.0.0.1", "--cors"], {
      env: { ...process.env, LOCALCODER_SERVER_PASSWORD: password },
      stdio: "ignore",
    })
    await waitForHealth(port, password)
    const auth = Buffer.from(`localcoder:${password}`).toString("base64")
    const sessionRes = await fetch(`http://127.0.0.1:${port}/session`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    if (!sessionRes.ok) throw new Error(`session create ${sessionRes.status}`)
    const session = (await sessionRes.json()) as { id?: string }
    if (!session.id) throw new Error("no session id")

    const t0 = Date.now()
    const msgRes = await fetch(`http://127.0.0.1:${port}/session/${session.id}/message`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "invalid/fake", parts: [{ type: "text", text: "hi" }] }),
      signal: AbortSignal.timeout(15_000),
    })
    const ms = Date.now() - t0
    if (msgRes.ok) throw new Error("expected error for invalid model")
    if (ms > 12_000) throw new Error(`invalid model took ${ms}ms`)
    return `rejected in ${ms}ms`
  } finally {
    serveProc?.kill()
  }
}
