# LocalCoder CLI

Core package: terminal agent, HTTP server, agent loop, storage, llama.cpp integration.

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
- **Env overrides:** `LOCALCODER_LLAMACPP_DIR`, `LOCALCODER_LLAMACPP_MODEL`, `LLAMACPP_CTX`

TUI: `/llama`, `/context`, `/compact`

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
