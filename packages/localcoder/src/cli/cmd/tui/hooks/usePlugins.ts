import { useCallback, useState } from "react"

export interface TuiPlugin {
  id: string
  name: string
  version: string
  activate?: () => void
  deactivate?: () => void
  /** Render a status line segment */
  renderStatus?: () => string | null
}

export interface PluginRegistry {
  plugins: TuiPlugin[]
  register: (plugin: TuiPlugin) => () => void
  activate: (id: string) => void
  deactivate: (id: string) => void
  get: (id: string) => TuiPlugin | undefined
}

export function createPluginRegistry(): PluginRegistry {
  const plugins = new Map<string, TuiPlugin>()

  return {
    get plugins() {
      return Array.from(plugins.values())
    },
    register(plugin) {
      plugins.set(plugin.id, plugin)
      plugin.activate?.()
      return () => {
        plugin.deactivate?.()
        plugins.delete(plugin.id)
      }
    },
    activate(id) {
      const p = plugins.get(id)
      if (p) p.activate?.()
    },
    deactivate(id) {
      const p = plugins.get(id)
      if (p) p.deactivate?.()
    },
    get(id) {
      return plugins.get(id)
    },
  }
}

export function usePluginRegistry() {
  const [registry] = useState(() => createPluginRegistry())

  const register = useCallback(
    (plugin: TuiPlugin) => {
      const unregister = registry.register(plugin)
      return unregister
    },
    [registry],
  )

  const statusSegments = useCallback(() => {
    return registry.plugins
      .map((p) => p.renderStatus?.())
      .filter((s): s is string => !!s)
  }, [registry])

  return { registry, register, statusSegments }
}
