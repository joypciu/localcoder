from pathlib import Path

PKG = Path(r"P:\localcoder\packages\localcoder")
SCRIPTS = Path(r"P:\localcoder\scripts")

# 1. input-shortcuts.tsx
(PKG / "src/cli/cmd/tui/component/input-shortcuts.tsx").write_text('''import { TextAttributes } from "@opentui/core"
import { Show } from "solid-js"
import { useTheme } from "@tui/context/theme"

/** On-screen reminder of rich input / mouse shortcuts. */
export function InputShortcuts(props: { compact?: boolean }) {
  const { theme } = useTheme()
  const full =
    "Shift+Enter newline · drag to select · release copies · right-click menu · middle-click paste · Ctrl+C/X in prompt"
  const short = "Shift+Enter · drag select · RMB menu · MMB paste"
  return (
    <Show when={!props.compact}>
      <text fg={theme.textMuted} attributes={TextAttributes.DIM} wrapMode="word">
        {full}
      </text>
    </Show>
  )
}

export function InputShortcutsInline() {
  const { theme } = useTheme()
  return (
    <text fg={theme.textMuted} attributes={TextAttributes.DIM}>
      Shift+Enter · select · RMB · MMB paste
    </text>
  )
}
''', encoding='utf-8')
print("input-shortcuts")

# 2. session-context-menu.tsx
(PKG / "src/cli/cmd/tui/routes/session/session-context-menu.tsx").write_text('''import { useRenderer } from "@opentui/solid"
import { DialogSelect } from "@tui/ui/dialog-select"
import type { useDialog } from "@tui/ui/dialog"
import type { PromptRef } from "@tui/component/prompt"
import * as Clipboard from "@tui/util/clipboard"
import * as Selection from "@tui/util/selection"
import type { useToast } from "@tui/ui/toast"

export function openSessionContextMenu(input: {
  dialog: ReturnType<typeof useDialog>
  toast: ReturnType<typeof useToast>
  prompt?: PromptRef
}) {
  const renderer = useRenderer()
  const selected = Selection.selectedText(renderer)

  input.dialog.replace(() => (
    <DialogSelect
      title="Text actions"
      options={[
        {
          title: "Copy selection",
          value: "copy" as const,
          description: selected ? `${selected.length} characters selected` : "Select text with the mouse first",
          disabled: !selected,
        },
        {
          title: "Paste into prompt",
          value: "paste" as const,
          description: "Insert clipboard at the prompt cursor",
        },
        {
          title: "Cut selection to prompt",
          value: "cut" as const,
          description: selected ? "Copy selection, then replace the prompt" : "Select text first",
          disabled: !selected,
        },
      ]}
      onSelect={(option) => {
        void (async () => {
          if (option.value === "copy" && selected) {
            await Clipboard.copy(selected)
            input.toast.show({ message: "Copied to clipboard", variant: "info" })
            renderer.clearSelection()
          }
          if (option.value === "paste") {
            const content = await Clipboard.read()
            if (content?.mime === "text/plain" && content.data) {
              input.prompt?.append(content.data)
              input.prompt?.focus()
              input.toast.show({ message: "Pasted into prompt", variant: "info" })
            } else {
              input.toast.show({ message: "No text in clipboard", variant: "warning" })
            }
          }
          if (option.value === "cut" && selected) {
            await Clipboard.copy(selected)
            input.prompt?.set({ input: selected, parts: [] })
            input.prompt?.focus()
            renderer.clearSelection()
            input.toast.show({ message: "Cut to prompt", variant: "info" })
          }
          input.dialog.clear()
        })()
      }}
    />
  ))
}
''', encoding='utf-8')
print("session-context-menu")

