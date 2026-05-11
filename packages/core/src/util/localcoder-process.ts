export const LOCALCODER_RUN_ID = "LOCALCODER_RUN_ID"
export const LOCALCODER_PROCESS_ROLE = "LOCALCODER_PROCESS_ROLE"

export function ensureRunID() {
  return (process.env[LOCALCODER_RUN_ID] ??= crypto.randomUUID())
}

export function ensureProcessRole(fallback: "main" | "worker") {
  return (process.env[LOCALCODER_PROCESS_ROLE] ??= fallback)
}

export function ensureProcessMetadata(fallback: "main" | "worker") {
  return {
    runID: ensureRunID(),
    processRole: ensureProcessRole(fallback),
  }
}

export function sanitizedProcessEnv(overrides?: Record<string, string>) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  return overrides ? Object.assign(env, overrides) : env
}
