import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import SelectInput from "ink-select-input"
import type { ThemeColors } from "../hooks/useTheme"

const COMMANDS = [
  { label: "New session", value: "session.new" },
  { label: "Switch session", value: "session.list" },
  { label: "Switch model", value: "model.list" },
  { label: "Switch agent", value: "agent.list" },
  { label: "Toggle theme", value: "theme.switch" },
  { label: "Help", value: "help.show" },
  { label: "Exit", value: "app.exit" },
]

export interface CommandPaletteProps {
  onSelect: (value: string) => void
  colors: ThemeColors
}

export function CommandPalette({ onSelect, colors }: CommandPaletteProps) {
  const [query, setQuery] = useState("")

  const items = COMMANDS.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())).map((c) => ({
    label: c.label,
    value: c.value,
  }))

  useInput((input, key) => {
    if (key.escape) {
      onSelect("")
      return
    }
    if (!key.return && input.length === 1) {
      setQuery((q) => q + input)
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1))
    }
  })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.accent} paddingX={1} width={42}>
      <Text bold color={colors.accent}>
        Command Palette
      </Text>
      {query && (
        <Text color={colors.muted}>{query}</Text>
      )}
      <SelectInput
        items={items}
        onSelect={(item) => onSelect(item.value)}
        itemComponent={({ label, isSelected }) => (
          <Text color={isSelected ? colors.background : colors.foreground} backgroundColor={isSelected ? colors.accent : undefined}>
            {label}
          </Text>
        )}
        indicatorComponent={() => <Text color={colors.accent}>{"› "}</Text>}
      />
    </Box>
  )
}
