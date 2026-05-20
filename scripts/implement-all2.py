from pathlib import Path

ROOT = Path(r"P:/localcoder/packages/localcoder/src")
TUI = ROOT / "cli/cmd/tui"

def w(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print("write", path.name)

def patch(path, old, new, count=1):
    t = path.read_text(encoding="utf-8")
    if old not in t:
        print("SKIP patch", path.name, old[:40])
        return False
    path.write_text(t.replace(old, new, count), encoding="utf-8")
    print("patch", path.name)
    return True

# fix type-to-focus
w(TUI / "component/type-to-focus.tsx", '''import { useKeyboard } from "@opentui/solid"
import { usePromptRef } from "@tui/context/prompt"
import { useKeyboardLayer } from "@tui/context/keyboard-layer"
import { useDialog } from "@tui/ui/dialog"

const PRINTABLE = /^[a-z0-9`~!@#$%^&*()_\\-+=[\\]{}|;':",./<>? ]$/i

/** OpenCode-style: typing focuses the prompt when no overlay is active. */
export function TypeToFocus() {
  const promptRef = usePromptRef()
  const layers = useKeyboardLayer()
  const dialog = useDialog()

  useKeyboard((evt) => {
    if (evt.defaultPrevented) return
    if (!layers.isEmpty()) return
    if (dialog.stack.length > 0) return
    if (evt.ctrl || evt.meta || evt.alt) return
    if (!evt.name || evt.name.length !== 1) return
    if (!PRINTABLE.test(evt.name)) return
    const ref = promptRef.current
    if (!ref || ref.focused) return
    ref.focus()
  })

  return null
}
''')

# new-session route
w(TUI / "routes/new-session.tsx", '''import { createEffect, createMemo, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import { useRoute, useRouteData } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { useSDK } from "@tui/context/sdk"
import { useTheme } from "@tui/context/theme"
import { useLocal } from "@tui/context/local"
import { Prompt, type PromptRef } from "@tui/component/prompt"
import { StatusBar } from "@tui/component/status-bar"
import { Spinner } from "@tui/component/spinner"
import { SplitBorder } from "@tui/component/border"
import { Toast, useToast } from "@tui/ui/toast"
import { useProject } from "@tui/context/project"
import { errorMessage } from "@/util/error"

export function NewSession() {
  const route = useRouteData("new-session")
  const { navigate } = useRoute()
  const sync = useSync()
  const sdk = useSDK()
  const toast = useToast()
  const project = useProject()
  const local = useLocal()
  const { theme } = useTheme()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const [error, setError] = createSignal<string>()
  let started = false

  const agentColor = createMemo(() => {
    if (route.agent === "plan") return theme.accent
    return local.agent.color(route.agent)
  })

  createEffect(() => {
    if (started) return
    if (!sync.ready) return
    started = true

    void (async () => {
      const res = await sdk.client.session.create({
        workspace: route.workspaceID,
        agent: route.agent,
        model: {
          providerID: route.model.providerID,
          id: route.model.modelID,
          variant: route.variant,
        },
      })
      if (res.error || !res.data) {
        setError(errorMessage(res.error ?? "Failed to create session"))
        toast.show({ variant: "error", message: errorMessage(res.error) })
        navigate({ type: "home" })
        return
      }
      await project.workspace.sync().catch(() => {})
      navigate({
        type: "session",
        sessionID: res.data.id,
        prompt: {
          input: route.message,
          parts: route.parts ?? [],
          mode: route.mode ?? "normal",
        },
      })
    })()
  })

  onCleanup(() => {})

  return (
    <box flexGrow={1} paddingLeft={2} paddingRight={2} gap={1}>
      <box flexGrow={1} minHeight={0} />
      <Show when={error()} fallback={
        <box width="100%" maxWidth={75} flexShrink={0}>
          <box
            border={["left"]}
            borderColor={agentColor()}
            customBorderChars={SplitBorder.customBorderChars}
          >
            <box paddingLeft={2} paddingTop={1} paddingBottom={1} backgroundColor={theme.backgroundPanel}>
              <text fg={theme.text}>{route.message}</text>
            </box>
          </box>
          <box flexDirection="row" gap={1} marginTop={1} alignItems="center">
            <Spinner />
            <text fg={theme.textMuted}>Creating session...</text>
          </box>
        </box>
      }>
        <text fg={theme.error}>{error()}</text>
      </Show>
      <box width="100%" maxWidth={75} flexShrink={0} opacity={0}>
        <Prompt ref={setRef} disabled workspaceID={route.workspaceID} />
      </box>
      <box flexGrow={1} />
      <box flexDirection="row" justifyContent="space-between" paddingBottom={1}>
        <StatusBar />
      </box>
      <Toast />
    </box>
  )
}
''')

# patch route.tsx
route_path = TUI / "context/route.tsx"
rt = route_path.read_text(encoding="utf-8")
if "NewSessionRoute" not in rt:
    rt = rt.replace(
        "export type SessionRoute = {",
        """export type NewSessionRoute = {
  type: "new-session"
  message: string
  agent: string
  model: { providerID: string; modelID: string }
  variant?: string
  workspaceID?: string
  parts?: PromptInfo["parts"]
  mode?: PromptInfo["mode"]
}

export type SessionRoute = {""",
    )
    rt = rt.replace(
        'export type Route = HomeRoute | SessionRoute | PluginRoute',
        'export type Route = HomeRoute | NewSessionRoute | SessionRoute | PluginRoute',
    )
    route_path.write_text(rt, encoding="utf-8")
    print("patch route.tsx")

print("batch 2 done")
