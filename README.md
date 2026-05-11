# LocalCoder

**The open source AI coding agent.**  
Runs in your terminal, edits your code, uses your tools — with an optional desktop app and VS Code extension.

---

## Release highlights (v1.14.46)

- **Zero-config providers** — llama.cpp, OpenRouter, OpenCode Go, and 50+ others via guided wizards (no manual JSON)
- **llama.cpp** — pick any folder with `llama-server`, any `.gguf`, context size, and thinking mode; LocalCoder starts the server for you
- **Portable Windows app** — `LocalCoder-*-portable.exe` via `bun run build:win-standalone` (~2–4 min)
- **VS Code** — sidebar chat, live streaming, undo per turn/file, first-run provider wizard
- **CLI** — simple text REPL by default; `/providers` and `/model` (connected providers only); `localcoder tui` for legacy TUI

See [IMPROVEMENT_AND_FIX.md](IMPROVEMENT_AND_FIX.md) · Install: [INSTALL.md](INSTALL.md)

### E2E & visual tests (Windows)

```powershell
bun run visual-test      # TUI snapshots + VS Code webview + app UI screenshots
bun run visual-test:update   # refresh baselines after intentional UI changes
bun run e2e:smoke        # ~30–60s — compile + unit + visual-smoke + CLI smoke (no llama)
bun run e2e              # ~2–4 min — standard: CLI + llama + agent + VS Code + visual-standard
bun run e2e:full         # ~10–30 min — portable build, headed exe, live llama VS Code E2E
bun run e2e:shell        # desktop-shell Playwright vs live `localcoder serve` (no mock UI)
```

Set `LOCALCODER_LLAMACPP_DIR` / `LOCALCODER_LLAMACPP_MODEL` if paths differ, or run `localcoder llamacpp setup` once. Use `E2E_SKIP_BUILD=1`, `E2E_SKIP_VISUAL=1`, `E2E_SKIP_LLAMA=1` to skip steps.

---

## What is LocalCoder?

LocalCoder is an AI coding agent that runs on your machine. It reads files, runs commands, edits code, and manages sessions through a terminal TUI, a desktop app, or a VS Code panel.

| Trait | Detail |
|-------|--------|
| **Local-first** | Runs on your machine; data stays local unless you use a cloud model |
| **Provider-agnostic** | OpenRouter, OpenCode Go, Anthropic, OpenAI, Groq, Ollama, llama.cpp, Fireworks, and more |
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
bun run install:cli          # Windows: build CLI + global install
# or
bun run --cwd packages/localcoder dev
```

---

## Surfaces

| Surface | Best for |
|---------|----------|
| **CLI** (default) | Simple text REPL — `/providers`, `/model`, `!shell`, `@files` |
| **CLI TUI** (`localcoder tui`) | Full-screen terminal UI (legacy OpenTUI) |
| **Desktop** | Rich UI, llama.cpp wizard, no terminal required |
| **VS Code** | In-editor chat, diff view, selection context |
| **Web UI** | Browser client when `localcoder serve` is running |

---

## Providers (zero-config)

You should not need to edit config files or run llama-server manually.

| Provider | Setup |
|----------|--------|
| **llama.cpp** | Desktop / VS Code / CLI wizard — folder + `.gguf` + context |
| **OpenRouter** | Paste API key in VS Code or `localcoder auth set-api -p openrouter -k …` |
| **OpenCode Go** | Same — key stored in `~/.localcoder/auth.json` |
| **Groq, Gemini, Ollama** | First-run wizard in VS Code or `localcoder auth login` |

### llama.cpp (local GGUF)

```powershell
# Interactive wizard (no flags required)
localcoder llamacpp setup

