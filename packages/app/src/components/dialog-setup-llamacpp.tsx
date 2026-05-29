import { Button } from "@localcoder-ai/ui/button"
import { useDialog } from "@localcoder-ai/ui/context/dialog"
import { Dialog } from "@localcoder-ai/ui/dialog"
import { IconButton } from "@localcoder-ai/ui/icon-button"
import { List } from "@localcoder-ai/ui/list"
import { showToast } from "@localcoder-ai/ui/toast"
import { Switch } from "@localcoder-ai/ui/switch"
import { TextField } from "@localcoder-ai/ui/text-field"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { useParams } from "@solidjs/router"
import { createEffect, createMemo, createSignal, Show } from "solid-js"
import { decode64 } from "@/utils/base64"
import { useGlobalSDK } from "@/context/global-sdk"
import { useLanguage } from "@/context/language"
import { useLocal } from "@/context/local"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import {
  getLlamaCppStatus,
  setLlamaCppThinking,
  setupLlamaCpp,
  startLlamaCpp,
  stopLlamaCpp,
} from "@/utils/llamacpp-api"
import { llamaModelBasename, refreshLlamaProviders, waitForLlamaProvider } from "@/utils/llamacpp-sync"
import { DialogSelectProvider } from "./dialog-select-provider"

type Props = {
  back?: "providers" | "close"
  onReady?: () => void
}

function useOptionalLocal() {
  try {
    return useLocal()
  } catch {
    return undefined
  }
}

