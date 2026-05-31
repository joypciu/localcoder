export type PermissionMode = "interactive" | "accept" | "reject"

export type ReplContext = {
  directory: string
  sessionID?: string
  continueSession: boolean
  /** Last selected provider (provider/model uses providerID/modelID) */
  providerID?: string
  model?: string
  agent?: string
  thinking: boolean
  permissionMode: PermissionMode
  variant?: string
  /** Shown on status line after a turn (e.g. 12k/65536 tok) */
  meterShort?: string
  /** Show turn duration in footer (toggle with /timing) */
  showTiming: boolean
  /** Show rotating tips after turns (toggle with /tips off) */
  showTips: boolean
  /** Increments each completed turn (for tip rotation) */
  turnCount: number
  /** Enter inserts newline instead of submitting (toggle with /multiline) */
  multiline: boolean
  /** Last assistant response text (for /copy) */
  lastAssistantText: string
  /** Render markdown in assistant responses (toggle with /markdown) */
  renderMarkdown: boolean
}

export function shortSession(id?: string) {
  if (!id) return "new"
  return id.length > 10 ? id.slice(0, 8) + "…" : id
}
