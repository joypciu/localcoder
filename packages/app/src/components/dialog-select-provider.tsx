import { Component, Show } from "solid-js"
import { Button } from "@localcoder-ai/ui/button"
import { useDialog } from "@localcoder-ai/ui/context/dialog"
import { popularProviders, useProviders } from "@/hooks/use-providers"
import { Dialog } from "@localcoder-ai/ui/dialog"
import { List } from "@localcoder-ai/ui/list"
import { Tag } from "@localcoder-ai/ui/tag"
import { ProviderIcon } from "@localcoder-ai/ui/provider-icon"
import { DialogConnectProvider } from "./dialog-connect-provider"
import { useLanguage } from "@/context/language"
import { DialogCustomProvider } from "./dialog-custom-provider"
import { DialogSetupLlamacpp } from "./dialog-setup-llamacpp"

const CUSTOM_ID = "_custom"
const LLAMACPP_ID = "_llamacpp"

const LIST_CLASS =
  "flex-1 min-h-0 px-5 [&_[data-slot=list-search-wrapper]]:w-full [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0 [&_[data-slot=list-scroll]]:overflow-y-auto [&_[data-slot=list-items]]:bg-surface-base [&_[data-slot=list-items]]:rounded-md [&_[data-slot=list-item]]:min-h-12 [&_[data-slot=list-item]]:p-2 [&_[data-slot=list-item]]:!bg-transparent"

export const DialogSelectProvider: Component = () => {
  const dialog = useDialog()
  const providers = useProviders()
  const language = useLanguage()

  const popularGroup = () => language.t("dialog.provider.group.popular")
  const otherGroup = () => language.t("dialog.provider.group.other")
  const customLabel = () => language.t("settings.providers.tag.custom")
  const note = (id: string) => {
    if (id === "anthropic") return language.t("dialog.provider.anthropic.note")
    if (id === "openai") return language.t("dialog.provider.openai.note")
    if (id.startsWith("github-copilot")) return language.t("dialog.provider.copilot.note")
    if (id === "localcoder-go") return language.t("dialog.provider.localcoderGo.tagline")
  }

  return (
    <Dialog title={language.t("command.provider.connect")} transition size="large">
      <div class="flex flex-1 min-h-0 flex-col gap-2 pb-3">
        <div class="px-5 pt-1 shrink-0">
          <ButtonRow onSetupLlama={() => dialog.show(() => <DialogSetupLlamacpp back="providers" />)} />
        </div>
        <List
          class={LIST_CLASS}
          search={{ placeholder: language.t("dialog.provider.search.placeholder"), autofocus: true }}
          emptyMessage={language.t("dialog.provider.empty")}
          activeIcon="plus-small"
          key={(x) => x?.id}
          items={() => {
            language.locale()
            return [
              { id: LLAMACPP_ID, name: language.t("dialog.provider.llamacpp.name") },
              { id: CUSTOM_ID, name: customLabel() },
              ...providers.all(),
            ]
          }}
          filterKeys={["id", "name"]}
          groupBy={(x) => (popularProviders.includes(x.id) ? popularGroup() : otherGroup())}
          sortBy={(a, b) => {
            if (a.id === LLAMACPP_ID) return -2
            if (b.id === LLAMACPP_ID) return 2
            if (a.id === CUSTOM_ID) return -1
            if (b.id === CUSTOM_ID) return 1
            if (popularProviders.includes(a.id) && popularProviders.includes(b.id))
              return popularProviders.indexOf(a.id) - popularProviders.indexOf(b.id)
            return a.name.localeCompare(b.name)
          }}
          sortGroupsBy={(a, b) => {
            const popular = popularGroup()
            if (a.category === popular && b.category !== popular) return -1
            if (b.category === popular && a.category !== popular) return 1
            return 0
          }}
          onSelect={(x) => {
            if (!x) return
            if (x.id === LLAMACPP_ID) {
              dialog.show(() => <DialogSetupLlamacpp back="providers" />)
              return
            }
            if (x.id === CUSTOM_ID) {
              dialog.show(() => <DialogCustomProvider back="providers" />)
              return
            }
            dialog.show(() => <DialogConnectProvider provider={x.id} />)
          }}
        >
          {(i) => (
            <Show
              when={i.id === LLAMACPP_ID}
              fallback={
                <div class="px-1.25 w-full min-w-0 flex items-center gap-x-3">
                  <ProviderIcon data-slot="list-item-extra-icon" id={i.id} />
                  <span class="truncate">{i.name}</span>
                  <Show when={i.id === CUSTOM_ID}>
                    <Tag>{language.t("settings.providers.tag.custom")}</Tag>
                  </Show>
                  <Show when={i.id === "localcoder"}>
                    <div class="text-14-regular text-text-weak truncate">{language.t("dialog.provider.localcoder.tagline")}</div>
                    <Tag>{language.t("dialog.provider.tag.recommended")}</Tag>
                  </Show>
                  <Show when={note(i.id)}>{(value) => <div class="text-14-regular text-text-weak truncate">{value()}</div>}</Show>
                  <Show when={i.id === "localcoder-go"}>
                    <Tag>{language.t("dialog.provider.tag.recommended")}</Tag>
                  </Show>
                </div>
              }
            >
              <div class="px-1.25 w-full min-w-0 flex flex-col gap-1 py-0.5">
                <div class="flex items-center gap-x-2 min-w-0">
                  <ProviderIcon data-slot="list-item-extra-icon" id="synthetic" />
                  <span class="truncate">{i.name}</span>
                  <Tag>{language.t("dialog.provider.tag.recommended")}</Tag>
                </div>
                <div class="text-13-regular text-text-weak pl-7 leading-snug">
                  {language.t("dialog.provider.llamacpp.note")}
                </div>
              </div>
            </Show>
          )}
        </List>
      </div>
    </Dialog>
  )
}

function ButtonRow(props: { onSetupLlama: () => void }) {
  const language = useLanguage()
  return (
    <Button size="large" variant="secondary" class="w-full h-auto py-3 flex-col items-start gap-1" onClick={props.onSetupLlama}>
      <span class="text-14-medium text-text-strong">{language.t("dialog.provider.llamacpp.name")}</span>
      <span class="text-12-regular text-text-weak whitespace-normal text-left">{language.t("dialog.provider.llamacpp.note")}</span>
    </Button>
  )
}

