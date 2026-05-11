import { marked } from "marked"

marked.setOptions({ gfm: true, breaks: true })

export function renderMarkdown(text: string): string {
  const raw = text.trim()
  if (!raw) return ""
  return marked.parse(raw, { async: false }) as string
}
