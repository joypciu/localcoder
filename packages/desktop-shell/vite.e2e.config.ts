import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

const here = path.dirname(fileURLToPath(import.meta.url))
const seedPath = path.join(here, "e2e", ".live-session.json")

function sidecarUrl(): string {
  if (process.env.SHELL_E2E_PROXY) return process.env.SHELL_E2E_PROXY
  try {
    if (fs.existsSync(seedPath)) {
      const seed = JSON.parse(fs.readFileSync(seedPath, "utf8")) as { url?: string }
      if (seed.url) return seed.url
    }
  } catch {}
  return "http://127.0.0.1:4096"
}

// Re-read on each dev server start (globalSetup writes .live-session.json first).
const proxyTarget = sidecarUrl()
console.info(`[shell-e2e] proxy → ${proxyTarget}`)
const proxy = {
  target: proxyTarget,
  changeOrigin: true,
  secure: false,
}

export default defineConfig({
  plugins: [solid()],
  root: "e2e",
  server: {
    host: "127.0.0.1",
    port: Number(process.env.SHELL_E2E_PORT ?? 5199),
    strictPort: true,
    proxy: {
      "/global": proxy,
      "/session": proxy,
      "/provider": proxy,
      "/permission": proxy,
      "/event": proxy,
      "/app": proxy,
      "/project": proxy,
      "/config": proxy,
      "/file": proxy,
    },
  },
})
