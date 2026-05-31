import React, { useMemo } from "react"
import { Box, Text } from "ink"
import type { ChatMessage } from "../hooks/useChat"
import type { ThemeColors } from "../hooks/useTheme"

export interface MessageItemProps {
  message: ChatMessage
  colors: ThemeColors
  width: number
}

/** Approximate string width respecting common ANSI and CJK */
function stringWidth(str: string): number {
  let w = 0
  for (const char of str) {
    const code = char.codePointAt(0) ?? 0
    // CJK and fullwidth
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xa960 && code <= 0xa97f) ||
      (code >= 0xac00 && code <= 0xd7ff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xffef) ||
      (code >= 0x1f300 && code <= 0x1f9ff)
    ) {
      w += 2
    } else {
      w += 1
    }
  }
  return w
}

function wrapText(text: string, width: number): string[] {
  if (!text) return []
  const lines: string[] = []
  for (const raw of text.split("\n")) {
    let line = raw
    while (stringWidth(line) > width) {
      // Find the break point — try to break at a space
      let cut = width
      let foundSpace = false
      let currentWidth = 0
      let lastSpaceIdx = -1
      for (let i = 0; i < line.length; i++) {
        const cw = stringWidth(line[i]!)
        if (line[i] === " ") lastSpaceIdx = i
        currentWidth += cw
        if (currentWidth > width && !foundSpace) {
          cut = lastSpaceIdx > 0 ? lastSpaceIdx : i
          foundSpace = true
        }
      }
      lines.push(line.slice(0, cut).trimEnd())
      line = line.slice(cut).trimStart()
    }
    lines.push(line)
  }
  return lines
}