# 3. session-mouse.ts helpers
(PKG / "src/cli/cmd/tui/routes/session/session-mouse.ts").write_text('''import { MouseButton, type MouseEvent } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import type { PromptRef } from "@tui/component/prompt"
import * as Clipboard from "@tui/util/clipboard"
import * as Selection from "@tui/util/selection"
import type { useToast } from "@tui/ui/toast"
import type { useDialog } from "@tui/ui/dialog"
import { openSessionContextMenu } from "./session-context-menu"

export function createSessionMouseHandlers(input: {
  dialog: ReturnType<typeof useDialog>
  toast: ReturnType<typeof useToast>
  getPrompt: () => PromptRef | undefined
}) {
  const renderer = useRenderer()

  async function pasteIntoPrompt() {
    const content = await Clipboard.read()
    if (content?.mime === "text/plain" && content.data) {
      input.getPrompt()?.append(content.data)
      input.getPrompt()?.focus()
      input.toast.show({ message: "Pasted into prompt", variant: "info" })
      return true
    }
    return false
  }

  return {
    async onMouseDown(evt: MouseEvent) {
      if (evt.button === MouseButton.MIDDLE) {
        evt.preventDefault()
        await pasteIntoPrompt()
        return
      }
      if (evt.button === MouseButton.RIGHT) {
        evt.preventDefault()
        if (Selection.selectedText(renderer)) {
          await Clipboard.copy(Selection.selectedText(renderer)!)
          input.toast.show({ message: "Copied to clipboard", variant: "info" })
          renderer.clearSelection()
          return
        }
        openSessionContextMenu({
          dialog: input.dialog,
          toast: input.toast,
          prompt: input.getPrompt(),
        })
      }
    },
    async onMouseUp(evt: MouseEvent) {
      if (evt.button !== MouseButton.LEFT) return
      const text = Selection.selectedText(renderer)
      if (!text) return
      await Clipboard.copy(text)
      input.toast.show({ message: "Copied to clipboard", variant: "info" })
    },
  }
}
''', encoding='utf-8')
print("session-mouse")

# 4. Patch prompt - append + InputShortcutsInline
p = PKG / "src/cli/cmd/tui/component/prompt/index.tsx"
pt = p.read_text(encoding="utf-8")
if "append(text" not in pt:
    pt = pt.replace(
        'import { StatusBar } from "@tui/component/status-bar"',
        'import { StatusBar } from "@tui/component/status-bar"\nimport { InputShortcutsInline } from "@tui/component/input-shortcuts"',
    )
    pt = pt.replace(
        """    submit() {
      void submit()
    },
  }""",
        """    append(text: string) {
      if (!text) return
      input.insertText(text)
      setStore("prompt", "input", input.plainText)
    },
    submit() {
      void submit()
    },
  }""",
    )
    pt = pt.replace(
        """              <box flexDirection="row" flexShrink={0} paddingTop={1} gap={1} justifyContent="space-between">
              <box flexDirection="row" gap={1} alignItems="center">
                <StatusBar mode={store.mode} />""",
        """              <box flexDirection="column" flexShrink={0} paddingTop={1} gap={0}>
                <box flexDirection="row" gap={1} justifyContent="space-between" alignItems="center">
              <box flexDirection="row" gap={1} alignItems="center">
                <StatusBar mode={store.mode} />""",
    )
    pt = pt.replace(
        """              <Show when={hasRightContent()}>
                <box flexDirection="row" gap={1} alignItems="center">
                  {props.right}
                </box>
              </Show>
            </box>""",
        """              <Show when={hasRightContent()}>
                <box flexDirection="row" gap={1} alignItems="center">
                  {props.right}
                </box>
              </Show>
            </box>
                <InputShortcutsInline />
              </box>""",
    )
    p.write_text(pt, encoding="utf-8")
    print("prompt patched")

# 5. Patch footer
f = PKG / "src/cli/cmd/tui/routes/session/footer.tsx"
ft = f.read_text(encoding="utf-8")
if "InputShortcutsInline" not in ft:
    ft = ft.replace(
        'import { StatusBar } from "@tui/component/status-bar"',
        'import { StatusBar } from "@tui/component/status-bar"\nimport { InputShortcutsInline } from "@tui/component/input-shortcuts"',
    )
    ft = ft.replace(
        """  return (
    <box flexDirection="row" justifyContent="space-between" gap={1} flexShrink={0}>
      <text fg={theme.textMuted}>{directory()}</text>""",
        """  return (
    <box flexDirection="column" gap={0} flexShrink={0}>
    <box flexDirection="row" justifyContent="space-between" gap={1} flexShrink={0}>
      <text fg={theme.textMuted}>{directory()}</text>""",
    )
    ft = ft.replace(
        """    </box>
  )
}""",
        """    </box>
    <InputShortcutsInline />
    </box>
  )
}""",
    )
    f.write_text(ft, encoding="utf-8")
    print("footer patched")

