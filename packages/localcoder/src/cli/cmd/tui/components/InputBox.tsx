import React, { useState, useRef } from "react"
import { Box, Text, useInput } from "ink"
import TextInput from "ink-text-input"
import type { ThemeColors } from "../hooks/useTheme"

export interface InputBoxProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  isLoading: boolean
  colors: ThemeColors
  width: number
}

export function InputBox({ value, onChange, onSubmit, isLoading, colors, width }: InputBoxProps) {
  const [multiline, setMultiline] = useState(false)

  useInput((input, key) => {
    if (key.return) {
      if (multiline) {
        onChange(value + "\n")
        return
      }
      if (value.trim()) {
        onSubmit(value)
      }
      return
    }

    if (key.shift && key.return) {
      onChange(value + "\n")
      return
    }
  })

  return (
    <Box height={multiline ? 3 : 1} width={width} borderStyle="single" borderTopColor={colors.border} paddingX={1}>
      <Text color={colors.accent} bold>
        {"› "}
      </Text>
      <TextInput
        value={value}
        onChange={onChange}
        placeholder={isLoading ? "Loading…" : "Type a message…"}
        focus={!isLoading}
        showCursor
      />
    </Box>
  )
}
