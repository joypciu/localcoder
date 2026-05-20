from pathlib import Path
ROOT = Path(r"P:/localcoder/packages/localcoder")

def patch(path, old, new):
    p = Path(path)
    t = p.read_text(encoding="utf-8")
    if old not in t:
        raise SystemExit(f"missing {p.name}: {old[:60]!r}")
    p.write_text(t.replace(old, new, 1), encoding="utf-8", newline="\n")
    print("ok", p.name)

# system.ts
patch(ROOT / "src/session/system.ts",
    'import PROMPT_TRINITY from "./prompt/trinity.txt"',
    'import PROMPT_TRINITY from "./prompt/trinity.txt"\nimport PROMPT_QWEN from "./prompt/qwen.txt"')
patch(ROOT / "src/session/system.ts",
    '  if (model.api.id.toLowerCase().includes("kimi")) return [PROMPT_KIMI]\n  return [PROMPT_DEFAULT]',
    '  if (model.api.id.toLowerCase().includes("kimi")) return [PROMPT_KIMI]\n  if (model.api.id.toLowerCase().includes("qwen") || model.api.id.toLowerCase().includes("qwopus"))\n    return [PROMPT_QWEN]\n  return [PROMPT_DEFAULT]')

# overflow.ts
patch(ROOT / "src/session/overflow.ts",
"""export function usable(input: { cfg: Config.Info; model: Provider.Model }) {
  const context = input.model.limit.context
  if (context === 0) return 0

  const reserved =
    input.cfg.compaction?.reserved ?? Math.min(COMPACTION_BUFFER, ProviderTransform.maxOutputTokens(input.model))
  return input.model.limit.input
    ? Math.max(0, input.model.limit.input - reserved)
    : Math.max(0, context - ProviderTransform.maxOutputTokens(input.model))
}""",
"""export function usable(input: { cfg: Config.Info; model: Provider.Model }) {
  const context = input.model.limit.context
  if (context === 0) return 0

  const maxOut = ProviderTransform.maxOutputTokens(input.model)
  const defaultReserved =
    context <= 32_768
      ? Math.min(4_096, Math.floor(context * 0.2))
      : Math.min(COMPACTION_BUFFER, maxOut)
  const reserved = input.cfg.compaction?.reserved ?? defaultReserved

  if (input.model.limit.input) {
    return Math.max(0, input.model.limit.input - reserved)
  }
  return Math.max(0, context - maxOut - reserved)
}""")

# provider.ts llamacpp limits
patch(ROOT / "src/provider/provider.ts",
"""                limit: {
                  context: 128000,
                  output: 16384,
                },""",
"""                limit: {
                  context: Number(process.env.LLAMACPP_CTX ?? 16384),
                  output: Number(process.env.LLAMACPP_MAX_OUTPUT ?? 4096),
                },""")

# transform.ts thinking off for llamacpp qwen
patch(ROOT / "src/provider/transform.ts",
"""  if (
    ["zai", "zhipuai"].some((id) => input.model.providerID.includes(id)) &&
    input.model.api.npm === "@ai-sdk/openai-compatible"
  ) {
    result["thinking"] = {
      type: "enabled",
      clear_thinking: false,
    }
  }""",
"""  if (
    ["zai", "zhipuai"].some((id) => input.model.providerID.includes(id)) &&
    input.model.api.npm === "@ai-sdk/openai-compatible"
  ) {
    result["thinking"] = {
      type: "enabled",
      clear_thinking: false,
    }
  }

  if (input.model.providerID === "llamacpp" && input.model.api.npm === "@ai-sdk/openai-compatible") {
    const id = input.model.api.id.toLowerCase()
    if (id.includes("qwen") || id.includes("qwopus")) {
      result["chat_template_args"] = { enable_thinking: false }
    }
  }""")

print("core patches done")
