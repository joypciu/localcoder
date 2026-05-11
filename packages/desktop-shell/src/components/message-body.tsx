import { createMemo } from "solid-js"
import { renderMarkdown } from "../lib/markdown"

export function MessageBody(props: { role: "user" | "assistant"; text: string }) {
  const html = createMemo(() => (props.role === "assistant" ? renderMarkdown(props.text) : ""))

  return (
    <div class="lc-msg-body" data-testid={props.role === "user" ? "msg-user-body" : "msg-assistant-body"}>
      {props.role === "assistant" ? (
        <div class="lc-markdown" innerHTML={html()} />
      ) : (
        <pre class="lc-user-text">{props.text}</pre>
      )}
    </div>
  )
}
