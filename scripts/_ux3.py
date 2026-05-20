from pathlib import Path
ROOT = Path(r"P:/localcoder/packages/localcoder")

dialog_ctx = r'''import type { AssistantMessage } from "@localcoder-ai/sdk/v2"
import { useSync } from "@tui/context/sync"
import { useLocal } from "@tui/context/local"
import { DialogAlert } from "@tui/ui/dialog-alert"
import { useDialog } from "@tui/ui/dialog"
import { computeContextUsage, tokensFromAssistant, isLocalProvider } from "@tui/util/context-usage"
import { usable } from "@/session/overflow"

export function buildSessionContextReport(sessionID: string, sync: ReturnType<typeof useSync>, local: ReturnType<typeof useLocal>) {
  const msg = sync.data.message[sessionID] ?? []
  const last = msg.findLast(
    (item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0,
  )
  const current = local.model.current()
  const model = last
    ? sync.data.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    : current
      ? sync.data.provider.find((p) => p.id === current.providerID)?.models[current.modelID]
      : undefined

  const tokens = last ? tokensFromAssistant(last) : 0
  const ctx = computeContextUsage({ tokens, model, cfg: sync.data.config })
  const budget = model ? usable({ model, cfg: sync.data.config }) : 0
  const compacting = sync.session.status(sessionID) === "compacting"

  return [
    "Session context",
    "",
    last
      ? `Model: ${last.providerID}/${last.modelID}${isLocalProvider(last.providerID) ? " (local)" : ""}`
      : current
        ? `Model: ${current.providerID}/${current.modelID}`
        : "Model: (none selected)",
    model ? `Context window: ${model.limit.context.toLocaleString()} tokens` : "",
    model ? `Max output reserve: ${model.limit.output.toLocaleString()} tokens` : "",
    budget ? `Usable for chat: ~${budget.toLocaleString()} tokens` : "",
    "",
    ctx
      ? `Used: ${ctx.tokens.toLocaleString()} (${ctx.percent}%)\nRemaining: ~${ctx.remaining.toLocaleString()}\n${ctx.bar}`
      : tokens > 0
        ? `Tokens: ${tokens.toLocaleString()}`
        : "No usage yet — send a message first",
    "",
    compacting ? "Status: compacting…" : "",
    "Compression: auto-compact + auto-prune enabled",
    "Manual: /compact",
    ctx?.compactHint && !compacting ? "Tip: run /compact before long sessions." : "",
  ]
    .filter(Boolean)
    .join("\n")
}

export function useSessionContextDialog() {
  const dialog = useDialog()
  const sync = useSync()
  const local = useLocal()
  return (sessionID: string) => {
    void DialogAlert.show(dialog, "Context usage", buildSessionContextReport(sessionID, sync, local))
  }
}
'''
(ROOT / "src/cli/cmd/tui/component/dialog-context.tsx").write_text(dialog_ctx, encoding="utf-8", newline="\n")
print("dialog-context.tsx")

# Expand dialog-llama
dl = ROOT / "src/cli/cmd/tui/component/dialog-llama.tsx"
t = dl.read_text(encoding="utf-8")
if "Setup paths" not in t:
    t = t.replace('import * as LlamaServer from "@tui/llama-server"', 'import * as LlamaServer from "@tui/llama-server"\nimport * as LlamaSetup from "@tui/llamacpp-setup"')
    t = t.replace(
        '  const cfg = createMemo(() => LlamaServer.getConfig())',
        '  const cfg = createMemo(() => LlamaServer.getConfig())\n  const mtp = createMemo(() => (cfg().modelPath ? LlamaSetup.modelUsesMtp(cfg().modelPath) : false))',
    )
    t = t.replace(
        '          description: `Load ${cfg().modelPath.split(/[/\\\\]/).pop()} · ctx ${cfg().ctx} (MTP)`,',
        '          description: cfg().modelPath\n            ? `Load ${cfg().modelPath.split(/[/\\\\]/).pop()} · ctx ${cfg().ctx}${mtp() ? " · MTP" : ""}`\n            : "Set model path in ~/.localcoder/llamacpp.json or LOCALCODER_LLAMACPP_MODEL",',
    )
    insert_opts = '''        {
          title: "Setup guide",
          value: "setup",
          description: "Paths, env vars, and ~/.localcoder/llamacpp.json",
        },
        {
          title: "Save current paths",
          value: "save",
          description: "Persist llama dir + model to user config",
          disabled: !cfg().modelPath,
        },'''
    t = t.replace(
        '        {\n          title: "Refresh status",',
        insert_opts + '\n        {\n          title: "Refresh status",',
    )
    t = t.replace(
        '          if (option.value === "refresh") {',
        '''          if (option.value === "setup") {
            await DialogAlert.show(dialog, "llama.cpp setup", LlamaSetup.setupHint())
            return
          }
          if (option.value === "save") {
            LlamaSetup.saveUserLlamaConfig({
              llamaDir: cfg().llamaDir,
              modelPath: cfg().modelPath,
              ctx: cfg().ctx,
              mtp: mtp(),
            })
            toast.show({ message: `Saved to ${LlamaSetup.configPath()}`, variant: "success" })
            return
          }
          if (option.value === "refresh") {''',
    )
    dl.write_text(t, encoding="utf-8", newline="\n")
    print("dialog-llama.tsx")

# tips
tips = ROOT / "src/cli/cmd/tui/feature-plugins/home/tips-view.tsx"
t = tips.read_text(encoding="utf-8")
if "/llama" not in t or "local GGUF" not in t:
    t = t.replace(
        'const NO_MODELS_TIP = "Run {highlight}/connect{/highlight} to add an AI provider and start coding"',
        'const NO_MODELS_TIP = "Run {highlight}/connect{/highlight} for cloud APIs or {highlight}/llama{/highlight} for local GGUF models"',
    )
    if "Run {highlight}/llama{/highlight}" not in t:
        t = t.replace(
            '  "Run {highlight}/connect{/highlight} to add API keys for 75+ supported LLM providers",',
            '  "Run {highlight}/connect{/highlight} for cloud APIs or {highlight}/llama{/highlight} to run local GGUF via llama.cpp",\n  "Context bar in the prompt footer tracks tokens; use {highlight}/compact{/highlight} on long sessions",\n  "Run {highlight}/context{/highlight} in a session for a full token budget breakdown",',
        )
    tips.write_text(t, encoding="utf-8", newline="\n")
    print("tips-view.tsx")

# sidebar footer getting started
sf = ROOT / "src/cli/cmd/tui/feature-plugins/sidebar/footer.tsx"
t = sf.read_text(encoding="utf-8")
if "Local GGUF" not in t:
    t = t.replace(
        '            <text fg={theme().textMuted}>LocalCoder includes free models so you can start immediately.</text>',
        '            <text fg={theme().textMuted}>Use free cloud models, connect a provider, or run local GGUF.</text>',
    )
    t = t.replace(
        '            <box flexDirection="row" gap={1} justifyContent="space-between">\n              <text fg={theme().text}>Connect provider</text>\n              <text fg={theme().textMuted}>/connect</text>\n            </box>',
        '''            <box flexDirection="row" gap={1} justifyContent="space-between">
              <text fg={theme().text}>Connect provider</text>
              <text fg={theme().textMuted}>/connect</text>
            </box>
            <box flexDirection="row" gap={1} justifyContent="space-between">
              <text fg={theme().text}>Local GGUF (llama.cpp)</text>
              <text fg={theme().textMuted}>/llama</text>
            </box>''',
    )
    sf.write_text(t, encoding="utf-8", newline="\n")
    print("sidebar footer")

print("ux3 done")
