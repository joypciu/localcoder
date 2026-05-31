import React, { useEffect, useState } from "react"
import { Box, Text } from "ink"
import SelectInput from "ink-select-input"
import type { localcoderClient } from "@localcoder-ai/sdk/v2"
import type { ThemeColors } from "../hooks/useTheme"

export interface ModelPickerProps {
  sdk: localcoderClient
  current?: string
  onSelect: (model: string) => void
  colors: ThemeColors
}

export function ModelPicker({ sdk, current, onSelect, colors }: ModelPickerProps) {
  const [items, setItems] = useState<{ label: string; value: string }[]>([])

  useEffect(() => {
    void sdk.provider.list().then((result) => {
      const data = result.data
      if (!data) return
      const list: { label: string; value: string }[] = []
      for (const pid of data.connected) {
        const p = data.all.find((p) => p.id === pid)
        if (!p) continue
        for (const mid of Object.keys(p.models)) {
          const label = `${pid}/${mid}`
          list.push({ label: current === label ? `● ${label}` : `  ${label}`, value: label })
        }
      }
      setItems(list)
    })
  }, [sdk, current])

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.accent} paddingX={1} height={16} width={52}>
      <Text bold color={colors.accent}>
        Select Model
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
