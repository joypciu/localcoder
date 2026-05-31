import React, { useState, useCallback, useEffect } from "react"
import { Box, useApp, useStdout, useInput } from "ink"
import { useChat } from "./hooks/useChat"
import { useTheme } from "./hooks/useTheme"
import { createTuiClient } from "./hooks/useClient"
import { Header } from "./components/Header"
import { MessageList } from "./components/MessageList"
import { InputBox } from "./components/InputBox"
import { CommandPalette } from "./components/CommandPalette"
import { ModelPicker } from "./components/ModelPicker"
import { AgentPicker } from "./components/AgentPicker"
import { SessionPicker } from "./components/SessionPicker"
import { HelpPanel } from "./components/HelpPanel"
import { Toast, type ToastItem } from "./components/Toast"
import { render } from "ink"

export type TuiArgs = {
  continue?: boolean
  sessionID?: string
  agent?: string
  model?: string
  prompt?: string
  fork?: boolean
}

function TuiApp(props: {
  url: string
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
  args: TuiArgs
  onBeforeExit?: () => Promise<void>
}) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const { mode, colors, toggle: toggleTheme } = useTheme()

  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [showSessionPicker, setShowSessionPicker] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [inputValue, setInputValue] = useState("")

  const sdk = createTuiClient({
    url: props.url,
    directory: props.directory,
    fetch: props.fetch,
    headers: props.headers,
  })

  const showToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { ...toast, id }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, toast.duration ?? 3000)
  }, [])

  const chat = useChat(sdk, {
    directory: props.directory ?? process.cwd(),
    initialSessionID: props.args.sessionID,
    initialModel: props.args.model,
    initialAgent: props.args.agent,
    permissionMode: "interactive",
    onError: (msg) => showToast({ message: msg, variant: "error", duration: 5000 }),
  })

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim()) return
      const trimmed = text.trim()
      if (trimmed === "/help" || trimmed === "/h" || trimmed === "/?") {
        setInputValue("")
        setShowHelp(true)
        return
      }
      if (trimmed === "/new" || trimmed === "/clear" || trimmed === "/cls") {
        setInputValue("")
        chat.newSession()
        showToast({ message: "New session started", variant: "info" })
        return
      }
      if (trimmed === "/abort" || trimmed === "/stop" || trimmed === "/cancel") {
        setInputValue("")
        chat.abort()
        return
      }
      if (trimmed === "/theme" || trimmed === "/dark" || trimmed === "/light") {
        setInputValue("")
        toggleTheme()
        return
      }
      if (trimmed === "/exit" || trimmed === "/quit" || trimmed === "/q") {
        setInputValue("")
        void props.onBeforeExit?.().then(() => exit())
        return
      }
      if (trimmed.startsWith("/model ")) {
        const m = trimmed.slice(7).trim()
        if (m) chat.setModel(m)
        setInputValue("")
        return
      }
      if (trimmed.startsWith("/agent ")) {
        const a = trimmed.slice(7).trim()
        if (a) chat.setAgent(a)
        setInputValue("")
        return
      }
      if (trimmed.startsWith("/session ")) {
        const sid = trimmed.slice(9).trim()
        if (sid) void chat.switchSession(sid)
        setInputValue("")
        return
      }
      setInputValue("")
      await chat.sendMessage({ text })
    },
    [chat, toggleTheme, exit, props, showToast],
  )

  const handleCommand = useCallback(
    (command: string) => {
      setShowCommandPalette(false)
      switch (command) {
        case "session.list":
          setShowSessionPicker(true)
          return
        case "session.new":
          chat.newSession()
          return
        case "model.list":
          setShowModelPicker(true)
          return
        case "agent.list":
          setShowAgentPicker(true)
          return
        case "theme.switch":
          toggleTheme()
          return
        case "app.exit":
          void props.onBeforeExit?.().then(() => exit())
          return
        case "help.show":
          setShowHelp(true)
          return
      }
    },
    [chat, toggleTheme, exit, props, showToast],
  )

  useInput((input, key) => {
    if (showCommandPalette || showModelPicker || showAgentPicker || showSessionPicker || showHelp) {
      if (key.escape) {
        setShowCommandPalette(false)
        setShowModelPicker(false)
        setShowAgentPicker(false)
        setShowSessionPicker(false)
        setShowHelp(false)
      }
      return
    }

    if (key.ctrl && input === "k") {
      setShowCommandPalette(true)
      return
    }

    if (input === "?" && !key.ctrl && !key.meta) {
      setShowHelp(true)
      return
    }

    if (key.ctrl && input === "c") {
      if (chat.isLoading) {
        chat.abort()
        return
      }
      void props.onBeforeExit?.().then(() => exit())
      return
    }
  })

  useEffect(() => {
    if (props.args.prompt?.trim()) {
      void chat.sendMessage({ text: props.args.prompt, continue: props.args.continue, fork: props.args.fork })
    } else if (props.args.continue && props.args.sessionID) {
      void chat.switchSession(props.args.sessionID)
    }
  }, [])

  const rows = stdout.rows ?? 24
  const cols = stdout.columns ?? 80

  return (
    <Box flexDirection="column" height={rows} width={cols}>
      <Header
        directory={props.directory ?? process.cwd()}
        model={chat.model}
        agent={chat.agent}
        sessionID={chat.sessionID}
        statusText={chat.statusText}
        isLoading={chat.isLoading}
        colors={colors}
      />

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <MessageList messages={chat.messages} isLoading={chat.isLoading} colors={colors} width={cols} />
      </Box>

      <InputBox
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSend}
        isLoading={chat.isLoading}
        colors={colors}
        width={cols}
      />

      {showCommandPalette && (
        <Box position="absolute" marginTop={Math.floor(rows / 2) - 6} marginLeft={Math.floor(cols / 2) - 20} width={40}>
          <CommandPalette onSelect={handleCommand} colors={colors} />
        </Box>
      )}

      {showModelPicker && (
        <Box position="absolute" marginTop={Math.floor(rows / 2) - 8} marginLeft={Math.floor(cols / 2) - 25} width={50}>
          <ModelPicker
            sdk={sdk}
            current={chat.model}
            onSelect={(m) => {
              chat.setModel(m)
              setShowModelPicker(false)
            }}
            colors={colors}
          />
        </Box>
      )}

      {showAgentPicker && (
        <Box position="absolute" marginTop={Math.floor(rows / 2) - 6} marginLeft={Math.floor(cols / 2) - 20} width={40}>
          <AgentPicker
            sdk={sdk}
            current={chat.agent}
            onSelect={(a) => {
              chat.setAgent(a)
              setShowAgentPicker(false)
            }}
            colors={colors}
          />
        </Box>
      )}

      {showSessionPicker && (
        <Box position="absolute" marginTop={Math.floor(rows / 2) - 10} marginLeft={Math.floor(cols / 2) - 30} width={60}>
          <SessionPicker
            sdk={sdk}
            current={chat.sessionID}
            onSelect={(sid) => {
              void chat.switchSession(sid)
              setShowSessionPicker(false)
            }}
            colors={colors}
          />
        </Box>
      )}

      {showHelp && (
        <Box position="absolute" marginTop={Math.floor(rows / 2) - 14} marginLeft={Math.floor(cols / 2) - 32} width={64}>
          <HelpPanel colors={colors} onClose={() => setShowHelp(false)} />
        </Box>
      )}

      <Box flexDirection="column" position="absolute" marginTop={1} marginLeft={cols - 30} width={30}>
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} colors={colors} />
        ))}
      </Box>
    </Box>
  )
}

export function tui(input: {
  url: string
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
  args: TuiArgs
  onBeforeExit?: () => Promise<void>
}) {
  return new Promise<void>((resolve) => {
    const app = render(
      <TuiApp {...input} />,
      { stdout: process.stdout, stdin: process.stdin, stderr: process.stderr, patchConsole: false },
    )

    app.waitUntilExit().then(() => resolve()).catch(() => resolve())
  })
}