# 6. Patch session index - mouse handlers
idx = PKG / "src/cli/cmd/tui/routes/session/index.tsx"
it = idx.read_text(encoding="utf-8")
if "createSessionMouseHandlers" not in it:
    it = it.replace(
        'import { Footer } from "./footer"',
        'import { Footer } from "./footer"\nimport { createSessionMouseHandlers } from "./session-mouse"',
    )
    it = it.replace(
        "  const toast = useToast()",
        "  const toast = useToast()\n  const dialog = useDialog()",
    )
    if "const dialog = useDialog()" in it and it.count("const dialog = useDialog()") > 1:
        # remove duplicate if exists
        pass
    # check if dialog already imported
    if "useDialog" not in it.split("createSessionMouseHandlers")[0][-500:]:
        if 'import { useDialog }' not in it:
            it = it.replace(
                'import { useToast } from "../../ui/toast"',
                'import { useToast } from "../../ui/toast"\nimport { useDialog } from "@tui/ui/dialog"',
            )
    it = it.replace(
        "  let prompt: PromptRef | undefined",
        """  const sessionMouse = createSessionMouseHandlers({
    dialog,
    toast,
    getPrompt: () => prompt,
  })
  let prompt: PromptRef | undefined""",
    )
    it = it.replace(
        """            <scrollbox
              ref={(r) => (scroll = r)}
              viewportOptions={{""",
        """            <scrollbox
              ref={(r) => (scroll = r)}
              onMouseDown={(evt) => void sessionMouse.onMouseDown(evt)}
              onMouseUp={(evt) => void sessionMouse.onMouseUp(evt)}
              viewportOptions={{""",
    )
    idx.write_text(it, encoding="utf-8")
    print("session index patched")

# 7. PromptRef type - add append
# check types in prompt - PromptRef export type
pt = p.read_text(encoding="utf-8")
if "append:" not in pt.split("export type PromptRef")[1][:300]:
    pt = pt.replace(
        """export type PromptRef = {
  focused: boolean
  current: PromptInfo
  focus(): void
  blur(): void
  set(prompt: PromptInfo): void
  reset(): void
  submit(): void
}""",
        """export type PromptRef = {
  focused: boolean
  current: PromptInfo
  focus(): void
  blur(): void
  set(prompt: PromptInfo): void
  append(text: string): void
  reset(): void
  submit(): void
}""",
    )
    p.write_text(pt, encoding="utf-8")
    print("PromptRef type")

# 8. E2E script
model = r"P:\gguf models\Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled.IQ4_XS.gguf"
llama = r"P:\llama cpp\llama-b9284-bin-win-cuda-13.1-x64"
(SCRIPTS / "e2e-llamacpp.ts").write_text(f'''#!/usr/bin/env bun
/**
 * E2E: start llama-server with local GGUF, verify OpenAI API, run one LocalCoder session prompt.
 *
 * Usage:
 *   bun run scripts/e2e-llamacpp.ts
 */
import {{ spawn }} from "child_process"
import path from "path"
import fs from "fs"

const LLAMA_DIR = {repr(llama)}
const MODEL_PATH = {repr(model)}
const SERVER_EXE = path.join(LLAMA_DIR, "llama-server.exe")
const API_URL = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"
const PORT = Number(new URL(API_URL).port || 8080)
const CTX = Number(process.env.LLAMACPP_CTX ?? 8192)

function log(msg: string) {{
  console.log(`[e2e-llamacpp] ${{msg}}`)
}}

async function waitForServer(timeoutMs = 600_000) {{
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {{
    try {{
      const res = await fetch(`${{API_URL}}/models`, {{ signal: AbortSignal.timeout(5000) }})
      if (res.ok) {{
        const data = (await res.json()) as {{ data?: Array<{{ id: string }}> }}
        if (data.data?.length) return data.data[0]!.id
      }}
    }} catch {{}}
    await Bun.sleep(2000)
  }}
  throw new Error("llama-server did not become ready in time")
}}

async function chat(modelId: string) {{
  const res = await fetch(`${{API_URL}}/chat/completions`, {{
    method: "POST",
    headers: {{ "Content-Type": "application/json" }},
    body: JSON.stringify({{
      model: modelId,
      messages: [{{ role: "user", content: "Reply with exactly the word: pong" }}],
      max_tokens: 32,
      temperature: 0,
    }}),
    signal: AbortSignal.timeout(120_000),
  }})
  if (!res.ok) throw new Error(`chat failed: ${{res.status}} ${{await res.text()}}`)
  const json = (await res.json()) as {{
    choices?: Array<{{ message?: {{ content?: string }} }}>
  }}
  const text = json.choices?.[0]?.message?.content ?? ""
  log(`model reply: ${{text.slice(0, 200)}}`)
  if (!/pong/i.test(text)) throw new Error(`expected pong in reply, got: ${{text}}`)
}}

async function runLocalcoderPrompt(modelId: string) {{
  process.env.LLAMACPP_API_URL = API_URL
  const root = path.resolve(import.meta.dir, "..")
  const proc = Bun.spawn(
    ["bun", "test", "test/session/prompt-llamacpp-e2e.test.ts", "--timeout", "180000"],
    {{
      cwd: path.join(root, "packages", "localcoder"),
      env: {{
        ...process.env,
        LLAMACPP_API_URL: API_URL,
        LLAMACPP_MODEL_ID: modelId,
      }},
      stdout: "inherit",
      stderr: "inherit",
    }},
  )
  const code = await proc.exited
  if (code !== 0) throw new Error(`localcoder prompt e2e exited with ${{code}}`)
}}

async function main() {{
  if (!fs.existsSync(SERVER_EXE)) throw new Error(`missing ${{SERVER_EXE}}`)
  if (!fs.existsSync(MODEL_PATH)) throw new Error(`missing ${{MODEL_PATH}}`)

  log("starting llama-server (model load may take several minutes)...")
  const server = spawn(
    SERVER_EXE,
    ["-m", MODEL_PATH, "--host", "127.0.0.1", "--port", String(PORT), "-c", String(CTX), "-ngl", "99"],
    {{ cwd: LLAMA_DIR, stdio: ["ignore", "pipe", "pipe"] }},
  )
  server.stdout?.on("data", (d) => process.stdout.write(d))
  server.stderr?.on("data", (d) => process.stderr.write(d))

  const cleanup = () => {{
    try {{ server.kill() }} catch {{}}
  }}
  process.on("exit", cleanup)
  process.on("SIGINT", () => {{ cleanup(); process.exit(130) }})

  try {{
    const modelId = await waitForServer()
    log(`server ready, model id: ${{modelId}}`)
    await chat(modelId)
    log("chat/completions OK")
    await runLocalcoderPrompt(modelId)
    log("localcoder session prompt e2e OK")
    log("ALL PASSED")
  }} finally {{
    cleanup()
  }}
}}

main().catch((err) => {{
  console.error(err)
  process.exit(1)
}})
''', encoding='utf-8')

