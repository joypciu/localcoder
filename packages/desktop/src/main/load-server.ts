import path from "node:path"
import { fileURLToPath } from "node:url"

/** Runtime load of prebuilt localcoder node bundle (see electron.vite copy-server plugin). */
export async function loadLocalcoderServer() {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const entry = path.join(dir, "localcoder-server", "node.js")
  return import(entry) as Promise<typeof import("virtual:localcoder-server")>
}
