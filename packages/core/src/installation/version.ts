declare global {
  const LOCALCODER_VERSION: string
  const LOCALCODER_CHANNEL: string
}

export const InstallationVersion = typeof LOCALCODER_VERSION === "string" ? LOCALCODER_VERSION : "local"
export const InstallationChannel = typeof LOCALCODER_CHANNEL === "string" ? LOCALCODER_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"

/** True when @localcoder-ai/plugin is already on disk (dev tree or bundled standalone). */
export function pluginDependencyAvailable(from = import.meta.url) {
  if (InstallationLocal) return true
  try {
    import.meta.resolve("@localcoder-ai/plugin", from)
    return true
  } catch {
    return false
  }
}
