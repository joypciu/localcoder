# LocalCoder

**The open source AI coding agent.**
Runs in your terminal, edits your code, uses your tools.

---

## Release v1.14.38

This release focuses on **real-world Windows and VS Code installs** (not only monorepo dev tests).

- **npm:** `postinstall` links the Windows binary; `localcoder --version` works after `npm install -g localcoder`
- **GUI:** double-clicking `localcoder.exe` opens the desktop app (or browser UI); use `build:win-gui` to build it
- **VS Code:** extension starts `localcoder serve` from the built `.exe` or PATH
- **Desktop:** Electron build externalizes OAuth deps (CI can produce Win/Mac installers)

Tag **`v1.14.38`** triggers [GitHub Actions](.github/workflows/release.yml) for Windows/macOS CLI and desktop artifacts.

Details: [IMPROVEMENT_AND_FIX.md](IMPROVEMENT_AND_FIX.md)


## What is LocalCoder?

LocalCoder is a terminal-first AI coding agent that works directly inside your development environment. It reads your files, runs commands, edits code, and manages sessions — all through a clean TUI and an optional VS Code chat panel.

Key characteristics:

- **Local-first** — runs on your machine, no data leaves unless you use a cloud model
- **Provider-agnostic** — works with Anthropic, OpenAI, Google, Bedrock, Azure, Groq, local models via llama.cpp/Ollama, and many others
- **Full tool access** — reads, writes, edits files; runs shell commands; searches; fetches web pages; delegates to sub-agents
- **Open source** — MIT licensed, no telemetry, no paywalled features

---

## Installation

### npm (recommended)

```bash
npm install -g localcoder
localcoder --version
```

See [INSTALL.md](INSTALL.md) for platform binaries and desktop installers.

### From source

```bash
git clone https://github.com/joypciu/localcoder.git
cd localcoder
bun install
bun run build
```

### CLI

```bash
# After building from source
bun run --cwd packages/localcoder start
```

---

## Desktop app (Electron)

Graphical app with the embedded web UI — same sessions and tools as the CLI.

- **Windows:** NSIS installer (`.exe`) from [Releases](https://github.com/joypciu/localcoder/releases)
- **macOS:** `.dmg` — open and drag LocalCoder to Applications

```bash
bun run dev:desktop          # dev mode
cd packages/desktop && bun run package:win   # Windows installer (on Windows)
```

See `packages/desktop/README.md`.

---

## VS Code Extension

A sidebar chat panel for VS Code with real-time tool call visualization.

**Features:**
- Activity Bar icon — click to open the chat panel in the sidebar (like GitHub Copilot or Claude Code)
- Full Markdown rendering with syntax-highlighted code blocks
- Collapsible tool cards (Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Agent…)
- Diff view for file edits, shell stdout/stderr coloring, reasoning blocks
- **Undo last changes** — after each AI response, see which files changed and revert them with one click (no git required)
- Switch between the localcoder local agent and any OpenAI-compatible API
- First-run setup wizard — picks a free provider (Gemini, Groq, Ollama) on first open
- Session history and active file context

**Open the panel:** Click the LocalCoder icon in the Activity Bar, or `Ctrl+Shift+L` (Windows/Linux) / `Cmd+Shift+L` (macOS)

See `sdks/vscode/README.md` for setup, publishing, and development instructions.

---

## Agents

LocalCoder ships with two built-in agents. Switch between them with `Tab`.

| Agent | Description |
|---|---|
| **build** | Default. Full read/write access for active development. |
| **plan** | Read-only. Denies file edits by default, asks before running commands. Use it to explore an unfamiliar codebase or plan changes before committing. |

A **general** sub-agent handles complex searches and multi-step tasks internally. You can invoke it explicitly with `@general` in any message.

---

## CLI Keyboard Shortcuts (TUI)

| Shortcut | Action |
|---|---|
| `Enter` | Send message |
| `Ctrl+Enter` or `Ctrl+J` | Insert newline (Shift+Enter alternative — most terminals can't distinguish Shift+Enter from Enter) |
| `<leader>u` (usually `\u`) | Undo last message + revert all file changes it made |
| `<leader>r` | Redo (un-revert) |
| `Tab` | Switch between agents |

---

## Undo / Revert

### VS Code Extension
After every AI response that modifies files, a **changes bar** appears in the chat showing which files were created or updated. Click **↩ Revert all** to restore them. No git needed — uses VS Code's native undo stack.

### CLI (TUI)
Press `<leader>u` (usually `\u`) to undo the last message and revert all file changes it made. The CLI uses its own snapshot system to track file states per turn.

---

## Providers

LocalCoder works with any provider supported by the Vercel AI SDK:

Anthropic · OpenAI · Google Gemini · Amazon Bedrock · Azure OpenAI · Cohere · Mistral · xAI · Groq · Together AI · Fireworks · Perplexity · DeepSeek · Ollama · llama.cpp · and more.

**Free options to get started:**
- Google Gemini Flash — free tier at aistudio.google.com
- Groq — free tier at console.groq.com
- Ollama — fully local, no API key needed

See `packages/localcoder/README.md` for model configuration details.

---

## Project Structure

```
localcoder/
├── packages/
│   ├── localcoder/   Core CLI, HTTP server, agent loop, storage
│   ├── app/          Web UI (SolidJS)
│   ├── desktop/      Electron desktop app (rich UI)
│   ├── slack/        Slack bot integration
│   ├── docs/         Documentation site
│   └── web/          Marketing site
└── sdks/
    └── vscode/       VS Code extension
```

---

## Contributing

Read `CONTRIBUTING.md` before opening a pull request. The short version:

- File an issue first for anything beyond a small bug fix
- Default branch is `dev` — open PRs against `dev`, not `main`
- Run `bun install` and `bun run typecheck` before submitting
- Follow the style guide in `AGENTS.md`

---

## Building on LocalCoder

If your project uses "localcoder" in its name (e.g. `localcoder-dashboard`), please note in your README that it is not affiliated with the LocalCoder team.

---

## FAQ

**How is this different from Claude Code?**

The core capability is similar. The differences:

- 100% open source (MIT)
- Not tied to a single AI provider — bring your own key or use any compatible endpoint
- Built-in LSP support
- Terminal-first TUI
- Client/server architecture — run LocalCoder on a remote machine and drive it from a mobile app or web browser

**Does Shift+Enter work for inserting newlines in the terminal?**

Most terminal emulators send the same byte sequence for Shift+Enter and plain Enter, so they can't be distinguished. Use `Ctrl+Enter` or `Ctrl+J` instead — both insert a newline in the TUI prompt.

## Chat history and reuse

| Surface | Feature |
|---------|---------|
| **TUI** | Recent sessions on home, `/sessions` or `Ctrl+X L`, `localcoder --continue`, prompt history (`↑`/`↓` in input) |
| **VS Code** | Session list (header), auto-resume last chat per workspace, `↑`/`↓` for past prompts |
| **OpenAI mode** | Conversations saved in extension state between restarts |

Model and provider choices are remembered in `~/.localcoder/model.json` and `config.json` after you set them up.
