from pathlib import Path
ROOT = Path(r"P:/localcoder/packages/localcoder")

def patch(path, old, new):
    p = Path(path)
    t = p.read_text(encoding="utf-8")
    if old not in t:
        raise SystemExit(f"missing {p.name}")
    p.write_text(t.replace(old, new, 1), encoding="utf-8", newline="\n")
    print("ok", p.name)

# sidebar context
patch(ROOT / "src/cli/cmd/tui/feature-plugins/sidebar/context.tsx",
    'import { createMemo } from "solid-js"',
    'import { createMemo } from "solid-js"\nimport { computeContextUsage, contextLevelColor, tokensFromAssistant } from "@tui/util/context-usage"')

patch(ROOT / "src/cli/cmd/tui/feature-plugins/sidebar/context.tsx",
    """  const state = createMemo(() => {
    const last = msg().findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) {
      return {
        tokens: 0,
        percent: null,
      }
    }

    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = props.api.state.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    return {
      tokens,
      percent: model?.limit.context ? Math.round((tokens / model.limit.context) * 100) : null,
    }
  })""",
    """  const state = createMemo(() => {
    const last = msg().findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) {
      return { tokens: 0, ctx: undefined as ReturnType<typeof computeContextUsage> }
    }

    const tokens = tokensFromAssistant(last)
    const model = props.api.state.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const ctx = computeContextUsage({ tokens, model, cfg: props.api.state.config })
    return { tokens, ctx }
  })""")

patch(ROOT / "src/cli/cmd/tui/feature-plugins/sidebar/context.tsx",
    """      <text fg={theme().textMuted}>{state().tokens.toLocaleString()} tokens</text>
      <text fg={theme().textMuted}>{state().percent ?? 0}% used</text>
      <text fg={theme().textMuted}>{money.format(cost())} spent</text>""",
    """      <text fg={theme().textMuted}>
        {state().ctx ? state().ctx.detail : `${state().tokens.toLocaleString()} tokens`}
      </text>
      <text fg={state().ctx ? contextLevelColor(state().ctx.level, theme()) : theme().textMuted}>
        {state().ctx ? `${state().ctx.percent}% of usable context` : "—"}
      </text>
      <text fg={theme().textMuted}>
        {state().ctx?.compactHint ? "Auto-compact on overflow · /compact now" : "Auto-compact enabled"}
      </text>
      <text fg={theme().textMuted}>{money.format(cost())} spent</text>""")

# tips
tips = ROOT / "src/cli/cmd/tui/feature-plugins/home/tips-view.tsx"
t = tips.read_text(encoding="utf-8")
tip = '  "Context bar in the prompt footer shows usage; run {highlight}/compact{/highlight} before long coding sessions",\n'
if "/compact" not in t and "TIPS = [" in t:
    t = t.replace("const TIPS = [\n", "const TIPS = [\n" + tip)
    tips.write_text(t, encoding="utf-8", newline="\n")
    print("ok tips")

# example config
(Path(r"P:/localcoder/scripts/localcoder.llamacpp.example.json")).write_text("""{
  "$schema": "https://localcoder.ai/config.json",
  "model": "llamacpp/Qwopus3.5-9B-Coder-MTP-Q6_K.gguf",
  "provider": {
    "llamacpp": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://127.0.0.1:8080/v1",
        "apiKey": "not-needed"
      },
      "models": {
        "Qwopus3.5-9B-Coder-MTP-Q6_K.gguf": {
          "limit": { "context": 16384, "output": 4096 }
        }
      }
    }
  },
  "compaction": {
    "auto": true,
    "prune": true,
    "tail_turns": 3,
    "preserve_recent_tokens": 3500,
    "reserved": 4096
  },
  "permission": {
    "webfetch": "allow",
    "edit": "allow",
    "bash": "allow",
    "grep": "allow",
    "glob": "allow",
    "read": "allow",
    "list": "allow"
  }
}
""", encoding="utf-8", newline="\n")
print("example config")

