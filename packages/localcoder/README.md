# localcoder

The core package for the localcoder open source AI coding agent.

## What's in here

- **CLI binary** — the `localcoder` command
- **HTTP server** — Hono-based REST + SSE API (`serve` subcommand)
- **Agent loop** — multi-provider LLM agent with tool execution
- **Storage** — Drizzle ORM + SQLite (sessions, messages, tool calls)
- **PTY support** — cross-platform pseudo-terminal for terminal integration
- **MCP support** — Model Context Protocol server integration
- **30+ AI providers** — via the Vercel AI SDK (`@ai-sdk/*`)

## Development

```bash
# From the monorepo root
bun run --cwd packages/localcoder dev          # run the CLI in dev mode
bun run --cwd packages/localcoder typecheck    # type-check only
bun run --cwd packages/localcoder test         # run unit tests
bun run --cwd packages/localcoder test:ci      # run tests (CI mode, JUnit output)
bun run --cwd packages/localcoder build        # build distributable
```

## Running as a server

```bash
localcoder serve --port 4096 --hostname 127.0.0.1
```

The server exposes:

| Endpoint | Description |
|---|---|
| `GET /global/health` | Health check |
| `GET /global/event` | SSE stream for real-time events |
| `POST /session` | Create a new conversation session |
| `POST /session/:id/message` | Send a message and get an LLM response |
| `GET /api/session/:id/message` | Fetch all messages for a session |
| `POST /session/:id/abort` | Abort ongoing generation |

Authentication uses HTTP Basic Auth with auto-generated credentials when launched by the VS Code extension.

## Structure

```
src/
├── index.ts          CLI entry point
├── agent/            Agent loop and tool execution
├── server/           HTTP server (Hono + Bun/Node adapters)
├── storage/          Database schema, migrations, queries (Drizzle)
├── acp/              Agent Control Protocol
├── cli/              CLI subcommands
├── pty/              Pseudo-terminal support
├── auth/             Authentication helpers
└── bus/              Internal event bus
```

## Supported Providers

Anthropic, OpenAI, Google, Amazon Bedrock, Azure, Cohere, Mistral, xAI, Groq, Together AI, Fireworks, Perplexity, DeepSeek, and any OpenAI-compatible endpoint. Model selection is configured per-session.


## Local models (llama.cpp)

LocalCoder supports local GGUF models via [llama.cpp](https://github.com/ggml-org/llama.cpp):

1. Install `llama-server` and download a `.gguf` model.
2. In the TUI, run **`/llama`** → **Start server** (or set paths in `~/.localcoder/llamacpp.json`).
3. Optional env: `LOCALCODER_LLAMACPP_DIR`, `LOCALCODER_LLAMACPP_MODEL`, `LLAMACPP_CTX` (default 16384).

Use **`/context`** in a session to inspect token usage; **`/compact`** to summarize long sessions.


## npm publish

```bash
bun run build:win          # or build:mac on macOS
bun run prepare:npm        # local install (file: optional deps)
bun run prepare:npm:registry   # semver optional deps for npmjs
cd dist/npm/localcoder && npm install -g .
```

Published as [`localcoder`](https://www.npmjs.com/package/localcoder) with platform packages `localcoder-windows-x64`, `localcoder-darwin-arm64`, etc.
