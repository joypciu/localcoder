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
- llama.cpp setup wizard, provider selection
- File review side panel

## E2E testing

```bash
bunx playwright install chromium
bun run --cwd packages/app test:e2e:local
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PLAYWRIGHT_SERVER_HOST` | `localhost` | Backend host |
| `PLAYWRIGHT_SERVER_PORT` | `4096` | Backend port |

Build output: static `dist/` for any static host or Electron renderer bundle.
