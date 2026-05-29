#!/usr/bin/env bun
/**
 * Seeds a live LocalCoder session with assistant token usage for Playwright.
 * Writes packages/app/e2e/.live-session.json and starts `localcoder serve`.
 */
import crypto from "crypto"
import fs from "fs"
import net from "net"
import path from "path"
import { spawn, type ChildProcess } from "child_process"
import { Effect, Layer } from "effect"
import { base64Encode } from "@localcoder-ai/core/util/encode"
import { Flag } from "@localcoder-ai/core/flag/flag"
import { CrossSpawnSpawner } from "@localcoder-ai/core/cross-spawn-spawner"
import * as Log from "@localcoder-ai/core/util/log"
import { Session } from "@/session/session"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, PartID } from "@/session/schema"
import { ModelID, ProviderID } from "@/provider/schema"
import { WithInstance } from "@/project/with-instance"
import { tmpdir, disposeAllInstances } from "../test/fixture/fixture"
import { resetDatabase } from "../test/fixture/db"
import { EXE, ROOT, resolveBun } from "../../../scripts/e2e/lib/paths"

const OUT = path.join(ROOT, "packages", "app", "e2e", ".live-session.json")

const providerConfig = {
  formatter: false,
  lsp: false,
  share: "disabled" as const,
  model: "test/test-model",
  provider: {
    test: {
      name: "Test",
      id: "test",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100_000, output: 10_000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
      },
      options: { apiKey: "test", baseURL: "http://127.0.0.1:1/v1" },
    },
  },
}

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

async function waitForHealth(port: number, password: string, timeoutMs = 12_000) {
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
  throw new Error("localcoder serve did not become healthy for Playwright seed")
}

function serveCommand(port: number): { cmd: string; args: string[]; cwd: string } {
  if (fs.existsSync(EXE)) {
    return { cmd: EXE, args: ["serve", "--port", String(port), "--hostname", "127.0.0.1", "--cors"], cwd: ROOT }
  }
  const bun = resolveBun()
  return {
    cmd: bun,
    args: ["run", "--conditions=browser", path.join(ROOT, "packages", "localcoder", "src", "index.ts"), "serve", "--port", String(port), "--hostname", "127.0.0.1", "--cors"],
    cwd: ROOT,
  }
}

let serveProc: ChildProcess | undefined

async function main() {
  void Log.init({ print: false })
  Flag.LOCALCODER_EXPERIMENTAL_HTTPAPI = true
  Flag.LOCALCODER_EXPERIMENTAL_EVENT_SYSTEM = true

  await resetDatabase()

  await using tmp = await tmpdir({ git: false, config: providerConfig })

  const session = await WithInstance.provide({
    directory: tmp.path,
    fn: async () => {
      const layer = Layer.mergeAll(Session.defaultLayer, CrossSpawnSpawner.defaultLayer)
      return Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* Session.Service
          const created = yield* svc.create({ title: "Playwright context meter" })
          const user = yield* svc.updateMessage({
            id: MessageID.ascending(),
            role: "user",
            sessionID: created.id,
            agent: "build",
            model: { providerID: ProviderID.make("test"), modelID: ModelID.make("test-model") },
            time: { created: Date.now() },
          })
          yield* svc.updatePart({
            id: PartID.ascending(),
            messageID: user.id,
            sessionID: created.id,
            type: "text",
            text: "hello playwright",
          })
          const assistant = yield* svc.updateMessage({
            id: MessageID.ascending(),
            role: "assistant",
            sessionID: created.id,
            parentID: user.id,
            agent: "build",
            mode: "build",
            providerID: ProviderID.make("test"),
            modelID: ModelID.make("test-model"),
            path: { cwd: tmp.path, root: tmp.path },
            cost: 0,
            tokens: {
              total: 1500,
              input: 1000,
              output: 500,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            time: { created: Date.now() },
            finish: "stop",
          } satisfies MessageV2.Assistant)
          yield* svc.updatePart({
            id: PartID.ascending(),
            messageID: assistant.id,
            sessionID: created.id,
            type: "text",
            text: "seeded assistant reply",
          })
          return created
        }).pipe(Effect.provide(layer)),
      )
    },
  })

  await disposeAllInstances()

  const port = process.env.PLAYWRIGHT_SERVER_PORT
    ? Number(process.env.PLAYWRIGHT_SERVER_PORT)
    : await findFreePort()
  const password = crypto.randomBytes(16).toString("hex")
  const { cmd, args, cwd } = serveCommand(port)

  serveProc = spawn(cmd, args, {
    cwd,
    env: {
      ...process.env,
      LOCALCODER_SERVER_PASSWORD: password,
      LOCALCODER_CALLER: "playwright-seed",
      LOCALCODER_EXPERIMENTAL_HTTPAPI: "1",
      LOCALCODER_EXPERIMENTAL_EVENT_SYSTEM: "1",
    },
    stdio: "ignore",
    detached: process.platform !== "win32",
  })
  serveProc.unref?.()

  await waitForHealth(port, password)

  const authToken = base64Encode(`localcoder:${password}`)
  fs.writeFileSync(
    OUT,
    JSON.stringify({
      port,
      password,
      authToken,
      directory: tmp.path,
      dirSlug: base64Encode(tmp.path),
      sessionId: session.id,
      pid: serveProc.pid,
    }),
  )
  console.log(`Playwright live session seeded: ${session.id} on :${port}`)
}

main().catch(async (err) => {
  console.error(err)
  serveProc?.kill()
  await disposeAllInstances().catch(() => undefined)
  process.exit(1)
})
