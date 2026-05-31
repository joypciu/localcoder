import React, { useMemo } from "react"
import { Box, Text } from "ink"
import type { ChatMessage } from "../hooks/useChat"
import type { ThemeColors } from "../hooks/useTheme"
import { MessageItem } from "./MessageItem"

export interface MessageListProps {
  messages: ChatMessage[]
  isLoading: boolean
  colors: ThemeColors
  width: number
}

export function MessageList({ messages, isLoading, colors, width }: MessageListProps) {
  const visible = useMemo(() => {
    // Show last messages that fit; simple approach
    return messages
  }, [messages])

  return (
    <Box flexDirection="column" width={width} paddingX={1} flexGrow={1}>
      {visible.length === 0 && !isLoading && (
        <Box marginTop={1}>
          <Text color={colors.muted}>Type a message and press Enter to start.</Text>
        </Box>
      )}
      {visible.map((msg) => (
        <MessageItem key={msg.id} message={msg} colors={colors} width={width - 2} />
      ))}
      {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
        <Box marginTop={1}>
          <Text color={colors.muted}>Thinking…</Text>
        </Box>
      )}
    </Box>
  )
}
