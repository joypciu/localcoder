from pathlib import Path
ROOT = Path(r"P:/localcoder/packages/localcoder")

def patch(path, old, new):
    p = Path(path)
    t = p.read_text(encoding="utf-8")
    if old not in t:
        raise SystemExit(f"missing {p.name}: {old[:70]!r}")
    p.write_text(t.replace(old, new, 1), encoding="utf-8", newline="\n")
    print("ok", p.name)

# llama-server.ts
patch(ROOT / "src/cli/cmd/tui/llama-server.ts",
"""const DEFAULT_MODEL =
  process.env.LOCALCODER_LLAMACPP_MODEL ??
  String.raw`P:\\gguf models\\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf`

export function llamaServerArgs(cfg: LlamaServerConfig): string[] {
  return [
    "-m",
    cfg.modelPath,
    "--host",
    "127.0.0.1",
    "--port",
    String(cfg.port),
    "-c",
    String(cfg.ctx),
    "--jinja",
    "--spec-type",
    "draft-mtp",
    "--spec-draft-n-max",
    "2",
  ]
}""",
"""const DEFAULT_MODEL =
  process.env.LOCALCODER_LLAMACPP_MODEL ??
  String.raw`P:\\gguf models\\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf`

/** Matches LLAMACPP_CTX / provider discoverModels for overflow UI. */
export function getLlamaContextLimit() {
  return Number(process.env.LLAMACPP_CTX ?? 16384)
}

export function llamaServerArgs(cfg: LlamaServerConfig): string[] {
  const args = [
    "-m",
    cfg.modelPath,
    "--host",
    "127.0.0.1",
    "--port",
    String(cfg.port),
    "-c",
    String(cfg.ctx),
    "-np",
    process.env.LLAMACPP_PARALLEL ?? "2",
    "--jinja",
    "--spec-type",
    "draft-mtp",
    "--spec-draft-n-max",
    process.env.LLAMACPP_MTP_DRAFT ?? "2",
  ]
  const ngl = process.env.LLAMACPP_NGL
  if (ngl) args.push("-ngl", ngl)
  return args
}""")

patch(ROOT / "src/cli/cmd/tui/llama-server.ts",
    "    ctx: Number(process.env.LLAMACPP_CTX ?? 16384),",
    "    ctx: getLlamaContextLimit(),")

# compaction prune scale
patch(ROOT / "src/session/compaction.ts",
    """      let total = 0
      let pruned = 0
      const toPrune: MessageV2.ToolPart[] = []
      let turns = 0

      loop: for (let msgIndex = msgs.length - 1; msgIndex >= 0; msgIndex--) {""",
    """      const ctxHint = Number(process.env.LLAMACPP_CTX ?? 0)
      const smallCtx = ctxHint > 0 && ctxHint <= 32_768
      const pruneProtect = smallCtx ? Math.max(4_000, Math.floor(ctxHint * 0.25)) : PRUNE_PROTECT
      const pruneMinimum = smallCtx ? Math.max(2_000, Math.floor(ctxHint * 0.1)) : PRUNE_MINIMUM

      let total = 0
      let pruned = 0
      const toPrune: MessageV2.ToolPart[] = []
      let turns = 0

      loop: for (let msgIndex = msgs.length - 1; msgIndex >= 0; msgIndex--) {""")
patch(ROOT / "src/session/compaction.ts",
    "          if (total <= PRUNE_PROTECT) continue",
    "          if (total <= pruneProtect) continue")
patch(ROOT / "src/session/compaction.ts",
    "      if (pruned > PRUNE_MINIMUM) {",
    "      if (pruned > pruneMinimum) {")

# dialog-llama.tsx
patch(ROOT / "src/cli/cmd/tui/component/dialog-llama.tsx",
    '          description: "Load GGUF with auto GPU fit (first start may take a few minutes)",',
    '          description: `Load ${cfg().modelPath.split(/[/\\\\]/).pop()} · ctx ${cfg().ctx} (MTP)`,')

# prompt index - usage
patch(ROOT / "src/cli/cmd/tui/component/prompt/index.tsx",
    'import { WorkspaceLabel, type WorkspaceStatus } from "../workspace-label"',
    'import { WorkspaceLabel, type WorkspaceStatus } from "../workspace-label"\nimport { computeContextUsage, contextLevelColor, tokensFromAssistant } from "@tui/util/context-usage"')

patch(ROOT / "src/cli/cmd/tui/component/prompt/index.tsx",
    """  const usage = createMemo(() => {
    if (!props.sessionID) return
    const msg = sync.data.message[props.sessionID] ?? []
    const last = msg.findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) return

    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    if (tokens <= 0) return

    const model = sync.data.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const pct = model?.limit.context ? `${Math.round((tokens / model.limit.context) * 100)}%` : undefined
    const cost = msg.reduce((sum, item) => sum + (item.role === "assistant" ? item.cost : 0), 0)
    return {
      context: pct ? `${Locale.number(tokens)} (${pct})` : Locale.number(tokens),
      cost: cost > 0 ? money.format(cost) : undefined,
    }
  })""",
    """  const usage = createMemo(() => {
    if (!props.sessionID) return
    const msg = sync.data.message[props.sessionID] ?? []
    const last = msg.findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) return

    const tokens = tokensFromAssistant(last)
    if (tokens <= 0) return

    const model = sync.data.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    const ctx = computeContextUsage({ tokens, model, cfg: sync.data.config })
    const cost = msg.reduce((sum, item) => sum + (item.role === "assistant" ? item.cost : 0), 0)
    const compacting = sync.session.status(props.sessionID) === "compacting"
    return {
      ctx,
      cost: cost > 0 ? money.format(cost) : undefined,
      compacting,
      context: ctx?.short ?? Locale.number(tokens),
    }
  })""")

patch(ROOT / "src/cli/cmd/tui/component/prompt/index.tsx",
    """                    <Match when={usage()}>
                      {(item) => (
                        <text fg={theme.textMuted} wrapMode="none">
                          {[item().context, item().cost].filter(Boolean).join(" · ")}
                        </text>
                      )}
                    </Match>""",
    """                    <Match when={usage()?.ctx}>
                      {(item) => (
                        <text fg={contextLevelColor(item().ctx!.level, theme)} wrapMode="none">
                          {[
                            item().compacting ? "compacting…" : item().ctx!.detail,
                            item().ctx!.compactHint && !item().compacting ? "/compact" : undefined,
                            item().cost,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </text>
                      )}
                    </Match>
                    <Match when={usage() && !usage()?.ctx}>
                      {(item) => (
                        <text fg={theme.textMuted} wrapMode="none">
                          {[item().context, item().cost].filter(Boolean).join(" · ")}
                        </text>
                      )}
                    </Match>""")

print("ui patches done")
