# localcoder VS Code Extension

A VS Code chat panel for localcoder — the open source AI coding agent.

## Features

- **Chat Panel** — Full-featured chat UI with inline Markdown rendering, syntax-highlighted code blocks, copy buttons, and smooth streaming
- **Tool Call Visualization** — Real-time collapsible cards for every tool the agent runs (Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Agent…) with formatted input/output
- **Diff Rendering** — Edit tool outputs show unified diffs with green/red highlights
- **Shell Output** — Bash/shell tool outputs color stdout in teal and stderr in red
- **Thinking Blocks** — Collapsible reasoning sections (Claude-style) for models that expose chain-of-thought
- **Multi-Backend** — Switch between the localcoder local agent and any OpenAI-compatible API (OpenAI, OpenRouter, llama.cpp, Ollama, etc.)
- **Session Management** — Browse and reload previous conversations from the header dropdown
- **Active File Context** — The current file and selection are surfaced as context hints while you type
- **Terminal TUI** — Traditional terminal-based localcoder interface alongside the chat panel

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+L` | Open / focus chat panel |
| `Ctrl+Esc` | Open localcoder terminal |
| `Ctrl+Shift+Esc` | New localcoder terminal tab |
| `Ctrl+Alt+K` | Insert active filepath into terminal |

## Quick Start (Development)

1. Clone the repo and open the root folder in VS Code
2. `cd sdks/vscode && bun install`
3. Press `F5` to launch the Extension Development Host
4. In the new window open any project folder
5. Press `Ctrl+Shift+L` to open the chat panel

## Configuration

### localcoder Backend (default)

Starts a local `localcoder` server automatically on a random port with auto-generated credentials. Requires `bun` installed and the monorepo's `packages/localcoder` present.

### OpenAI-compatible Backend

1. Open the chat panel
2. Select **OpenAI** from the backend dropdown
3. Click **⚙** → configure:
   - **Endpoint** — `https://api.openai.com/v1`, `https://openrouter.ai/api/v1`, `http://localhost:8080/v1`, etc.
   - **Model** — e.g. `gpt-4o`, `claude-3-5-sonnet-20241022`, `llama3`
   - **API Key** — your provider key
4. Click **Save** — settings persist across VS Code sessions

## Architecture

```
sdks/vscode/
├── src/
│   ├── extension.ts          Entry point — registers commands, manages terminals
│   ├── chat-panel.ts         Webview ↔ backend bridge (message router)
│   └── backends/
│       ├── types.ts          ChatBackend interface, ChatMessage, ToolCall types
│       ├── localcoder.ts     Local server backend (spawn → health → SSE → API)
│       └── openai.ts         OpenAI-compatible backend (streaming HTTP)
├── media/
│   └── chat.html             Self-contained webview UI (no CDN dependencies)
└── src/test/
    └── suite/                Integration & unit test suites (45 tests)
```

The webview (`chat.html`) is fully self-contained — zero CDN dependencies, inline Markdown renderer, inline CSS. The Content Security Policy stays at `default-src 'none'`.

## Development

```bash
cd sdks/vscode
bun install            # install dev dependencies
bun run compile        # type-check + lint + bundle → dist/extension.js
bun run watch:esbuild  # rebuild on save
bun run check-types    # tsc --noEmit only
bun run lint           # eslint src/
```

### Running Tests

```bash
bun run test           # compile-tests + vscode-test (requires VS Code installed)
```

Tests live in `src/test/suite/` and cover all six tool categories: read/glob, write/edit, shell, agent delegation, multi-turn conversation, and search tools.

## Debugging

| Where | How |
|---|---|
| In-UI debug panel | Click the status bar at the bottom of the chat panel |
| Extension host logs | **View → Output → Extension Host** |
| File log | `sdks/vscode/debug.txt` (timestamped, appended on each run) |

## Requirements

- VS Code 1.94+
- Bun (for the localcoder backend)
- Node.js 20+ (bundled with VS Code for the extension host)
