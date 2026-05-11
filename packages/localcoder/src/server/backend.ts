import { Flag } from "@localcoder-ai/core/flag/flag"
import { InstallationChannel, InstallationVersion } from "@localcoder-ai/core/installation/version"

export type Backend = "effect-httpapi" | "hono"

export type Selection = {
  backend: Backend
  reason: "env" | "stable" | "explicit"
}

export type Attributes = ReturnType<typeof attributes>

export function select(): Selection {
  if (Flag.LOCALCODER_EXPERIMENTAL_HTTPAPI) return { backend: "effect-httpapi", reason: "env" }
  return { backend: "hono", reason: "stable" }
}

export function attributes(selection: Selection): Record<string, string> {
  return {
    "localcoder.server.backend": selection.backend,
    "localcoder.server.backend.reason": selection.reason,
    "localcoder.installation.channel": InstallationChannel,
    "localcoder.installation.version": InstallationVersion,
  }
}

export function force(selection: Selection, backend: Backend): Selection {
  return {
    backend,
    reason: selection.backend === backend ? selection.reason : "explicit",
  }
}