function parseMarkdownLine(line: string, colors: ThemeColors, width: number): React.ReactNode[] {
  const segments: React.ReactNode[] = []
  let key = 0

  const push = (text: string, opts: { bold?: boolean; italic?: boolean; color?: string; dim?: boolean } = {}) => {
    if (!text) return
    segments.push(
      <Text key={key++} bold={opts.bold} dimColor={opts.dim} color={opts.color || colors.foreground}>
        {text}
      </Text>,
    )
  }

  // Inline code
  const codeRegex = /`([^`]+)`/g
  let lastIdx = 0
  let m: RegExpExecArray | null

  while ((m = codeRegex.exec(line)) !== null) {
    if (m.index > lastIdx) {
      push(line.slice(lastIdx, m.index))
    }
    push(m[1]!, { color: colors.info, dim: true })
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < line.length) {
    push(line.slice(lastIdx))
  }

  // If no inline code, try bold/italic on the whole line
  if (segments.length === 0 && line.startsWith("**") && line.endsWith("**")) {
    return [<Text key={0} bold color={colors.foreground}>{line.slice(2, -2)}</Text>]
  }
  if (segments.length === 0 && line.startsWith("*") && line.endsWith("*") && line.length > 2) {
    return [<Text key={0} italic color={colors.foreground}>{line.slice(1, -1)}</Text>]
  }

  if (segments.length === 0) {
    return [<Text key={0} color={colors.foreground}>{line}</Text>]
  }
  return segments
}

export function MessageItem({ message, colors, width }: MessageItemProps) {
  const isUser = message.role === "user"
  const isSystem = message.role === "system"
  const label = isUser ? "you" : message.agent ?? "assistant"
  const labelColor = isUser ? colors.accent : isSystem ? colors.warning : colors.success

  const lines = useMemo(() => wrapText(message.text, width - 4), [message.text, width])

  // Extract code blocks
  const textWithoutCodeBlocks = message.text.replace(/```[\s\S]*?```/g, "")
  const plainLines = wrapText(textWithoutCodeBlocks, width - 4)

  const codeBlocks: { lang?: string; code: string }[] = []
  const codeRegex = /```(\w+)?\n?([\s\S]*?)```/g
  let cm: RegExpExecArray | null
  while ((cm = codeRegex.exec(message.text)) !== null) {
    codeBlocks.push({ lang: cm[1], code: cm[2]!.trim() })
  }

  return (
    <Box flexDirection="column" marginY={1} width={width}>
      <Box marginBottom={1}>
        <Text bold color={labelColor}>
          {isSystem ? "⚠ " : ""}{label}
        </Text>
        {message.modelID ? (
          <Text color={colors.muted}> · {message.modelID}</Text>
        ) : null}
        {message.timestamp ? (
          <Text color={colors.muted}> · {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
        ) : null}
      </Box>

      {/* File attachments */}
      {message.fileParts && message.fileParts.length > 0 && (
        <Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor={colors.border} paddingX={1}>
          <Text dimColor color={colors.muted}>Attachments:</Text>
          {message.fileParts.map((f, i) => (
            <Text key={i} color={colors.info}>📎 {f.filename ?? f.url ?? "file"}</Text>
          ))}
        </Box>
      )}

      {/* Main text */}
      {plainLines.map((line, i) => (
        <Box key={`l-${i}`} paddingLeft={1}>
          {parseMarkdownLine(line, colors, width - 4)}
        </Box>
      ))}

      {/* Code blocks */}
      {codeBlocks.map((block, i) => {
        const codeLines = wrapText(block.code, width - 6)
        return (
          <Box key={`cb-${i}`} flexDirection="column" marginY={1} borderStyle="single" borderColor={colors.border} paddingX={1}>
            {block.lang ? (
              <Text dimColor color={colors.muted}>{block.lang}</Text>
            ) : null}
            {codeLines.map((cl, ci) => (
              <Text key={ci} color={colors.foreground} dimColor>{cl}</Text>
            ))}
          </Box>
        )
      })}

      {/* Thinking block */}
      {message.thinkingText && (
        <Box marginTop={1} borderStyle="single" borderColor={colors.muted} paddingX={1}>
          <Text dimColor color={colors.muted}>◆ Thinking · {message.thinkingText.length} chars</Text>
        </Box>
      )}

      {/* Error */}
      {message.error && (
        <Box marginTop={1} borderStyle="single" borderColor={colors.error} paddingX={1}>
          <Text color={colors.error}>⚠ {message.error}</Text>
        </Box>
      )}

      {/* Tool parts */}
      {message.toolParts && message.toolParts.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {message.toolParts.map((part, i) => (
            <ToolPartItem key={i} part={part} colors={colors} width={width - 4} />
          ))}
        </Box>
      )}
    </Box>
  )
}

function ToolPartItem({ part, colors, width }: { part: NonNullable<ChatMessage["toolParts"]>[number]; colors: ThemeColors; width: number }) {
  const state = part.state
  const statusColor =
    state.status === "completed"
      ? colors.success
      : state.status === "error"
        ? colors.error
        : state.status === "running"
          ? colors.warning
          : colors.muted

  const statusIcon =
    state.status === "completed" ? "✓" : state.status === "error" ? "✗" : state.status === "running" ? "◈" : "○"

  const title = state.status === "running" || state.status === "completed" ? state.title : undefined
  const output = state.status === "completed" ? state.output : undefined
  const errorStr = state.status === "error" ? state.error : undefined

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={colors.border} paddingX={1} marginBottom={1} width={width + 4}>
      <Box>
        <Text color={statusColor}>{statusIcon} {part.tool}</Text>
        <Text color={colors.muted}> · {state.status}</Text>
      </Box>
      {title ? (
        <Text color={colors.foreground} dimColor>{title}</Text>
      ) : null}
      {output ? (
        <Box marginTop={1} flexDirection="column">
          {wrapText(output, width - 2).slice(0, 6).map((line, i) => (
            <Text key={i} color={colors.foreground} dimColor>{line}</Text>
          ))}
          {stringWidth(output) > (width - 2) * 6 ? (
            <Text color={colors.muted}>… ({output.length} chars)</Text>
          ) : null}
        </Box>
      ) : null}
      {errorStr ? (
        <Text color={colors.error}>{errorStr}</Text>
      ) : null}
    </Box>
  )
}
