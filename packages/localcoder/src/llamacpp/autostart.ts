import path from "path"
import * as Log from "@localcoder-ai/core/util/log"
import * as Setup from "./setup"
import * as Server from "./server"
import { configure } from "./bootstrap"
import { createServer } from "net"

const log = Log.create({ service: "llamacpp.autostart" })

function findFreePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once("error", () => resolve(findFreePort(preferred + 1)))
    server.once("listening", () => {
      server.close(() => resolve(preferred))
    })
    server.listen(preferred, "127.0.0.1")
  })
}

export async function maybeAutoStartLlamaCpp() {
  const saved = Setup.loadUserLlamaConfig()
  if (saved.autoStart === false) return
  if (!saved.llamaDir || !saved.modelPath) return

  try {
    Setup.validateSetup({ llamaDir: saved.llamaDir, modelPath: saved.modelPath })
  } catch (error) {
    log.warn("llamacpp autostart skipped", { error: error instanceof Error ? error.message : String(error) })
    return
  }

  const probed = await Server.probe()
  if (probed.ok) {
    process.env.LLAMACPP_API_URL = Server.getConfig().apiUrl
    return
  }

  // If the default port is in use, pick a free one so autostart doesn't hang
  // when another service already owns 8080.
  const preferredPort = Server.getConfig().port
  const freePort = await findFreePort(preferredPort)
  if (freePort !== preferredPort) {
    process.env.LLAMACPP_API_URL = `http://127.0.0.1:${freePort}/v1`
    log.info("default llama.cpp port in use, using free port", { preferredPort, freePort })
  }

  log.info("starting llama-server (autostart)")
  try {
    await configure({
      llamaDir: saved.llamaDir,
      modelPath: saved.modelPath,
      autoStart: true,
      ctx: saved.ctx,
    })
    log.info("llama-server ready")
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    log.warn("llamacpp autostart failed", { error: msg })
    // If the configured model is missing, try to find a fallback
    if (msg.includes("not found") || msg.includes("No GGUF model")) {
      const fallback = Setup.findGgufFiles(1)[0]
      if (fallback) {
        log.info("autostart fallback: trying discovered model", { model: path.basename(fallback) })
        try {
          await configure({
            llamaDir: saved.llamaDir,
            modelPath: fallback,
            autoStart: true,
            ctx: saved.ctx,
          })
          log.info("llama-server ready (fallback model)")
        } catch (fallbackError) {
          log.warn("llamacpp autostart fallback also failed", { error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError) })
        }
      }
    }
  }
}
