# localcoder app

The web UI for localcoder — a SolidJS single-page application that serves as the browser-based front-end for the localcoder agent.

## Development

Requires a running localcoder server (default `localhost:4096`).

```bash
# From the monorepo root
bun run --cwd packages/app dev       # Vite dev server on http://localhost:3000
bun run --cwd packages/app build     # Production build → dist/
```

## E2E Testing

Playwright starts the Vite dev server automatically and connects to a localcoder backend.

```bash
bunx playwright install chromium
bun run --cwd packages/app test:e2e:local
bun run --cwd packages/app test:e2e:local -- --grep "settings"
```

Environment options:

| Variable | Default | Description |
|---|---|---|
| `PLAYWRIGHT_SERVER_HOST` | `localhost` | localcoder backend host |
| `PLAYWRIGHT_SERVER_PORT` | `4096` | localcoder backend port |
| `PLAYWRIGHT_PORT` | `3000` | Vite dev server port |
| `PLAYWRIGHT_BASE_URL` | auto | Override the full base URL |

## Deployment

Build produces a static `dist/` folder deployable to any static host (Netlify, Vercel, S3, Cloudflare Pages, etc.).
