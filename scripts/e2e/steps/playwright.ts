import { DESKTOP_EXE, ROOT, resolveBun } from "../lib/paths"
import { runCmdInherit } from "../lib/runner"
import fs from "fs"
import path from "path"

const DESKTOP_SMOKE = path.join(ROOT, "scripts", "e2e", "desktop-exe-smoke.ts")

const BUN = resolveBun()

export async function stepPlaywrightApp(): Promise<string> {
  if (process.env.E2E_SKIP_PLAYWRIGHT === "1") {
    return "skipped (E2E_SKIP_PLAYWRIGHT=1)"
  }
  const code = await runCmdInherit(BUN, ["run", "test:e2e:local"], {
    cwd: path.join(ROOT, "packages", "app"),
    env: {
      PLAYWRIGHT_SERVER_HOST: process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1",
      PLAYWRIGHT_SERVER_PORT: process.env.PLAYWRIGHT_SERVER_PORT ?? "4096",
    },
  })
  if (code !== 0) throw new Error(`playwright test:e2e:local exited ${code}`)
  return "app playwright smoke passed"
}

export async function stepDesktopExeLaunch(): Promise<string> {
  if (process.env.E2E_SKIP_DESKTOP_LAUNCH === "1") {
    return "skipped (E2E_SKIP_DESKTOP_LAUNCH=1)"
  }
  if (!fs.existsSync(DESKTOP_EXE)) {
    throw new Error(`missing ${DESKTOP_EXE}`)
  }
  const code = await runCmdInherit(BUN, ["run", DESKTOP_SMOKE], { cwd: ROOT })
  if (code !== 0) throw new Error(`desktop-exe-smoke exited ${code}`)
  const mb = (fs.statSync(DESKTOP_EXE).size / (1024 * 1024)).toFixed(1)
  return `LocalCoder.exe headed launch OK (${mb} MB)`
}
