import fs from "fs"
import path from "path"
import { createMemo, createSignal, Show } from "solid-js"
import * as Bootstrap from "@/llamacpp/bootstrap"
import * as LlamaSetup from "@/llamacpp/setup"
import { useSync } from "@tui/context/sync"
import { useLocal } from "@tui/context/local"
import { useDialog } from "@tui/ui/dialog"
import { DialogSelect } from "@tui/ui/dialog-select"
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { useToast } from "@tui/ui/toast"
import { useTheme } from "@tui/context/theme"
import * as LlamaServer from "@tui/llama-server"
import type { LlamaServerStatus } from "@tui/llama-server"
import { formatLlamaStatusLine, llamaCtxMismatchHint } from "@tui/util/context-usage"

const LLAMACPP_ID = "llamacpp"

function serverExe(dir: string) {
  return path.join(dir, process.platform === "win32" ? "llama-server.exe" : "llama-server")
}

async function promptDir(
  dialog: ReturnType<typeof useDialog>,
  toast: ReturnType<typeof useToast>,
  defaultDir: string,
  theme: ReturnType<typeof useTheme>["theme"],
) {
  return new Promise<string | null>((resolve) => {
    dialog.replace(
      () => (
        <DialogPrompt
          title="llama.cpp folder"
          placeholder={defaultDir}
          description={() => (
            <text fg={theme.textMuted}>Folder containing llama-server (not the GGUF file)</text>
          )}
          onConfirm={(value) => {
            const dir = (value?.trim() || defaultDir).trim()
            if (!fs.existsSync(serverExe(dir))) {
              toast.show({ message: `llama-server not found in ${dir}`, variant: "error" })
              return
            }
            resolve(dir)
          }}
        />
      ),
      () => resolve(null),
    )
  })
}

async function promptModel(dialog: ReturnType<typeof useDialog>, llamaDir: string, initial?: string) {
  const discovered = LlamaSetup.findGgufFiles(24)
  if (discovered.length > 0) {
    const picked = await new Promise<string | null>((resolve) => {
      dialog.replace(
        () => (
          <DialogSelect
            title="Select GGUF model"
            options={[
              ...discovered.map((p) => ({
                title: path.basename(p),
                value: p,
                description: p,
              })),
              { title: "Enter path manually…", value: "__manual__" },
            ]}
            onSelect={(option) => resolve(option.value === "__manual__" ? null : option.value)}
          />
        ),
        () => resolve(null),
      )
    })
    if (picked) return picked
  }

  return new Promise<string | null>((resolve) => {
    dialog.replace(
      () => (
        <DialogPrompt
          title="Path to .gguf model"
          placeholder={initial ?? "C:\\models\\model.gguf"}
          onConfirm={(value) => {
            const p = value?.trim() ?? ""
            if (!p.toLowerCase().endsWith(".gguf") || !fs.existsSync(p)) {
              resolve(null)
              return
            }
            resolve(p)
          }}
        />
      ),
      () => resolve(null),
    )
  })
}

async function promptCtx(
  dialog: ReturnType<typeof useDialog>,
  modelPath: string,
  theme: ReturnType<typeof useTheme>["theme"],
) {
  const defaultCtx = LlamaSetup.defaultContextSize(modelPath)
  const picked = await new Promise<string | null>((resolve) => {
    dialog.replace(
      () => (
        <DialogSelect
          title="Context size (tokens)"
          options={[
            ...LlamaSetup.CONTEXT_PRESETS.map((n) => ({
              title: String(n),
              value: String(n),
              description: n === defaultCtx ? "saved default" : undefined,
            })),
            { title: "Custom…", value: "custom" },
          ]}
          onSelect={(option) => resolve(option.value)}
        />
      ),
      () => resolve(null),
    )
  })
  if (!picked) return null
  if (picked !== "custom") return Number(picked)

  return new Promise<number | null>((resolve) => {
    dialog.replace(
      () => (
        <DialogPrompt
          title="Custom context size"
          placeholder={String(defaultCtx)}
          description={() => (
            <text fg={theme.textMuted}>Typical: 16384 or 32768. Lower if you run out of VRAM.</text>
          )}
          onConfirm={(value) => {
            const n = Number(value?.trim())
            if (!Number.isInteger(n) || n < 512) {
              resolve(null)
              return
            }
            resolve(n)
          }}
        />
      ),
      () => resolve(null),
    )
  })
}

async function promptThinking(dialog: ReturnType<typeof useDialog>, modelPath: string) {
  if (!LlamaSetup.modelSupportsThinkingToggle(modelPath)) return undefined
  const enabled = LlamaSetup.resolveThinkingEnabled(modelPath)
  const picked = await new Promise<boolean | null>((resolve) => {
    dialog.replace(
      () => (
        <DialogSelect
          title="Thinking / reasoning mode"
          options={[
            { title: "Enabled", value: "on", description: "Recommended for Qwen / Qwopus" },
            { title: "Disabled", value: "off" },
          ]}
          onSelect={(option) => resolve(option.value === "on")}
        />
      ),
      () => resolve(null),
    )
  })
  return picked ?? enabled
}

export function llamaCppIsConfigured() {
  const saved = LlamaSetup.loadUserLlamaConfig()
  return Boolean(saved.llamaDir && saved.modelPath && fs.existsSync(saved.modelPath))
}

