# LocalCoder CLI

Core package: terminal agent, HTTP server, agent loop, storage, llama.cpp integration.

## Simple CLI (default)

```bash
localcoder                    # text REPL in cwd
localcoder /path/to/project
localcoder tui                # legacy full-screen TUI
```

| Command | Description |
|---------|-------------|
| `/connect` | llama.cpp setup or cloud `providers login` |
| `/llama` | llamacpp status / setup / start / stop |
| `/providers` or `/connectors` | List providers; pick a connected one |
| `/model [provider/model]` | Pick a model (connected providers only) |
| `/agent [name]` | Pick agent (build, plan, …) |
| `/context` | Token usage for the active session |
| `/sessions`, `/resume`, `/fork`, `/compact` | Session management |
| `/permissions` | Cycle ask → accept → reject |
| `!cmd` | Run a shell command locally |
| `@file` | Attach files to the next message |

Ctrl+C aborts the current turn (second Ctrl+C exits).

## Windows shells (cmd vs PowerShell)

**PowerShell** (recommended):

```powershell
cd P:\localcoder\packages\localcoder
bun run dev
```

**Command Prompt (`cmd.exe`)** — `cd` does not switch drives unless you use `/d`. Do not paste the `PS` from a PowerShell prompt into cmd.

```cmd
cd /d P:\localcoder\packages\localcoder
bun run dev
```

Or change drive first: `P:` then `cd \localcoder\packages\localcoder`.

## Development

```bash
bun run --cwd packages/localcoder dev
bun run --cwd packages/localcoder typecheck
bun run --cwd packages/localcoder test
bun run --cwd packages/localcoder build:win    # Windows binary only
```

## Global install (Windows)

```powershell
# From repo root
bun run install:cli
```

Install only from `dist/npm/localcoder` — not `packages/localcoder` directly.

## HTTP server

```bash
localcoder serve --port 4096 --hostname 127.0.0.1
```

| Endpoint | Description |
|----------|-------------|
| `GET /global/health` | Health check |
| `GET /global/event` | SSE event stream |
| `POST /session` | Create session |
| `POST /session/:id/message` | Send message (sync — returns when done) |
| `GET/POST /global/llamacpp/*` | llama.cpp status, setup, start, stop, thinking |

## Providers

### Cloud API keys

```powershell
localcoder auth login                    # interactive
localcoder auth set-api -p openrouter -k KEY   # non-interactive (IDE wizards)
localcoder auth list
localcoder models
localcoder run -m opencode-go/deepseek-v4-flash "Hello"
```

Supported out of the box: OpenRouter, OpenCode Go, Fireworks, Groq, Anthropic, OpenAI, and 50+ via [models.dev](https://models.dev) snapshot.

Invalid model names fail immediately with suggestions:

```powershell
localcoder run -m invalid-provider/fake "test"   # ~2s error, not a hang
```

### llama.cpp (local GGUF)

Interactive wizard — no flags required:

```powershell
localcoder llamacpp setup
```

Or explicit:

```powershell
localcoder llamacpp setup --dir "C:\llama.cpp\bin" --model "D:\models\model.gguf" --ctx 16384 --thinking true
localcoder llamacpp status
localcoder llamacpp stop
```

- **Config:** `~/.localcoder/llamacpp.json` (paths, ctx, MTP, thinking, autoStart)
- **Autostart:** server starts automatically on `localcoder serve` / desktop / VS Code when configured
- **Context restart:** changing ctx in wizard updates config + provider; use **Restart server** so `llama-server -c` matches (see `/llama` menu)
- **Env overrides:** `LOCALCODER_LLAMACPP_DIR`, `LOCALCODER_LLAMACPP_MODEL`, `LLAMACPP_CTX`

TUI: `/connect`, `/llama`, `/sessions`, `/context`, `/compact`

### Visual regression (TUI dialogs)

```powershell
cd packages/localcoder
bun test test/visual
# Update baselines: $env:VISUAL_UPDATE=1; bun test test/visual
```

From repo root: `bun run visual-test`

## Session commands

```powershell
localcoder session list -n 10
localcoder session search "query"
localcoder run -c "continue last session"
```

## npm publish

```bash
bun run build:win
bun run prepare:npm
cd dist/npm/localcoder && npm publish --access public
```

Published as [`localcoder`](https://www.npmjs.com/package/localcoder) with platform packages `localcoder-windows-x64`, etc.

## Windows E2E smoke

```powershell
bun run scripts/e2e-full-windows.ts
# Skip slow steps: $env:E2E_SKIP_BUILD=1; $env:E2E_SKIP_LLAMA=1
```
