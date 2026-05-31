import React, { useEffect, useState } from "react"
import { Box, Text } from "ink"
import SelectInput from "ink-select-input"
import type { localcoderClient } from "@localcoder-ai/sdk/v2"
import type { ThemeColors } from "../hooks/useTheme"

export interface SessionPickerProps {
  sdk: localcoderClient
  current?: string
  onSelect: (sessionID: string) => void
  colors: ThemeColors
}

export function SessionPicker({ sdk, current, onSelect, colors }: SessionPickerProps) {
  const [items, setItems] = useState<{ label: string; value: string }[]>([])

  useEffect(() => {
    void sdk.session.list().then((result) => {
      const sessions = (result.data ?? []).toSorted((a, b) => b.time.updated - a.time.updated)
      setItems(
        sessions.map((s) => {
          const title = s.title.length > 40 ? s.title.slice(0, 37) + "…" : s.title
          return {
            label: current === s.id ? `● ${title}` : `  ${title}`,
            value: s.id,
          }
        }),
      )
    })
  }, [sdk, current])

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.accent} paddingX={1} height={20} width={62}>
      <Text bold color={colors.accent}>
        Select Session
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
