export const DEFAULT_THEME_ID = "cursor"
export const LEGACY_THEME_ID = "oc-2"
export const BRAND_THEME_ID = "localcoder"

export function isBundledTheme(id: string) {
  return id === DEFAULT_THEME_ID || id === BRAND_THEME_ID || id === LEGACY_THEME_ID
}
