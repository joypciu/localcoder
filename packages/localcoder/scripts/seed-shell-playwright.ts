#!/usr/bin/env bun
/**
 * Seeds a live LocalCoder sidecar for desktop-shell Playwright (no mock UI).
 * Writes packages/desktop-shell/e2e/.live-session.json and starts `localcoder serve`.
 */
import crypto from "crypto"
import fs from "fs"
import net from "net"
import path from "path"
import { spawn, type ChildProcess } from "child_process"
import { base64Encode } from "@localcoder-ai/core/util/encode"
import { Flag } from "@localcoder-ai/core/flag/flag"
import { EXE, ROOT, resolveBun } from "../../../scripts/e2e/lib/paths"

const OUT = path.join(ROOT, "packages", "desktop-shell", "e2e", ".live-session.json")

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

async function waitForHealth(port: number, password: string, timeoutMs = 120_000) {
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
    await Bun.sleep(400)
  }
  throw new Error("localcoder serve did not become healthy for shell Playwright")
}

function serveCommand(port: number): { cmd: string; args: string[]; cwd: string } {
  if (fs.existsSync(EXE) && process.env.SHELL_E2E_USE_DEV !== "1") {
    return { cmd: EXE, args: ["serve", "--port", String(port), "--hostname", "127.0.0.1", "--cors"], cwd: ROOT }
  }
  const bun = resolveBun()
  return {
    cmd: bun,
    args: [
      "run",
      "--conditions=browser",
      path.join(ROOT, "packages", "localcoder", "src", "index.ts"),
      "serve",
      "--port",
      String(port),
      "--hostname",
      "127.0.0.1",
      "--cors",
    ],
    cwd: ROOT,
  }
}

let serveProc: ChildProcess | undefined

async function main() {
  Flag.LOCALCODER_EXPERIMENTAL_HTTPAPI = true
  Flag.LOCALCODER_EXPERIMENTAL_EVENT_SYSTEM = true

  const port = process.env.SHELL_E2E_SERVER_PORT
    ? Number(process.env.SHELL_E2E_SERVER_PORT)
    : await findFreePort()
  const password = crypto.randomBytes(16).toString("hex")
  const workdir = path.join(
    process.env.TEMP || process.env.TMP || "/tmp",
    `localcoder-shell-e2e-${crypto.randomBytes(4).toString("hex")}`,
  )
  fs.mkdirSync(workdir, { recursive: true })
  fs.writeFileSync(
    path.join(workdir, "localcoder.json"),
    JSON.stringify({
      $schema: "https://localcoder.ai/config.json",
      model: "test/test-model",
    }),
  )

  const { cmd, args, cwd } = serveCommand(port)

  serveProc = spawn(cmd, args, {
    cwd,
    env: {
      ...process.env,
      LOCALCODER_SERVER_PASSWORD: password,
      LOCALCODER_CALLER: "shell-e2e",
      LOCALCODER_EXPERIMENTAL_HTTPAPI: "1",
      LOCALCODER_EXPERIMENTAL_EVENT_SYSTEM: "1",
    },
    stdio: "ignore",
    detached: true,
    windowsHide: true,
  })
  serveProc.unref()

  await waitForHealth(port, password)

  const auth = Buffer.from(`localcoder:${password}`).toString("base64")
  const dirHeaders = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    "x-localcoder-directory": workdir,
  }

  const sessionRes = await fetch(`http://127.0.0.1:${port}/session`, {
    method: "POST",
    headers: dirHeaders,
    body: JSON.stringify({ title: "Shell E2E" }),
  })
  if (!sessionRes.ok) {
    throw new Error(`POST /session failed: ${sessionRes.status} ${await sessionRes.text()}`)
  }
  const session = (await sessionRes.json()) as { id?: string }
  if (!session.id) throw new Error("no session id from POST /session")

  const authToken = base64Encode(`localcoder:${password}`)
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(
    OUT,
    JSON.stringify({
      port,
      password,
      authToken,
      url: `http://127.0.0.1:${port}`,
      directory: workdir,
      sessionId: session.id,
      pid: serveProc.pid,
    }),
  )
  console.log(`Shell Playwright live session: ${session.id} on :${port}`)
}

main().catch(async (err) => {
  console.error(err)
  serveProc?.kill()
  process.exit(1)
})
