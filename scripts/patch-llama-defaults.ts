import path from "path"
const p = path.join(import.meta.dir, "..", "packages", "localcoder", "src", "cli", "cmd", "tui", "llama-server.ts")
let t = await Bun.file(p).text()
const old = `const DEFAULT_MODEL =
  process.env.LOCALCODER_LLAMACPP_MODEL ??
  String.raw\`P:\\gguf models\\Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled.IQ4_XS.gguf\``
const neu = `const DEFAULT_MODEL_12B = String.raw\`P:\\famino-12b-model_stock-q6_k.gguf\`
const DEFAULT_MODEL_35B = String.raw\`P:\\gguf models\\Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled.IQ4_XS.gguf\`
const DEFAULT_MODEL =
  process.env.LOCALCODER_LLAMACPP_MODEL ?? DEFAULT_MODEL_12B`
if (!t.includes("DEFAULT_MODEL_12B")) {
  t = t.replace(old, neu)
  t = t.replace("ctx: Number(process.env.LLAMACPP_CTX ?? 2048)", "ctx: Number(process.env.LLAMACPP_CTX ?? 16384)")
  await Bun.write(p, t)
  console.log("updated llama-server defaults")
} else console.log("already updated")
