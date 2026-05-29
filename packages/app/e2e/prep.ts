import { execSync } from "child_process"

/** Kill stale listeners so webServer health checks don't hang on dead sockets. */
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

export default async function prep() {
  if (process.env.PLAYWRIGHT_NO_KILL_PORTS === "1") return
  // Only clear ports when explicitly requested (CI / live suite). Default local runs reuse Vite.
  if (process.env.PLAYWRIGHT_FRESH_SERVER === "1" || process.env.CI) {
    killPort(Number(process.env.PLAYWRIGHT_PORT ?? 3000))
  }
}
