import React from "react"
import { Box, Text } from "ink"
import type { ThemeColors } from "../hooks/useTheme"

export interface HeaderProps {
  directory: string
  model?: string
  agent?: string
  sessionID?: string
  statusText: string
  isLoading: boolean
  colors: ThemeColors
}

export function Header({ directory, model, agent, sessionID, statusText, isLoading, colors }: HeaderProps) {
  const dirName = directory.split(/[\\/]/).pop() ?? directory
  const modelLabel = model ? model.split("/").slice(-2).join("/") : "no model"
  const agentLabel = agent ?? "default"
  const sessionLabel = sessionID ? sessionID.slice(0, 8) : "new"

  return (
    <Box height={1} width="100%" borderStyle="single" borderBottomColor={colors.border}>
      <Text color={colors.muted}>
        {" "}
        {dirName}
        {" · "}
        <Text color={colors.accent} bold>{modelLabel}</Text>
        {" · "}
        <Text color={colors.info}>{agentLabel}</Text>
        {" · "}
        {sessionLabel}
        {isLoading && statusText ? (
          <Text color={colors.warning}>{" · "}{statusText}</Text>
        ) : null}
        {" "}
      </Text>
    </Box>
  )
}
