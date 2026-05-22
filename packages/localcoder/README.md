# LocalCoder CLI

Core package: terminal agent, HTTP server, agent loop, storage, llama.cpp integration.

## Development

```bash
bun run --cwd packages/localcoder dev          # dev CLI (Bun)
bun run --cwd packages/localcoder typecheck
bun run --cwd packages/localcoder test
bun run --cwd packages/localcoder build        # all platforms (slow)
bun run --cwd packages/localcoder build:win    # Windows binary only
```

## Global install from monorepo (Windows)

```powershell
# From repo root
bun run install:cli

# Or manually
cd packages/localcoder
bun run build:win
bun run prepare:npm
npm install -g ./dist/npm/localcoder
```

Install **only** from `dist/npm/localcoder` — not `packages/localcoder` directly.

## HTTP server

```bash
localcoder serve --port 4096 --hostname 127.0.0.1
```

| Endpoint | Description |
|----------|-------------|
| `GET /global/health` | Health check |
| `GET /global/event` | SSE event stream |
| `POST /session` | Create session |
| `POST /session/:id/message` | Send message |
| `GET /global/llamacpp/*` | llama.cpp setup and control |

## Local models (llama.cpp)

1. Install `llama-server` and a `.gguf` model.
2. Run `localcoder llamacpp setup` or use the desktop / VS Code wizard.
3. Config: `~/.localcoder/llamacpp.json` (paths, ctx, MTP, thinking).

Env overrides: `LOCALCODER_LLAMACPP_DIR`, `LOCALCODER_LLAMACPP_MODEL`, `LLAMACPP_CTX` (default 16384).

TUI: `/llama`, `/context`, `/compact`.

## npm publish

```bash
bun run build:win
bun run prepare:npm              # local: embeds binary
bun run prepare:npm:registry     # semver optional deps for npmjs
cd dist/npm/localcoder && npm publish --access public
```

Published as [`localcoder`](https://www.npmjs.com/package/localcoder) with platform packages `localcoder-windows-x64`, etc.

## Session history

- Home screen: recent sessions
- `/sessions` or `localcoder --continue`
- State: `~/.localcoder/last-session.json`, `prompt-history.jsonl`
