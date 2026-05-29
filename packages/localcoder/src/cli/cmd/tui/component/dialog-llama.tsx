import type { LlamaServerStatus } from "@tui/llama-server"
import { createMemo, createSignal } from "solid-js"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useToast } from "@tui/ui/toast"
import { useSync } from "@tui/context/sync"
import { useLocal } from "@tui/context/local"
import { useDialog } from "@tui/ui/dialog"
import * as LlamaServer from "@tui/llama-server"
import * as LlamaSetup from "@tui/llamacpp-setup"
import * as Bootstrap from "@/llamacpp/bootstrap"
import { DialogAlert } from "@tui/ui/dialog-alert"
import { DialogLlamaConnect } from "./dialog-llama-setup"

export function DialogLlama() {
  const toast = useToast()
  const sync = useSync()
  const local = useLocal()
  const dialog = useDialog()
  const [loading, setLoading] = createSignal(false)
  const [status, setStatus] = createSignal<LlamaServerStatus | undefined>()

  const refresh = () => {
    void LlamaServer.status().then(setStatus)
  }
  refresh()

  const cfg = createMemo(() => LlamaServer.getConfig())
  const mtp = createMemo(() => (cfg().modelPath ? LlamaSetup.modelUsesMtp(cfg().modelPath) : false))
  const statusText = createMemo(() => {
    const s = status()
    if (!s) return "Checking..."
    if (s.running) return `Running · ${s.modelId ?? "unknown model"}${s.managed ? " (managed)" : ""}`
    return "Not running"
  })

  async function afterStart(modelId: string) {
    process.env.LLAMACPP_API_URL = cfg().apiUrl
    await sync.bootstrap({ fatal: false }).catch(() => undefined)
    local.model.set({ providerID: "llamacpp", modelID: modelId }, { recent: true })
    toast.show({
      message: `llama.cpp ready — model ${modelId}`,
      variant: "success",
      duration: 6000,
    })
    refresh()
    dialog.clear()
  }

  return (
    <DialogSelect
      title="llama.cpp"
      options={[
        {
          title: "Start server",
          value: "start",
          description: cfg().modelPath
            ? `Load ${cfg().modelPath.split(/[/\\]/).pop()} · ctx ${cfg().ctx}${mtp() ? " · MTP" : ""}`
            : "Set model path in ~/.localcoder/llamacpp.json or LOCALCODER_LLAMACPP_MODEL",
          disabled: loading() || status()?.running === true,
        },
        {
          title: "Stop managed server",
          value: "stop",
          description: "Only stops a server started by /llama in this TUI session",
          disabled: loading() || !status()?.managed,
        },
        {
          title: "Set up folder, model & context",
          value: "wizard",
          description: "Interactive wizard — llama.cpp path, GGUF, context size",
        },
        {
          title: "Setup guide",
          value: "setup",
          description: "Paths, env vars, and ~/.localcoder/llamacpp.json",
        },
        {
          title: "Save and configure provider",
          value: "save",
          description: "Persist llama dir + model to user config",
          disabled: !cfg().modelPath,
        },
        {
          title: "Refresh status",
          value: "refresh",
          description: statusText(),
        },
        {
          title: "View log path",
          value: "log",
          description: status()?.logPath ?? "No log until started from here",
          disabled: !status()?.logPath,
        },
      ]}
      onSelect={(option) => {
        void (async () => {
          if (option.value === "wizard") {
            dialog.replace(() => <DialogLlamaConnect />)
            return
          }
          if (option.value === "setup") {
            await DialogAlert.show(dialog, "llama.cpp setup", LlamaSetup.setupHint())
            return
          }
          if (option.value === "save") {
            await Bootstrap.configure({
              llamaDir: cfg().llamaDir,
              modelPath: cfg().modelPath,
              autoStart: false,
              ctx: cfg().ctx,
            })
            toast.show({ message: `Saved provider config`, variant: "success" })
            return
          }
          if (option.value === "refresh") {
            refresh()
            return
          }
          if (option.value === "log" && status()?.logPath) {
            await DialogAlert.show(dialog, "llama-server log", status()!.logPath!)
            return
          }
          if (option.value === "stop") {
            LlamaServer.stopIfManaged()
            toast.show({ message: "llama-server stopped", variant: "info" })
            refresh()
            return
          }
          if (option.value === "start") {
            setLoading(true)
            try {
              const result = await Bootstrap.configure({
                llamaDir: cfg().llamaDir,
                modelPath: cfg().modelPath,
                autoStart: true,
                ctx: cfg().ctx,
              })
              await afterStart(result.modelId!)
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              toast.show({ message, variant: "error", duration: 8000 })
              if (LlamaServer.getLogPath()) {
                await DialogAlert.show(dialog, "llama-server error", `${message}\n\nLog: ${LlamaServer.getLogPath()}`)
              }
            } finally {
              setLoading(false)
            }
          }
        })()
      }}
    />
  )
}