# Or with paths
localcoder llamacpp setup --dir "C:\path\to\llama.cpp\bin" --model "D:\models\model.gguf" --ctx 16384
```

Config is saved to `~/.localcoder/llamacpp.json`. The server auto-starts on next launch.

**After changing context size**, restart the server so `-c` takes effect: TUI `/llama` → **Restart server with saved config**, or `localcoder llamacpp setup` again. Context presets: 4096–131072.

### Cloud API keys

```powershell
localcoder auth set-api --provider openrouter --key YOUR_KEY
localcoder auth set-api --provider opencode-go --key YOUR_KEY
localcoder models                    # list available models
localcoder run -m opencode-go/deepseek-v4-flash "Say hi"
```

---

## Desktop app (Electron)

Graphical app with the same agent as the CLI.

| Artifact | How to get it |
|----------|----------------|
| **Portable exe** | `packages/desktop/dist/LocalCoder-*-portable.exe` after `bun run build:win-standalone` |
| **Releases** | [GitHub Releases](https://github.com/joypciu/localcoder/releases) |

```powershell
bun run build:win-standalone
# Fast dev pack (~1 min): $env:LOCALCODER_FAST_PACK = "1"; bun run build:win-standalone
```

Features: Cursor-style theme, session chat, click-to-undo on file tools, llama.cpp setup with context size.

See [packages/desktop/README.md](packages/desktop/README.md).

---

## VS Code extension

Sidebar chat with live tool streaming and file undo.

| Feature | Detail |
|---------|--------|
| **Open panel** | Activity Bar icon or `Ctrl+Shift+L` |
| **First-run** | llama.cpp, OpenRouter, OpenCode Go, Groq, Gemini, Ollama |
| **Settings (⚙)** | Set up llama.cpp · Connect cloud provider |
| **Commands** | `LocalCoder: Set up llama.cpp`, `LocalCoder: Connect cloud provider` |
| **Undo** | Revert all per turn, or per-file on the changes bar |

See [sdks/vscode/README.md](sdks/vscode/README.md).

---

## Agents

| Agent | Description |
|-------|-------------|
| **build** | Default — full read/write access |
| **plan** | Read-only exploration; asks before destructive commands |

Switch with `Tab` in the TUI or the header selector in VS Code / desktop. Use `@general` for sub-agent delegation.

---

## Undo / revert

| Surface | How |
|---------|-----|
| **Desktop** | **Undo change** on Write/Edit tools; **Undo all changes** on turn header |
| **VS Code** | Changes bar — **Revert all** or per-file undo |
| **CLI (TUI)** | `<leader>u` undo; `<leader>r` redo |

No git required — uses LocalCoder's snapshot system.

---

## CLI keyboard shortcuts (TUI)

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Ctrl+Enter` / `Ctrl+J` | Newline |
| `<leader>u` | Undo last message + revert files |
| `<leader>r` | Redo |
| `Tab` | Switch agents |

---

## Project structure

```
localcoder/
├── packages/
│   ├── localcoder/   CLI, HTTP server, agent loop, llama.cpp module
│   ├── app/          Web / desktop UI (SolidJS) + Playwright visual tests
│   ├── desktop/      Electron shell + portable build
│   └── ui/           Shared components and themes
├── scripts/
│   ├── e2e/          Unified E2E runner (smoke / standard / full)
│   └── visual-test/  Visual regression (TUI + webview + app)
└── sdks/
    └── vscode/       VS Code extension
```

---

## Contributing

Read `CONTRIBUTING.md` before opening a pull request.

- Default branch: **`dev`**
- Run `bun install` and `bun run typecheck` before submitting
- Style guide: [AGENTS.md](AGENTS.md)

---

## FAQ

**How is this different from Claude Code or Cursor?**

Open source (MIT), provider-agnostic, terminal-first, with LSP support. Run the server locally or remotely; connect from desktop, web, or VS Code.

**Do I need to run llama-server myself?**

No. After the one-time wizard, LocalCoder saves paths and starts `llama-server` automatically.

**Chat history?**

| Surface | Resume |
|---------|--------|
| TUI | Recent sessions, `/sessions`, `localcoder --continue` |
| VS Code | Session list in header; auto-resume per workspace |
| Desktop | Same server sessions as CLI |
