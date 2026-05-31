import React, { useEffect, useState } from "react"
import { Box, Text } from "ink"
import SelectInput from "ink-select-input"
import type { localcoderClient } from "@localcoder-ai/sdk/v2"
import type { ThemeColors } from "../hooks/useTheme"

export interface AgentPickerProps {
  sdk: localcoderClient
  current?: string
  onSelect: (agent: string) => void
  colors: ThemeColors
}

export function AgentPicker({ sdk, current, onSelect, colors }: AgentPickerProps) {
  const [items, setItems] = useState<{ label: string; value: string }[]>([])

  useEffect(() => {
    void sdk.app.agents().then((result: { data?: { name: string; mode: string }[] }) => {
      const agents = result.data ?? []
      setItems(
        agents.map((a) => ({
          label: current === a.name ? `● ${a.name} (${a.mode})` : `  ${a.name} (${a.mode})`,
          value: a.name,
        })),
      )
    })
  }, [sdk, current])

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.accent} paddingX={1} height={14} width={42}>
      <Text bold color={colors.accent}>
        Select Agent
      </Text>
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
