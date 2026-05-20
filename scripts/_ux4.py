from pathlib import Path
si = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/routes/session/index.tsx")
t = si.read_text(encoding="utf-8")
t = t.replace(
    """      onSelect: (dialog) => {
        const show = useSessionContextDialog()
        show(route.sessionID)
        dialog.clear()
      },""",
    """      onSelect: (dialog) => {
        showContext(route.sessionID)
        dialog.clear()
      },""",
)
if "const showContext = useSessionContextDialog()" not in t:
    t = t.replace(
        "  const command = useCommandDialog()",
        "  const showContext = useSessionContextDialog()\n  const command = useCommandDialog()",
    )
si.write_text(t, encoding="utf-8", newline="\n")
print("fixed session context hook")

# prompt model warning
pi = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/component/prompt/index.tsx")
t = pi.read_text(encoding="utf-8")
if "hasLlamaCppProvider" not in t:
    t = t.replace(
        'import { useConnected } from "../use-connected"',
        'import { useConnected, hasLlamaCppProvider } from "../use-connected"',
    )
    t = t.replace(
        """  function promptModelWarning() {
    toast.show({
      variant: "warning",
      message: "Connect a provider to send prompts",
      duration: 3000,
    })
    if (sync.data.provider.length === 0) {
      dialog.replace(() => <DialogProviderConnect />)
    }
  }""",
        """  function promptModelWarning() {
    const llama = hasLlamaCppProvider()()
    toast.show({
      variant: "warning",
      message: llama
        ? "Select a model or run /llama to start local llama-server"
        : "Run /connect for cloud APIs or /llama for local GGUF models",
      duration: 4000,
    })
    if (sync.data.provider.length === 0) {
      dialog.replace(() => <DialogProviderConnect />)
    }
  }""",
    )
    pi.write_text(t, encoding="utf-8", newline="\n")
    print("prompt warning")

# prompt cost - use formatSessionCost
t = pi.read_text(encoding="utf-8")
if "formatSessionCost" not in t:
    t = t.replace(
        "import { computeContextUsage, contextLevelColor, tokensFromAssistant } from \"@tui/util/context-usage\"",
        "import { computeContextUsage, contextLevelColor, tokensFromAssistant, formatSessionCost, homeModelHint } from \"@tui/util/context-usage\"",
    )
    t = t.replace(
        "    const cost = msg.reduce((sum, item) => sum + (item.role === \"assistant\" ? item.cost : 0), 0)",
        "    const costTotal = msg.reduce((sum, item) => sum + (item.role === \"assistant\" ? item.cost : 0), 0)\n    const cost = formatSessionCost(costTotal, last.providerID)",
    )
    # home hint in footer when no session
    if "homeModelHint" not in t.split("usage = createMemo")[1][:500]:
        pass
    pi.write_text(t, encoding="utf-8", newline="\n")
    print("prompt cost")

# sidebar context local cost
sc = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/feature-plugins/sidebar/context.tsx")
t = sc.read_text(encoding="utf-8")
if "formatSessionCost" not in t:
    t = t.replace(
        "import { computeContextUsage, contextLevelColor, tokensFromAssistant } from \"@tui/util/context-usage\"",
        "import { computeContextUsage, contextLevelColor, tokensFromAssistant, formatSessionCost, isLocalProvider } from \"@tui/util/context-usage\"",
    )
    t = t.replace(
        "  const cost = createMemo(() => msg().reduce((sum, item) => sum + (item.role === \"assistant\" ? item.cost : 0), 0))",
        "  const cost = createMemo(() => {\n    const total = msg().reduce((sum, item) => sum + (item.role === \"assistant\" ? item.cost : 0), 0)\n    const pid = msg().findLast((m) => m.role === \"assistant\")?.providerID\n    return formatSessionCost(total, pid) ?? (pid && isLocalProvider(pid) ? undefined : total)\n  })",
    )
    t = t.replace(
        '      <text fg={theme().textMuted}>{money.format(cost())} spent</text>',
        '      <Show when={cost() !== undefined} fallback={<text fg={theme().textMuted}>Local model — no API cost</text>}>\n        <text fg={theme().textMuted}>{money.format(cost()!)} spent</text>\n      </Show>',
    )
    t = t.replace('import { createMemo } from "solid-js"', 'import { createMemo, Show } from "solid-js"')
    sc.write_text(t, encoding="utf-8", newline="\n")
    print("sidebar context cost")

# home footer model line
hf = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/feature-plugins/home/footer.tsx")
t = hf.read_text(encoding="utf-8")
if "homeModelHint" not in t:
    t = t.replace('import { createMemo, Match, Show, Switch } from "solid-js"', 'import { createMemo, Match, Show, Switch } from "solid-js"\nimport { homeModelHint } from "@tui/util/context-usage"')
    t = t.replace(
        """function Version(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current

  return (
    <box flexShrink={0}>
      <text fg={theme().textMuted}>{props.api.app.version}</text>
    </box>
  )
}""",
        """function Model(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const hint = createMemo(() =>
    homeModelHint({
      model: props.api.state.model.current(),
      providers: props.api.state.provider,
    }),
  )
  return <text fg={theme().textMuted}>{hint()}</text>
}

function Version(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current

  return (
    <box flexShrink={0}>
      <text fg={theme().textMuted}>{props.api.app.version}</text>
    </box>
  )
}""",
    )
    t = t.replace(
        "      <Directory api={props.api} />\n      <Mcp api={props.api} />",
        "      <Directory api={props.api} />\n      <Model api={props.api} />\n      <Mcp api={props.api} />",
    )
    hf.write_text(t, encoding="utf-8", newline="\n")
    print("home footer model")

# README local section
readme = Path(r"P:/localcoder/packages/localcoder/README.md")
if readme.exists() and "LOCALCODER_LLAMACPP" not in readme.read_text():
    readme.write_text(readme.read_text(encoding="utf-8") + """

## Local models (llama.cpp)

LocalCoder supports local GGUF models via [llama.cpp](https://github.com/ggml-org/llama.cpp):

1. Install `llama-server` and download a `.gguf` model.
2. In the TUI, run **`/llama`** → **Start server** (or set paths in `~/.localcoder/llamacpp.json`).
3. Optional env: `LOCALCODER_LLAMACPP_DIR`, `LOCALCODER_LLAMACPP_MODEL`, `LLAMACPP_CTX` (default 16384).

Use **`/context`** in a session to inspect token usage; **`/compact`** to summarize long sessions.
""", encoding="utf-8")
    print("readme")

print("ux4 done")
