# LocalCoder VS Code Extension

AI coding agent in VS Code — sidebar chat, live tool streaming, file edits with undo, terminal TUI bridge.

**Tests:** 84/84 passing (`bun run test`)

## Features

- **Activity Bar** — LocalCoder icon opens sidebar chat
- **Live streaming** — tokens and tools via SSE
- **Tool cards** — Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Agent
- **Undo** — revert all per turn, or per-file on the changes bar
- **@ mentions** — workspace file autocomplete
- **Build / Plan** — agent mode selector
- **Multi-backend** — LocalCoder agent or OpenAI-compatible API
- **llama.cpp** — `LocalCoder: Set up llama.cpp` command + first-run wizard option
- **Terminal TUI** — `Ctrl+Esc` with filepath bridge

Desktop app has matching click-to-undo for file tools (see `packages/desktop/README.md`).

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+L` | Open chat panel |
| `Ctrl+Shift+U` | Undo last agent file changes |
| `Ctrl+Shift+A` | Add selection to chat |
| `Ctrl+Esc` | Open LocalCoder terminal |
| `Ctrl+Shift+Esc` | New terminal tab |
| `Ctrl+Alt+K` | Insert active filepath into terminal |

## Quick start

1. Clone [localcoder](https://github.com/joypciu/localcoder)
2. `cd sdks/vscode && bun install`
3. From repo root: `bun run install:cli` (or `bun run build:win` in `packages/localcoder`)
4. Press **F5** in VS Code
5. Open a workspace → click **LocalCoder** in the Activity Bar

### Settings (`localcoder.*`)

| Setting | Description |
|---------|-------------|
| `packagePath` | Path to `packages/localcoder` |
| `bunPath` | Path to `bun` |
| `defaultAgent` | `build` or `plan` |
| `openDiffOnEdit` | Open editor after agent edits |

## Development

```bash
cd sdks/vscode
bun install
bun run compile
bun run test:unit
bun run test
```

From repo root: `bun run scripts/vscode-extension-e2e.ts`

## Publishing

```bash
npx vsce package
npx vsce publish
```

## Roadmap

[FUTURE_IMPROVEMENTS.md](./FUTURE_IMPROVEMENTS.md) · [IMPROVEMENT_AND_FIX.md](../../IMPROVEMENT_AND_FIX.md)

## Requirements

- VS Code 1.94+
- Bun (LocalCoder backend) or built `localcoder.exe`
- `localcoder.packagePath` when not in monorepo layout
