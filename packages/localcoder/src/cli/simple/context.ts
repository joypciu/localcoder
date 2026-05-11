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
}

export function shortSession(id?: string) {
  if (!id) return "new"
  return id.length > 10 ? id.slice(0, 8) + "…" : id
}
