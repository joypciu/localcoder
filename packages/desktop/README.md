# LocalCoder Desktop

Native desktop app with **Electron** + **SolidJS** (embedded web UI from `packages/app`).

## Development

```bash
bun install
bun run ensure-icons   # from packages/desktop (optional; prebuild runs this)
bun run --cwd packages/desktop dev
```

Starts the Electron shell with hot reload via electron-vite.

## Build installers

```bash
cd packages/desktop
bun run prebuild    # CLI sidecar + icons
bun run build       # electron-vite production bundle
set LOCALCODER_CHANNEL=prod   # Windows CMD
bun run package:win           # NSIS installer (.exe)
bun run package:mac           # .dmg + .zip (macOS only)
```

Artifacts: `packages/desktop/dist/localcoder-desktop-*`

## Prerequisites

- [Bun](https://bun.sh)
- Windows: build on `windows-latest` (or local Windows)
- macOS: `.dmg` must be built on macOS (see `.github/workflows/release.yml`)

## Updates

Production builds use `electron-updater` and GitHub Releases (`joypciu/localcoder`).

## Build notes (v1.14.38)

OAuth helper packages (`mcp-oauth`, `poe-oauth`, etc.) are **externalized** in `electron.vite.config.ts` and in `packages/localcoder/script/build-node.ts` (same list as `script/build.ts`). This fixes Rollup errors when running `bun run build`.

```bash
cd packages/desktop
bun run prebuild   # builds ../localcoder/dist/node
bun run build      # electron-vite
LOCALCODER_CHANNEL=prod bun run package:win   # or package:mac on macOS
```

CI: push tag `v1.14.38` to run the desktop job in `.github/workflows/release.yml`.
