# LocalCoder

**The open source AI coding agent.**
Runs in your terminal, edits your code, uses your tools.

---

## What is LocalCoder?

LocalCoder is a terminal-first AI coding agent that works directly inside your development environment. It reads your files, runs commands, edits code, and manages sessions — all through a clean TUI and an optional VS Code chat panel.

Key characteristics:

- **Local-first** — runs on your machine, no data leaves unless you use a cloud model
- **Provider-agnostic** — works with Anthropic, OpenAI, Google, Bedrock, Azure, Groq, local models via llama.cpp/Ollama, and many others
- **Full tool access** — reads, writes, edits files; runs shell commands; searches; fetches web pages; delegates to sub-agents
- **Open source** — MIT licensed, no telemetry, no paywalled features

---

## Installation

### From source

```bash
git clone <repo-url>
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

## VS Code Extension

A sidebar chat panel for VS Code with real-time tool call visualization.

**Features:**
- Full Markdown rendering with syntax-highlighted code blocks
- Collapsible tool cards (Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Agent…)
- Diff view for file edits, shell stdout/stderr coloring, reasoning blocks
- Switch between the localcoder local agent and any OpenAI-compatible API
- Session history, active file context, message copy/rating

**Open the panel:** `Ctrl+Shift+L` (Windows/Linux) or `Cmd+Shift+L` (macOS)

See `sdks/vscode/README.md` for setup and development instructions.

---

## Agents

LocalCoder ships with two built-in agents. Switch between them with `Tab`.

| Agent | Description |
|---|---|
| **build** | Default. Full read/write access for active development. |
| **plan** | Read-only. Denies file edits by default, asks before running commands. Use it to explore an unfamiliar codebase or plan changes before committing. |

A **general** sub-agent handles complex searches and multi-step tasks internally. You can invoke it explicitly with `@general` in any message.

---

## Providers

LocalCoder works with any provider supported by the Vercel AI SDK:

Anthropic · OpenAI · Google Gemini · Amazon Bedrock · Azure OpenAI · Cohere · Mistral · xAI · Groq · Together AI · Fireworks · Perplexity · DeepSeek · Ollama · llama.cpp · and more.

See `packages/localcoder/README.md` for model configuration details.

---

## Project Structure

```
localcoder/
├── packages/
│   ├── localcoder/   Core CLI, HTTP server, agent loop, storage
│   ├── app/          Web UI (SolidJS)
│   ├── desktop/      Native desktop app (Tauri v2)
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
