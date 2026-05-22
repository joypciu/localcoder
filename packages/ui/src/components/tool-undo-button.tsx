import { Show } from "solid-js"
import { useI18n } from "../context/i18n"

export function ToolUndoButton(props: { onUndo?: () => void; pending?: boolean }) {
  const i18n = useI18n()
  return (
    <Show when={props.onUndo && !props.pending}>
      <button
        type="button"
        data-component="tool-undo-button"
        title={i18n.t("ui.tool.undo")}
        onClick={(event) => {
          event.stopPropagation()
          event.preventDefault()
          props.onUndo?.()
        }}
      >
        {i18n.t("ui.tool.undo")}
      </button>
    </Show>
  )
}
