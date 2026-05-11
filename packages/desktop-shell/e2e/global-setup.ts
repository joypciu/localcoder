import { execSync } from "child_process"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { seedPath } from "./live-fixture"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, "../../..")

export default async function globalSetup() {
  if (process.env.E2E_SKIP_SHELL_LIVE === "1") return

  if (fs.existsSync(seedPath)) fs.unlinkSync(seedPath)

  const script = path.join(root, "packages", "localcoder", "scripts", "seed-shell-playwright.ts")
  execSync(`bun "${script}"`, {
    stdio: "inherit",
    cwd: path.join(root, "packages", "localcoder"),
    timeout: 180_000,
    env: {
      ...process.env,
      SHELL_E2E_SERVER_PORT: process.env.SHELL_E2E_SERVER_PORT ?? "",
    },
  })

  if (fs.existsSync(seedPath)) {
    const seed = JSON.parse(fs.readFileSync(seedPath, "utf8")) as { url?: string }
    if (seed.url) process.env.SHELL_E2E_PROXY = seed.url
  }
}