export function DialogLlamaConnect() {
  const dialog = useDialog()
  const sync = useSync()
  const local = useLocal()
  const toast = useToast()
  const { theme } = useTheme()
  const [loading, setLoading] = createSignal(false)
  const [serverStatus, setServerStatus] = createSignal<LlamaServerStatus | undefined>()

  const refreshServerStatus = () => {
    void LlamaServer.status().then(setServerStatus)
  }
  refreshServerStatus()

  const saved = createMemo(() => LlamaSetup.loadUserLlamaConfig())
  const loaded = createMemo(() => sync.data.provider.find((p) => p.id === LLAMACPP_ID))
  const connected = createMemo(() => Boolean(loaded() && Object.keys(loaded()!.models).length > 0))

  const statusLine = createMemo(() => {
    const mismatch = llamaCtxMismatchHint(serverStatus())
    if (mismatch) return mismatch
    const cfg = saved()
    if (!cfg.modelPath) return "Not configured — run setup to pick llama.cpp folder and GGUF model"
    const model = path.basename(cfg.modelPath)
    const ctx = cfg.ctx ?? LlamaSetup.defaultContextSize(cfg.modelPath)
    const base = connected() ? `Connected · ${model} · ctx ${ctx}` : `Saved · ${model} · ctx ${ctx} · server not running`
    return formatLlamaStatusLine(serverStatus(), base)
  })

  async function runWizard(startServer: boolean) {
    const cfg = saved()
    const defaultDir = cfg.llamaDir ?? LlamaSetup.resolveLlamaDir()
    const llamaDir = await promptDir(dialog, toast, defaultDir, theme)
    if (!llamaDir) {
      dialog.replace(() => <DialogLlamaConnect />)
      return
    }
    const modelPath = await promptModel(dialog, llamaDir, cfg.modelPath)
    if (!modelPath) {
      dialog.replace(() => <DialogLlamaConnect />)
      return
    }
    const ctx = await promptCtx(dialog, modelPath, theme)
    if (!ctx) {
      dialog.replace(() => <DialogLlamaConnect />)
      return
    }
    const thinking = await promptThinking(dialog, modelPath)

    setLoading(true)
    try {
      const result = await Bootstrap.configure({
        llamaDir,
        modelPath,
        autoStart: startServer,
        ctx,
        thinking,
        forceRestart: startServer,
      })
      process.env.LLAMACPP_API_URL = LlamaServer.getConfig().apiUrl
      await sync.bootstrap({ fatal: false }).catch(() => undefined)
      if (result.modelId) {
        local.model.set({ providerID: LLAMACPP_ID, modelID: result.modelId }, { recent: true })
      }
      toast.show({
        message: startServer ? `llama.cpp ready · ctx ${ctx}` : `Saved llama.cpp config · ctx ${ctx}`,
        variant: "success",
        duration: 6000,
      })
      dialog.clear()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      toast.show({ message, variant: "error", duration: 8000 })
      dialog.replace(() => <DialogLlamaConnect />)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DialogSelect
      title="llama.cpp (local GGUF)"
      options={[
        {
          title: statusLine(),
          value: "status",
          description: "No API key — runs on your GPU via llama-server",
          disabled: true,
          gutter: connected() ? () => <text fg={theme.success}>✓</text> : undefined,
        },
        {
          title: "Set up or change folder, model, context",
          value: "setup",
          description: "Pick llama.cpp install, GGUF file, and context size (4096–131072)",
          disabled: loading(),
        },
        {
          title: "Save current config (don't start server)",
          value: "save",
          description: saved().modelPath
            ? "Re-apply saved llama dir, model, and context to provider config"
            : "Run setup first",
          disabled: loading() || !saved().modelPath,
        },
        {
          title: connected() ? "Restart server with saved config" : "Start server with saved config",
          value: "start",
          description: saved().modelPath
            ? serverStatus()?.ctxMismatch
              ? `Apply saved ctx ${saved().ctx ?? LlamaSetup.defaultContextSize(saved().modelPath!)} (server may be on old -c)`
              : undefined
            : "Run setup first",
          disabled: loading() || !saved().modelPath,
        },
      ]}
      onSelect={(option) => {
        void (async () => {
          if (option.value === "setup") await runWizard(true)
          if (option.value === "save") {
            setLoading(true)
            try {
              const cfg = saved()
              await Bootstrap.configure({
                llamaDir: cfg.llamaDir ?? LlamaSetup.resolveLlamaDir(),
                modelPath: cfg.modelPath!,
                autoStart: false,
                ctx: cfg.ctx,
                thinking: cfg.thinking,
              })
              process.env.LLAMACPP_API_URL = LlamaServer.getConfig().apiUrl
              await sync.bootstrap({ fatal: false }).catch(() => undefined)
              toast.show({ message: "Saved llama.cpp config", variant: "success" })
              dialog.clear()
            } catch (err) {
              toast.show({
                message: err instanceof Error ? err.message : String(err),
                variant: "error",
                duration: 8000,
              })
            } finally {
              setLoading(false)
            }
          }
          if (option.value === "start") {
            setLoading(true)
            try {
              const cfg = saved()
              const result = await Bootstrap.configure({
                llamaDir: cfg.llamaDir ?? LlamaSetup.resolveLlamaDir(),
                modelPath: cfg.modelPath!,
                autoStart: true,
                ctx: cfg.ctx,
                thinking: cfg.thinking,
                forceRestart: true,
              })
              process.env.LLAMACPP_API_URL = LlamaServer.getConfig().apiUrl
              await sync.bootstrap({ fatal: false }).catch(() => undefined)
              if (result.modelId) {
                local.model.set({ providerID: LLAMACPP_ID, modelID: result.modelId }, { recent: true })
              }
              toast.show({ message: "llama.cpp server started", variant: "success" })
              dialog.clear()
            } catch (err) {
              toast.show({
                message: err instanceof Error ? err.message : String(err),
                variant: "error",
              })
            } finally {
              setLoading(false)
            }
          }
        })()
      }}
    />
  )
}

export function DialogLlamaSetup() {
  return <DialogLlamaConnect />
}
