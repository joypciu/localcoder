# LocalCoder VS Code Extension

AI coding agent in VS Code — sidebar chat, live tool streaming, file edits with undo, and terminal TUI.

**Test status:** 84/84 passing (`bun run test`)

## Features

- **Activity Bar** — LocalCoder icon opens the sidebar chat (like Copilot / Claude Code)
- **Live streaming** — tokens and tool calls update in real time via SSE
- **Tool cards** — Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Agent
- **Undo** — revert all agent file changes per turn, or per-file ↩ on the changes bar
- **@ mentions** — type `@` for workspace file autocomplete; contents sent as context
- **Build / Plan** — agent mode selector in the chat header
- **Multi-backend** — LocalCoder local agent (default) or any OpenAI-compatible API
- **First-run wizard** — Gemini, Groq, Ollama, or custom endpoint
- **Sessions** — history dropdown, persisted by the LocalCoder server
- **Terminal TUI** — full TUI via `Ctrl+Esc` with filepath bridge

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+L` | Open chat panel (floating tab) |
| `Ctrl+Shift+U` | Undo last agent file changes |
| `Ctrl+Shift+A` | Add selection to chat |
| `Ctrl+Esc` | Open LocalCoder terminal |
| `Ctrl+Shift+Esc` | New terminal tab |
| `Ctrl+Alt+K` | Insert active filepath into terminal |

## Quick start

1. Clone [localcoder](https://github.com/joypciu/localcoder) and open the repo in VS Code
2. `cd sdks/vscode && bun install`
3. Press **F5** (Extension Development Host)
4. Open a workspace folder → click **LocalCoder** in the Activity Bar

### Settings (`localcoder.*`)

| Setting | Description |
|---------|-------------|
| `packagePath` | Path to `packages/localcoder` (auto-detected in monorepo) |
| `bunPath` | Path to `bun` executable |
| `defaultAgent` | `build` (full tools) or `plan` |
| `openDiffOnEdit` | Open editor after agent edits |

## Architecture

```
sdks/vscode/
├── src/
│   ├── extension.ts          Commands, wizard, terminal bridge
│   ├── chat-panel.ts         Webview bridge, undo snapshots, @files
│   └── backends/
│       ├── localcoder.ts     Spawn server, SSE, agent API
│       ├── sse-events.ts     Pure SSE event parser (testable)
│       ├── openai.ts         OpenAI-compatible streaming
│       └── types.ts
├── media/chat.html           Self-contained webview (CSP-hardened)
└── src/test/suite/           84 tests (10 suites)
```

## Development

```bash
cd sdks/vscode
bun install
bun run compile        # typecheck + lint + bundle
bun run test:unit      # mocha (fast, no Electron)
bun run test           # full suite including VS Code host
```

From repo root:

```bash
bun run scripts/vscode-extension-e2e.ts
```

## Publishing

```bash
npx vsce package   # .vsix for local install
npx vsce publish   # VS Marketplace (after publisher login)
```

## Roadmap

See [FUTURE_IMPROVEMENTS.md](./FUTURE_IMPROVEMENTS.md) and [IMPROVEMENT_AND_FIX.md](../../IMPROVEMENT_AND_FIX.md).

## Requirements

- VS Code 1.94+
- Bun (LocalCoder backend)
- Monorepo `packages/localcoder` or configured `localcoder.packagePath`


## Chat history

- **Sessions** — header button lists server sessions (LocalCoder backend) or saved OpenAI chats.
- **Resume** — last active session per workspace restores when you reopen the panel.
- **Prompt reuse** — `↑` / `↓` in the input recalls previous prompts (webview state).
