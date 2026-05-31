import React from "react"
import { Box, Text } from "ink"
import type { ThemeColors } from "../hooks/useTheme"

const SHORTCUTS = [
  { key: "Ctrl+K", action: "Command palette" },
  { key: "Ctrl+C", action: "Abort / Exit" },
  { key: "Esc", action: "Dismiss modal" },
  { key: "↑ / ↓", action: "Navigate lists" },
  { key: "Enter", action: "Select / Send" },
  { key: "Shift+Enter", action: "Newline in input" },
]

const SLASH_COMMANDS = [
  { cmd: "/help", desc: "Show this help" },
  { cmd: "/new", desc: "Start a new session" },
  { cmd: "/model", desc: "Switch model" },
  { cmd: "/agent", desc: "Switch agent" },
  { cmd: "/session", desc: "Switch session" },
  { cmd: "/sessions", desc: "List sessions" },
  { cmd: "/abort", desc: "Cancel current response" },
  { cmd: "/compact", desc: "Compact conversation" },
  { cmd: "/revert", desc: "Undo last turn" },
  { cmd: "/fork", desc: "Fork conversation" },
  { cmd: "/context", desc: "Show token usage" },
  { cmd: "/theme", desc: "Toggle dark/light" },
  { cmd: "/exit", desc: "Quit" },
]

export interface HelpPanelProps {
  colors: ThemeColors
  onClose: () => void
}

export function HelpPanel({ colors, onClose }: HelpPanelProps) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.accent} paddingX={2} paddingY={1}>
      <Text bold color={colors.accent}>LocalCoder TUI Help</Text>
      <Box marginY={1}>
        <Text dimColor color={colors.muted}>Keyboard shortcuts</Text>
      </Box>
      {SHORTCUTS.map((s, i) => (
        <Box key={i} width={40}>
          <Box width={16}>
            <Text bold color={colors.info}>{s.key}</Text>
          </Box>
          <Text color={colors.foreground}>{s.action}</Text>
        </Box>
      ))}
      <Box marginY={1}>
        <Text dimColor color={colors.muted}>Slash commands</Text>
      </Box>
      {SLASH_COMMANDS.map((s, i) => (
        <Box key={i} width={60}>
          <Box width={14}>
            <Text bold color={colors.accent}>{s.cmd}</Text>
          </Box>
          <Text color={colors.foreground}>{s.desc}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor color={colors.muted}>Press Esc to close</Text>
      </Box>
    </Box>
  )
}
