import { Button } from "@localcoder-ai/ui/button"
import { useDialog } from "@localcoder-ai/ui/context/dialog"
import { Dialog } from "@localcoder-ai/ui/dialog"
import { IconButton } from "@localcoder-ai/ui/icon-button"
import { List } from "@localcoder-ai/ui/list"
import { showToast } from "@localcoder-ai/ui/toast"
import { TextField } from "@localcoder-ai/ui/text-field"
import { useMutation, useQuery } from "@tanstack/solid-query"
import { createEffect, createMemo, createSignal, Show } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { getLlamaCppStatus, setupLlamaCpp } from "@/utils/llamacpp-api"
import { DialogSelectProvider } from "./dialog-select-provider"

type Props = {
  back?: "providers" | "close"
}

export function DialogSetupLlamacpp(props: Props) {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const server = useServer()
  const globalSDK = useGlobalSDK()

  const http = createMemo(() => server.current?.http)
  const canPick = createMemo(() => Boolean(platform.openDirectoryPickerDialog && platform.openFilePickerDialog && server.isLocal()))

  const [llamaDir, setLlamaDir] = createSignal("")
  const [modelPath, setModelPath] = createSignal("")
  const [step, setStep] = createSignal<"paths" | "starting" | "done">("paths")

  const statusQuery = useQuery(() => ({
    queryKey: ["llamacpp-status", http()?.url],
    enabled: Boolean(http()),
    queryFn: async () => getLlamaCppStatus(http()!),
  }))

  createEffect(() => {
    const data = statusQuery.data
    if (!data) return
    if (!llamaDir()) setLlamaDir(data.llamaDir ?? "")
    if (!modelPath()) setModelPath(data.modelPath ?? "")
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

  const setupMutation = useMutation(() => ({
    mutationFn: async () => {
      const conn = http()
      if (!conn) throw new Error(language.t("error.globalSDK.noServerAvailable"))
      setStep("starting")
      return setupLlamaCpp(conn, {
        llamaDir: llamaDir().trim(),
        modelPath: modelPath().trim(),
        autoStart: true,
      })
    },
    onSuccess: async (result) => {
      setStep("done")
      await globalSDK.client.global.dispose().catch(() => undefined)
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("dialog.llamacpp.toast.ready.title"),
        description: language.t("dialog.llamacpp.toast.ready.description", { model: result.modelId ?? result.model }),
      })
      dialog.close()
    },
    onError: (err) => {
      setStep("paths")
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    },
  }))

  const statusLine = createMemo(() => {
    const data = statusQuery.data
    if (!data) return language.t("dialog.llamacpp.status.checking")
    if (data.running) {
      return language.t("dialog.llamacpp.status.running", { model: data.modelId ?? "unknown" })
    }
    return language.t("dialog.llamacpp.status.stopped")
  })

  const discovered = createMemo(() => statusQuery.data?.discoveredModels ?? [])

  return (
    <Dialog
      title={language.t("dialog.llamacpp.title")}
      description={language.t("dialog.llamacpp.description")}
      transition
    >
      <div class="flex flex-col gap-4 px-4 pb-4 max-w-lg">
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

        <Show when={discovered().length > 0}>
          <div class="flex flex-col gap-2">
            <div class="text-12-medium text-text-weak">{language.t("dialog.llamacpp.discovered")}</div>
            <List
              items={discovered}
              key={(x) => x}
              onSelect={(path) => path && setModelPath(path)}
              emptyMessage=""
            >
              {(path) => <span class="truncate text-12-regular">{path.split(/[/\\]/).pop()}</span>}
            </List>
          </div>
        </Show>

        <div class="flex items-center justify-between gap-2 pt-2">
          <IconButton icon="arrow-left" variant="ghost" onClick={goBack} aria-label={language.t("common.back")} />
          <Button
            size="large"
            disabled={!llamaDir().trim() || !modelPath().trim() || setupMutation.isPending}
            onClick={() => setupMutation.mutate()}
          >
            {setupMutation.isPending || step() === "starting"
              ? language.t("dialog.llamacpp.action.starting")
              : language.t("dialog.llamacpp.action.setup")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}