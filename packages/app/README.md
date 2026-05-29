# LocalCoder App

SolidJS web UI for LocalCoder — used in the browser and embedded in the Electron desktop app.

## Development

Requires a running LocalCoder server (default `localhost:4096`).

```bash
bun run --cwd packages/app dev       # Vite dev server
bun run --cwd packages/app build     # production build
```

For desktop-embedded UI, use `bun run dev:desktop` from the repo root.

## Features (desktop)

- Cursor-style default theme, flat IDE layout
- Session chat with tool diffs and **click-to-undo** for file changes
- **llama.cpp setup dialog** — folder picker, GGUF list, context size, thinking toggle
- Provider selection and model picker
- File review side panel

## E2E & visual testing

```bash
# App smoke (Playwright + Vite)
bunx playwright install chromium
bun run --cwd packages/app test:e2e:local

# Visual regression (screenshots) — from repo root
bun run visual-test
bun run visual-test:update    # refresh baselines
```

Visual specs live in `packages/app/e2e/visual/` (VS Code webview + app shell). TUI char-frame tests live in `packages/localcoder/test/visual/`.

| Variable | Default | Description |
|----------|---------|-------------|
| `PLAYWRIGHT_SERVER_HOST` | `localhost` | Backend host |
| `PLAYWRIGHT_SERVER_PORT` | `4096` | Backend port |
| `PLAYWRIGHT_PORT` | `3010` | Vite port for visual app tests |
| `E2E_SKIP_VISUAL` | — | Skip visual steps in unified E2E runner |

Build output: static `dist/` for any static host or Electron renderer bundle.

See [packages/desktop/README.md](../desktop/README.md) for portable build.