# 9. prompt-llamacpp-e2e.test.ts - minimal live test
(PKG / "test/session/prompt-llamacpp-e2e.test.ts").write_text('''import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { SessionPrompt } from "../../src/session/prompt"
import { Session } from "@/session/session"
import { Provider as ProviderSvc } from "@/provider/provider"
import { Agent as AgentSvc } from "../../src/agent/agent"
import { Config } from "@/config/config"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { SessionID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"
import { CrossSpawnSpawner } from "@localcoder-ai/core/cross-spawn-spawner"
import { AppFileSystem } from "@localcoder-ai/core/filesystem"
import { provideTmpdirInstance } from "../fixture/fixture"

const apiUrl = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"
const modelId = process.env.LLAMACPP_MODEL_ID

const it = testEffect(
  Layer.mergeAll(CrossSpawnSpawner.defaultLayer, AppFileSystem.defaultLayer, AgentSvc.defaultLayer),
)

describe("session/prompt llamacpp e2e", () => {
  it.live.skipIf(!modelId)("runs one prompt against llama.cpp", () =>
    provideTmpdirInstance({
      fn: () =>
        Effect.gen(function* () {
          const session = yield* Session.create({ title: "llamacpp-e2e" })
          const providerID = ProviderID.make("llamacpp")
          const mid = ModelID.make(modelId!)
          yield* SessionPrompt.prompt({
            sessionID: session.id,
            agent: "build",
            model: { providerID, modelID: mid },
            parts: [{ type: "text", text: "Say pong only." }],
          })
          const messages = yield* Session.messages({ sessionID: session.id })
          const assistant = messages.filter((m) => m.info.role === "assistant").at(-1)
          expect(assistant).toBeDefined()
        }),
      git: false,
    }),
  )
})
''', encoding='utf-8')
print("e2e files")

# 10. home footer shortcuts - optional patch home
home = PKG / "src/cli/cmd/tui/routes/home.tsx"
ht = home.read_text(encoding="utf-8")
if "InputShortcutsInline" not in ht:
    ht = ht.replace(
        'import { StatusBar } from "@tui/component/status-bar"',
        'import { StatusBar } from "@tui/component/status-bar"\nimport { InputShortcutsInline } from "@tui/component/input-shortcuts"',
    )
    if "<StatusBar />" in ht and "InputShortcutsInline" not in ht:
        ht = ht.replace("<StatusBar />", "<box flexDirection=\"column\" gap={0}><StatusBar /><InputShortcutsInline /></box>", 1)
    home.write_text(ht, encoding="utf-8")
    print("home patched")

print("done")
