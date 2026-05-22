# LocalCoder

**The open source AI coding agent.**  
Runs in your terminal, edits your code, uses your tools — with an optional desktop app and VS Code extension.

---

## Release v1.14.43

Recent highlights:

- **Desktop UI** — Cursor-style theme (default), flat IDE chrome, Inter typography, click-to-undo for LLM file changes (per tool and per turn)
- **Portable Windows app** — single `LocalCoder-*-portable.exe`; `bun run build:win-standalone` (~2–4 min)
- **llama.cpp** — in-app setup wizard, auto-discover b9284 bins, Qwopus/Qwen3.5 agent fixes (16k ctx, tool-loop exit)
- **Global CLI** — `npm install -g localcoder` or `bun run install:cli` from source; Windows embeds the native binary
- **VS Code** — sidebar chat, live tool streaming, undo per turn / per file

Tag **`v*`** triggers [GitHub Actions](.github/workflows/release.yml) for Windows/macOS CLI, desktop installers, and npm.

Details: [IMPROVEMENT_AND_FIX.md](IMPROVEMENT_AND_FIX.md) · Install: [INSTALL.md](INSTALL.md)

---

## What is LocalCoder?

LocalCoder is an AI coding agent that runs on your machine. It reads files, runs commands, edits code, and manages sessions through a terminal TUI, a desktop app, or a VS Code panel.

| Trait | Detail |
|-------|--------|
| **Local-first** | Runs on your machine; data stays local unless you use a cloud model |
| **Provider-agnostic** | Anthropic, OpenAI, Google, Bedrock, Groq, Ollama, llama.cpp, and more |
| **Full tool access** | Read, write, edit, bash, search, web, sub-agents |
| **Open source** | MIT licensed |

---

## Installation

### npm (recommended)

```bash
npm install -g localcoder
localcoder --version
```

See [INSTALL.md](INSTALL.md) for platform binaries, desktop installers, and troubleshooting.

### From source (monorepo)

```bash
git clone https://github.com/joypciu/localcoder.git
cd localcoder
bun install
bun run install:cli          # build Windows CLI + global install (on Windows)
# or
bun run --cwd packages/localcoder dev
```

---

## Surfaces

| Surface | Best for |
|---------|----------|
| **CLI / TUI** | Terminal-first workflow, remote server, scripting |
| **Desktop** | Rich UI, llama.cpp wizard, no terminal required |
| **VS Code** | In-editor chat, diff view, selection context |
| **Web UI** | Browser client when `localcoder serve` is running |

---

## Desktop app (Electron)

Graphical app with the same agent as the CLI.

| Artifact | Path / source |
|----------|-----------------|
| **Portable exe** | `packages/desktop/dist/LocalCoder-*-portable.exe` after `bun run build:win-standalone` |
| **Releases** | [GitHub Releases](https://github.com/joypciu/localcoder/releases) |

```powershell
# Build portable (from repo root)
bun run build:win-standalone

# Fast dev pack (unpacked exe only, ~1 min)
$env:LOCALCODER_FAST_PACK = "1"
bun run build:win-standalone
```

Features: Cursor-style default theme, session chat, file review panel, **Undo change** on each file tool, **Undo all changes** on turn summaries, llama.cpp setup wizard.

See [packages/desktop/README.md](packages/desktop/README.md).

---

## VS Code extension

Sidebar chat with live tool streaming and file undo.

| Feature | Detail |
|---------|--------|
| **Open panel** | Activity Bar icon or `Ctrl+Shift+L` / `Cmd+Shift+L` |
| **Undo** | Revert all changes per turn, or per-file on the changes bar |
| **Backends** | LocalCoder agent (default) or OpenAI-compatible API |
| **Setup** | First-run wizard; llama.cpp via `LocalCoder: Set up llama.cpp` |

See [sdks/vscode/README.md](sdks/vscode/README.md).

---

## Agents

Switch with `Tab` in the TUI or the header selector in VS Code / desktop.

| Agent | Description |
|-------|-------------|
| **build** | Default — full read/write access |
| **plan** | Read-only exploration; asks before destructive commands |

Use `@general` to delegate complex multi-step tasks to a sub-agent.

---

## Undo / revert

| Surface | How |
|---------|-----|
| **Desktop** | **Undo change** on completed Write/Edit/Patch tools; **Undo all changes** on turn diff header; revert dock lists affected files |
| **VS Code** | Changes bar after each turn — **Revert all** or per-file undo |
| **CLI (TUI)** | `<leader>u` (usually `\u`) to undo last message + revert files; `<leader>r` to redo |

All surfaces use LocalCoder's snapshot system — no git required.

---

## Providers

Anthropic · OpenAI · Google Gemini · Amazon Bedrock · Azure · Cohere · Mistral · xAI · Groq · Together · Fireworks · Perplexity · DeepSeek · Ollama · **llama.cpp** · and more.

**Free / local options:**

- Google Gemini Flash — [aistudio.google.com](https://aistudio.google.com)
- Groq — [console.groq.com](https://console.groq.com)
- Ollama or llama.cpp — fully local, no API key

Configure models in the app setup wizard, VS Code settings, or `~/.localcoder/`. See [packages/localcoder/README.md](packages/localcoder/README.md).

---

## CLI keyboard shortcuts (TUI)

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Ctrl+Enter` / `Ctrl+J` | Newline (Shift+Enter is not distinguishable in most terminals) |
| `<leader>u` | Undo last message + revert file changes |
| `<leader>r` | Redo |
| `Tab` | Switch agents |

---

## Project structure

```
localcoder/
├── packages/
│   ├── localcoder/   CLI, HTTP server, agent loop, llama.cpp module
│   ├── app/          Web / desktop UI (SolidJS)
│   ├── desktop/      Electron shell + portable build
│   ├── ui/           Shared components and themes
│   └── …
└── sdks/
    └── vscode/       VS Code extension
```

---

## Contributing

Read `CONTRIBUTING.md` before opening a pull request.

- File an issue first for non-trivial changes
- Default branch is **`dev`** — open PRs against `dev`
- Run `bun install` and `bun run typecheck` before submitting
- Style guide: [AGENTS.md](AGENTS.md)

---

## FAQ

**How is this different from Claude Code or Cursor?**

Similar agent capabilities, but LocalCoder is fully open source (MIT), provider-agnostic, terminal-first, and includes LSP support. You can run the server remotely and connect from desktop, web, or mobile clients.

**Does Shift+Enter insert a newline in the terminal?**

Usually not — most terminals send the same bytes for Shift+Enter and Enter. Use `Ctrl+Enter` or `Ctrl+J` in the TUI.

**Chat history?**

| Surface | Resume |
|---------|--------|
| TUI | Recent sessions on home, `/sessions`, `localcoder --continue` |
| VS Code | Session list in header; auto-resume per workspace |
| Desktop | Same server sessions as CLI |

Model choices persist in `~/.localcoder/model.json` and related config files.