export function DialogSetupLlamacpp(props: Props) {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const globalSDK = useGlobalSDK()
  const queryClient = useQueryClient()
  const params = useParams()
  const local = useOptionalLocal()

  const projectDir = createMemo(() => {
    const raw = params.dir
    if (!raw) return undefined
    try {
      return decode64(raw) || undefined
    } catch {
      return undefined
    }
  })

  const http = createMemo(() => server.current?.http)
  const canPick = createMemo(() => Boolean(platform.openDirectoryPickerDialog && platform.openFilePickerDialog && server.isLocal()))

  const [llamaDir, setLlamaDir] = createSignal("")
  const [modelPath, setModelPath] = createSignal("")
  const [ctx, setCtx] = createSignal(16384)
  const [thinking, setThinking] = createSignal(false)

  const statusQuery = useQuery(() => ({
    queryKey: ["llamacpp-status", http()?.url],
    enabled: Boolean(http()),
    refetchInterval: false,
    queryFn: async () => getLlamaCppStatus(http()!),
  }))

  createEffect(() => {
    const data = statusQuery.data
    if (!data) return
    if (!llamaDir()) setLlamaDir(data.llamaDir ?? "")
    if (!modelPath()) setModelPath(data.modelPath ?? "")
    if (data.ctx) setCtx(data.ctx)
    if (data.thinking !== undefined) setThinking(data.thinking)
  })

  const thinkingSupported = createMemo(() => {
    const name = modelPath().split(/[/\\]/).pop()?.toLowerCase() ?? ""
    return /qwopus|qwen3(?:\.5|-)/i.test(name)
  })

  const pathsReady = createMemo(() => Boolean(llamaDir().trim() && modelPath().trim()))
  const isRunning = createMemo(() => Boolean(statusQuery.data?.running))
  const isManaged = createMemo(() => Boolean(statusQuery.data?.managed))
  const pathsMatchSaved = createMemo(() => {
    const data = statusQuery.data
    if (!data) return false
    return data.llamaDir === llamaDir().trim() && data.modelPath === modelPath().trim()
  })

  const goBack = () => {
    if (props.back === "close") {
      dialog.close()
      return
    }
    dialog.show(() => <DialogSelectProvider />)
  }

  const pickLlamaDir = async () => {
    const picked = await platform.openDirectoryPickerDialog?.({
      title: language.t("dialog.llamacpp.pickLlamaDir"),
    })
    if (typeof picked === "string" && picked) setLlamaDir(picked)
  }

  const pickModel = async () => {
    const picked = await platform.openFilePickerDialog?.({
      title: language.t("dialog.llamacpp.pickModel"),
      extensions: ["gguf"],
    })
    if (typeof picked === "string" && picked) setModelPath(picked)
  }

  const refreshStatus = async () => {
    await queryClient.invalidateQueries({ queryKey: ["llamacpp-status"] })
    await statusQuery.refetch()
  }

  const activateModel = async (modelId: string) => {
    const resolved = await waitForLlamaProvider({
      globalSDK,
      queryClient,
      modelId,
      directory: projectDir(),
    })
    if (!resolved) {
      showToast({
        variant: "error",
        title: language.t("dialog.llamacpp.toast.providerPending.title"),
        description: language.t("dialog.llamacpp.toast.providerPending.description"),
      })
      return false
    }
    local?.model.set({ providerID: "llamacpp", modelID: resolved }, { recent: true })
    return true
  }

  const onReady = async (model: string, close = true) => {
    await activateModel(model)
    showToast({
      variant: "success",
      icon: "circle-check",
      title: language.t("dialog.llamacpp.toast.ready.title"),
      description: language.t("dialog.llamacpp.toast.ready.description", {
        model: llamaModelBasename(model),
      }),
    })
    props.onReady?.()
    if (close) dialog.close()
  }

  const setupMutation = useMutation(() => ({
    mutationFn: async () => {
      const conn = http()
      if (!conn) throw new Error(language.t("error.globalSDK.noServerAvailable"))
      return setupLlamaCpp(conn, {
        llamaDir: llamaDir().trim(),
        modelPath: modelPath().trim(),
        autoStart: true,
        ctx: ctx(),
        thinking: thinkingSupported() ? thinking() : undefined,
        forceRestart: isRunning(),
      })
    },
    onSuccess: async (result) => {
      await refreshStatus()
      await activateModel(result.modelId ?? result.model)
      showToast({
        variant: "success",
        title: language.t("dialog.llamacpp.toast.saved.title"),
        description: language.t("dialog.llamacpp.toast.saved.description"),
      })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    },
  }))

  const startMutation = useMutation(() => ({
    mutationFn: async () => {
      const conn = http()
      if (!conn) throw new Error(language.t("error.globalSDK.noServerAvailable"))
      if (pathsMatchSaved()) return startLlamaCpp(conn)
      return setupLlamaCpp(conn, {
        llamaDir: llamaDir().trim(),
        modelPath: modelPath().trim(),
        autoStart: true,
        ctx: ctx(),
        thinking: thinkingSupported() ? thinking() : undefined,
        forceRestart: isRunning(),
      })
    },
    onSuccess: async (result) => {
      await refreshStatus()
      await onReady(result.modelId ?? result.model ?? "model", true)
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    },
  }))

  const stopMutation = useMutation(() => ({
    mutationFn: async () => {
      const conn = http()
      if (!conn) throw new Error(language.t("error.globalSDK.noServerAvailable"))
      return stopLlamaCpp(conn)
    },
    onSuccess: async (result) => {
      await refreshStatus()
      await refreshLlamaProviders({ globalSDK, queryClient, directory: projectDir() })
      const latest = await statusQuery.refetch()
      if (!result.stopped && latest.data?.running) {
        showToast({
          variant: "error",
          title: language.t("dialog.llamacpp.toast.stopExternal.title"),
          description: language.t("dialog.llamacpp.toast.stopExternal.description"),
        })
        return
      }
      showToast({
        variant: "success",
        title: language.t("dialog.llamacpp.toast.stopped.title"),
        description: language.t("dialog.llamacpp.toast.stopped.description"),
      })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    },
  }))

  const statusLine = createMemo(() => {
    const data = statusQuery.data
    if (!data) return language.t("dialog.llamacpp.status.checking")
    if (data.running) {
      const model = data.modelId ?? llamaModelBasename(modelPath()) ?? "unknown"
      if (data.managed) return language.t("dialog.llamacpp.status.runningManaged", { model })
      return language.t("dialog.llamacpp.status.runningExternal", { model })
    }
    return language.t("dialog.llamacpp.status.stopped")
  })

  const primaryLabel = createMemo(() => {
    if (setupMutation.isPending || startMutation.isPending) return language.t("dialog.llamacpp.action.starting")
    if (isRunning()) return language.t("dialog.llamacpp.action.save")
    if (pathsMatchSaved()) return language.t("dialog.llamacpp.action.start")
    return language.t("dialog.llamacpp.action.setup")
  })

  const discovered = createMemo(() => statusQuery.data?.discoveredModels ?? [])
  const busy = () => setupMutation.isPending || startMutation.isPending || stopMutation.isPending
  const canStop = createMemo(() => isRunning() && isManaged())

  const runPrimary = () => {
    if (isRunning()) {
      setupMutation.mutate()
      return
    }
    startMutation.mutate()
  }

  return (
    <Dialog
      title={language.t("dialog.llamacpp.title")}
      description={language.t("dialog.llamacpp.description")}
      transition
      size="large"
    >
      <div class="flex flex-col gap-4 px-4 pb-4 max-w-lg overflow-y-auto max-h-full">
        <p class="text-13-regular text-text-weak leading-normal">{statusLine()}</p>

        <TextField
          label={language.t("dialog.llamacpp.field.llamaDir")}
          value={llamaDir()}
          onInput={(e) => setLlamaDir(e.currentTarget.value)}
          placeholder={language.t("dialog.llamacpp.field.llamaDir.placeholder")}
        />
        <Show when={canPick()}>
          <Button size="small" variant="secondary" onClick={() => void pickLlamaDir()}>
            {language.t("dialog.llamacpp.action.browseLlamaDir")}
          </Button>
        </Show>

        <TextField
          label={language.t("dialog.llamacpp.field.modelPath")}
          value={modelPath()}
          onInput={(e) => setModelPath(e.currentTarget.value)}
          placeholder={language.t("dialog.llamacpp.field.modelPath.placeholder")}
        />
        <Show when={canPick()}>
          <Button size="small" variant="secondary" onClick={() => void pickModel()}>
            {language.t("dialog.llamacpp.action.browseModel")}
          </Button>
        </Show>

        <TextField
          label={language.t("dialog.llamacpp.field.ctx", { defaultValue: "Context size (tokens)" })}
          type="number"
          value={String(ctx())}
          onInput={(e) => {
            const n = Number(e.currentTarget.value)
            if (Number.isInteger(n) && n >= 512) setCtx(n)
          }}
          placeholder="16384"
        />
        <div class="flex flex-wrap gap-1.5 -mt-1">
          {[4096, 8192, 16384, 32768, 65536].map((preset) => (
            <Button
              size="small"
              variant={ctx() === preset ? "primary" : "secondary"}
              onClick={() => setCtx(preset)}
            >
              {preset.toLocaleString()}
            </Button>
          ))}
        </div>
        <p class="text-12-regular text-text-weak -mt-2">
          {language.t("dialog.llamacpp.field.ctx.description", {
            defaultValue: "4096–131072 typical. Lower if you run out of VRAM.",
          })}
        </p>

        <Show when={thinkingSupported()}>
          <Switch
            checked={thinking()}
            onChange={(v) => {
              setThinking(v)
              const conn = http()
              if (conn && statusQuery.data?.running) {
                void setLlamaCppThinking(conn, v)
                  .then(() => waitForLlamaProvider({ globalSDK, queryClient, modelId: modelPath(), directory: projectDir() }))
                  .catch((err) => {
                    const message = err instanceof Error ? err.message : String(err)
                    showToast({ title: language.t("common.requestFailed"), description: message })
                  })
              }
            }}
          >
            {language.t("dialog.llamacpp.field.thinking")}
          </Switch>
          <p class="text-12-regular text-text-weak -mt-2">{language.t("dialog.llamacpp.field.thinking.description")}</p>
        </Show>

        <Show when={discovered().length > 0}>
          <div class="flex flex-col gap-2">
            <div class="text-12-medium text-text-weak">{language.t("dialog.llamacpp.discovered")}</div>
            <List
              items={discovered}
              key={(x) => x}
              onSelect={(path) => path && setModelPath(path)}
              emptyMessage=""
              class="max-h-32 [&_[data-slot=list-scroll]]:overflow-y-auto"
            >
              {(path) => <span class="truncate text-12-regular">{path.split(/[/\\]/).pop()}</span>}
            </List>
          </div>
        </Show>

        <div class="flex items-center justify-between gap-2 pt-2 flex-wrap">
          <IconButton icon="arrow-left" variant="ghost" onClick={goBack} aria-label={language.t("common.back")} />
          <div class="flex items-center gap-2 flex-wrap justify-end">
            <Show when={isRunning()}>
              <Button
                size="large"
                variant="secondary"
                disabled={!canStop() || busy()}
                title={!canStop() ? language.t("dialog.llamacpp.action.stopExternalHint") : undefined}
                onClick={() => stopMutation.mutate()}
              >
                {language.t("dialog.llamacpp.action.stop")}
              </Button>
            </Show>
            <Button size="large" disabled={!pathsReady() || busy()} onClick={runPrimary}>
              {primaryLabel()}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
