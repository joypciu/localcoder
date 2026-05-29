# LocalCoder VS Code Extension

AI coding agent in VS Code — sidebar chat, live tool streaming, file edits with undo, zero-config providers.

**Tests:** 93+ unit contract tests (`bun run test:unit` ~5s); full `bun run test` includes Electron; visual webview tests in `packages/app/e2e/visual/`

## Features

- **Activity Bar** — LocalCoder icon opens sidebar chat
- **Zero-config providers** — first-run wizard + Settings (⚙) for llama.cpp and cloud keys
- **Live streaming** — tokens, reasoning, and tools via SSE
- **Tool cards** — Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Agent, Todo
- **Undo** — revert all per turn, or per-file on the changes bar
- **@ mentions** — workspace file autocomplete
- **Build / Plan** — agent mode selector
- **Inline actions** — Explain, Fix, Ask, Edit on selections (CodeLens)
- **Multi-backend** — LocalCoder agent (default) or OpenAI-compatible API
- **Terminal TUI** — `Ctrl+Esc` with filepath bridge

## Commands

| Command | Action |
|---------|--------|
| `LocalCoder: Open LocalCoder Chat` | Open panel (`Ctrl+Shift+L`) |
| `LocalCoder: Set up llama.cpp (GGUF)` | Folder + model + context wizard |
| `LocalCoder: Connect cloud provider` | OpenRouter, OpenCode Go, Fireworks, Groq |
| `LocalCoder: Undo Last Agent Changes` | `Ctrl+Shift+U` |
| `LocalCoder: Explain / Fix Selection` | CodeLens on selected code |

## First-run wizard

On first launch, choose:

- **llama.cpp** — any folder with `llama-server`, any `.gguf`, context size, thinking mode
- **OpenRouter / OpenCode Go** — paste API key (stored in `~/.localcoder/auth.json`)
- **Groq / Gemini / Ollama** — free-tier or local endpoints
- **OpenAI-compatible** — custom endpoint + key
- **LocalCoder Backend** — full agent; connect providers later from Settings

Change anytime via Settings (⚙) → **Set up llama.cpp** or **Connect cloud provider**.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+L` | Open chat panel |
| `Ctrl+Shift+U` | Undo last agent file changes |
| `Ctrl+Shift+A` | Add selection to chat |
| `Ctrl+Esc` | Open LocalCoder terminal |
| `Ctrl+Shift+Esc` | New terminal tab |

## Quick start

1. Clone [localcoder](https://github.com/joypciu/localcoder)
2. `cd sdks/vscode && bun install && bun run compile`
3. From repo root: `bun run install:cli` (or `bun run build:win`)
4. Press **F5** in VS Code
5. Open a workspace → click **LocalCoder** in the Activity Bar → complete wizard

### Settings (`localcoder.*`)

| Setting | Description |
|---------|-------------|
| `packagePath` | Path to `packages/localcoder` (for CLI binary resolution) |
| `bunPath` | Path to `bun` |
| `defaultAgent` | `build` or `plan` |
| `openDiffOnEdit` | Open editor after agent edits |

API keys for cloud providers use **SecretStorage** (not plaintext in settings).

## Development

```bash
cd sdks/vscode
bun install
bun run compile
bun run compile-tests
bun run test:unit          # fast — no Electron (~5s)
bun run test               # full — downloads VS Code once
```

From repo root:

```bash
bun run scripts/vscode-extension-e2e.ts
# Skip live/Electron: VSCODE_E2E_SKIP_LIVE=1 VSCODE_E2E_SKIP_VSCODE=1
```

### Live llama.cpp E2E (optional)

Requires llama-server on `:8080` and built CLI:

```bash
VSCODE_LLAMA_E2E=1 LLAMACPP_API_URL=http://127.0.0.1:8080/v1 bun run test:llama-e2e
```

Compaction messages with `summary: true` render as **"Context compacted."** only — the anchored summary body is not shown in the webview.

## Visual regression (webview)

From repo root:

```powershell
bun run visual-test --suite=vscode
# or: cd packages/app && bunx playwright test --config e2e/visual/playwright.vscode.config.ts
```

Mocks `acquireVsCodeApi`, drives `chat.html` via postMessage, compares PNG baselines.

## Publishing

```bash
npx vsce package
npx vsce publish
```

## Roadmap

[FUTURE_IMPROVEMENTS.md](./FUTURE_IMPROVEMENTS.md) · [IMPROVEMENT_AND_FIX.md](../../IMPROVEMENT_AND_FIX.md)

## Requirements

- VS Code 1.94+
- Built `localcoder.exe` or Bun dev CLI
- `localcoder.packagePath` when not in monorepo layout
