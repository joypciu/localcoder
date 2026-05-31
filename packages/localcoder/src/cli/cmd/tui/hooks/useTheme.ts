import { useState, useCallback, useEffect } from "react"

export type ThemeMode = "dark" | "light"

export interface ThemeColors {
  background: string
  foreground: string
  muted: string
  accent: string
  success: string
  warning: string
  error: string
  info: string
  border: string
  userBubble: string
  assistantBubble: string
}

const dark: ThemeColors = {
  background: "#0a0a0a",
  foreground: "#e4e4e4",
  muted: "#6b6b6b",
  accent: "#3b82f6",
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
  border: "#262626",
  userBubble: "#1e3a5f",
  assistantBubble: "#1a1a1a",
}

const light: ThemeColors = {
  background: "#ffffff",
  foreground: "#1a1a1a",
  muted: "#737373",
  accent: "#2563eb",
  success: "#16a34a",
  warning: "#d97706",
  error: "#dc2626",
  info: "#2563eb",
  border: "#e5e5e5",
  userBubble: "#dbeafe",
  assistantBubble: "#f5f5f5",
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>("dark")

  useEffect(() => {
    if (typeof process !== "undefined" && process.stdout?.isTTY) {
      // Default to dark for terminal; could query OS later
      setModeState("dark")
    }
  }, [])

  const setMode = useCallback((m: ThemeMode) => setModeState(m), [])
  const toggle = useCallback(() => setModeState((prev) => (prev === "dark" ? "light" : "dark")), [])

  const colors = mode === "dark" ? dark : light

  return { mode, colors, setMode, toggle }
}
