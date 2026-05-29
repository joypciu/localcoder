import { execSync, spawn } from "child_process"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { saveVitePid, waitForHttp } from "./server-lifecycle"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, "../../..")
const seedPath = path.join(here, ".live-session.json")

function killPort(port: number) {
  try {
    const out = execSync(`netstat -ano | findstr ":${port}"`, { encoding: "utf8" })
    const pids = new Set<number>()
    for (const line of out.split("\n")) {
      if (!line.includes("LISTENING")) continue
      const pid = Number(line.trim().split(/\s+/).pop())
      if (pid) pids.add(pid)
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" })
      } catch {}
    }
  } catch {}
}

export default async function globalSetup() {
  if (process.env.PLAYWRIGHT_LIVE_SESSION !== "1") return

  killPort(Number(process.env.PLAYWRIGHT_PORT ?? 3000))
  killPort(Number(process.env.PLAYWRIGHT_SERVER_PORT ?? 4096))

  if (fs.existsSync(seedPath)) fs.unlinkSync(seedPath)

  const port = process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"
  const vitePort = process.env.PLAYWRIGHT_PORT ?? "3000"
  const script = path.join(root, "packages", "localcoder", "scripts", "seed-playwright-session.ts")

  execSync(`bun run "${script}"`, {
    stdio: "inherit",
    cwd: path.join(root, "packages", "localcoder"),
    timeout: 25_000,
    env: { ...process.env, PLAYWRIGHT_SERVER_PORT: port },
  })

  const vite = spawn("bun", ["run", "dev", "--", "--host", "127.0.0.1", "--port", vitePort], {
    cwd: path.join(root, "packages", "app"),
    stdio: "ignore",
    env: {
      ...process.env,
      VITE_LOCALCODER_SERVER_HOST: process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1",
      VITE_LOCALCODER_SERVER_PORT: port,
    },
  })
  saveVitePid(vite.pid)

  await waitForHttp(`http://127.0.0.1:${vitePort}/`, 20_000)
}
