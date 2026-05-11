declare global {
  const LOCALCODER_VERSION: string
  const LOCALCODER_CHANNEL: string
}

export const InstallationVersion = typeof LOCALCODER_VERSION === "string" ? LOCALCODER_VERSION : "local"
export const InstallationChannel = typeof LOCALCODER_CHANNEL === "string" ? LOCALCODER_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
