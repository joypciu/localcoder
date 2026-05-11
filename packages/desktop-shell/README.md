# Desktop shell UI

SDK-first Solid.js UI for the LocalCoder desktop app (replaces the legacy OpenCode web shell).

## Develop

```bash
bun run typecheck
```

## E2E (live sidecar — no mock)

Playwright starts Vite on port 5199 and a real `localcoder serve` sidecar (seeded session + test provider).

```bash
bun run test:e2e:install   # once: Chromium
bun run test:e2e
```

From repo root: `bun run e2e:shell`

Skip live server seed: `E2E_SKIP_SHELL_LIVE=1` (tests will skip).

Tests cover: seeded session load, connected-only model list, permission banner dismiss on real server (`POST /permission/e2e/ask` when `LOCALCODER_CALLER=shell-e2e`).
