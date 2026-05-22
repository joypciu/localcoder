import * as Log from "@localcoder-ai/core/util/log"
import * as Setup from "./setup"
import * as Server from "./server"
import { configure } from "./bootstrap"

const log = Log.create({ service: "llamacpp.autostart" })

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
    log.warn("llamacpp autostart failed", { error: error instanceof Error ? error.message : String(error) })
  }
}