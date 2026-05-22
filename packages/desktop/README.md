# LocalCoder Desktop

**Standalone Windows GUI** — one portable `.exe`, no Bun/CLI/terminal required at runtime.

Embeds Electron + SolidJS web UI + LocalCoder server (in-process). Users download a single file and double-click.

## End users (download only)

Get **`LocalCoder-x.y.z-portable.exe`** from [GitHub Releases](https://github.com/joypciu/localcoder/releases).

1. Download the portable exe
2. Double-click — the app opens (no install, no dependencies)
3. Use the in-app setup wizard (cloud API or local llama.cpp folder + GGUF)

User data is stored under `%APPDATA%\ai.localcoder.desktop\`.

## Build standalone portable exe (developers)

From repo root:

```powershell
cd P:\localcoder
bun install
bun run build:win-standalone
```

Output: `packages\desktop\dist\LocalCoder-<version>-portable.exe`

**Fast iteration** (skip portable compression — ~1–2 min, good for dev):

```powershell
$env:LOCALCODER_FAST_PACK = "1"
bun run build:win-standalone
# Double-click: packages\desktop\dist\win-unpacked\LocalCoder.exe
```

The full portable build compresses into one exe (~4–5 min). Packaging writes to `.pack-tmp` first, then moves into `dist`, so antivirus locks on an old portable exe should not hang the build.

This bundles everything needed at runtime. It does **not** include llama.cpp or GGUF models (too large) — users pick those in the setup wizard if they want local inference.

## Development

```bash
bun install
bun run --cwd packages/desktop dev
```

## Other Windows artifacts

```powershell
cd packages/desktop
bun run prebuild && bun run build
$env:LOCALCODER_CHANNEL = "prod"
bun run package:win-portable   # portable exe only
bun run package:win            # portable + NSIS installer
```

## macOS / Linux

See `electron-builder.config.ts` — `package:mac`, `package:linux`.

## Updates

Production builds use `electron-updater` and GitHub Releases.
