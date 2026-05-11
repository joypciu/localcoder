import fs from "fs"
import { rm } from "fs/promises"
import { seedPath } from "./live-fixture"

export default async function globalTeardown() {
  if (!fs.existsSync(seedPath)) return
  try {
    const seed = JSON.parse(fs.readFileSync(seedPath, "utf8")) as { pid?: number; directory?: string }
    if (seed.pid) {
      try {
        process.kill(seed.pid)
      } catch {}
    }
    if (seed.directory) {
      await rm(seed.directory, { recursive: true, force: true }).catch(() => undefined)
    }
    fs.unlinkSync(seedPath)
  } catch {}
}
