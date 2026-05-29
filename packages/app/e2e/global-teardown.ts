import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { killVite } from "./server-lifecycle"

const here = path.dirname(fileURLToPath(import.meta.url))

export default async function globalTeardown() {
  const seedPath = path.join(here, ".live-session.json")
  if (fs.existsSync(seedPath)) {
    try {
      const seed = JSON.parse(fs.readFileSync(seedPath, "utf8")) as { pid?: number }
      if (seed.pid) {
        try {
          process.kill(seed.pid)
        } catch {}
      }
      fs.unlinkSync(seedPath)
    } catch {}
  }
  killVite()
}
