import React from "react"
import { Box, Text } from "ink"
import type { ThemeColors } from "../hooks/useTheme"

export interface ToastItem {
  id: string
  message: string
  variant?: "info" | "success" | "warning" | "error"
  title?: string
  duration?: number
}

export interface ToastProps {
  toast: ToastItem
  colors: ThemeColors
}

export function Toast({ toast, colors }: ToastProps) {
  const color =
    toast.variant === "error"
      ? colors.error
      : toast.variant === "warning"
        ? colors.warning
        : toast.variant === "success"
          ? colors.success
          : colors.info

  return (
    <Box borderStyle="round" borderColor={color} paddingX={1} marginBottom={1}>
      <Text color={color} bold>
        {toast.title ?? toast.variant?.toUpperCase() ?? "INFO"}
      </Text>
      <Text color={colors.foreground}>{" "}{toast.message}</Text>
    </Box>
  )
}
