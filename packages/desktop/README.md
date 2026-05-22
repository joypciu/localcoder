# LocalCoder Desktop

**Standalone Windows GUI** — one portable `.exe`, no Bun/CLI/terminal required at runtime.

Embeds Electron + SolidJS UI + LocalCoder server (in-process). Double-click to run.

## End users

Download **`LocalCoder-*-portable.exe`** from [GitHub Releases](https://github.com/joypciu/localcoder/releases).

1. Download the portable exe
2. Double-click — no install, no dependencies
3. Set up cloud API or local llama.cpp (folder + GGUF) in the wizard

User data: `%APPDATA%\ai.localcoder.desktop\`

### UI highlights (v1.14.43+)

- Cursor-style default theme, flat IDE layout
- **Undo change** on each Write/Edit/Patch tool
- **Undo all changes** on turn diff summaries
- llama.cpp setup dialog with model discovery

---

## Build portable exe (developers)

From repo root:

```powershell
cd P:\localcoder
bun install
bun run build:win-standalone
```

Output: `packages\desktop\dist\LocalCoder-<version>-portable.exe`

### Fast iteration

```powershell
$env:LOCALCODER_FAST_PACK = "1"
bun run build:win-standalone
# Run: packages\desktop\dist\win-unpacked\LocalCoder.exe
```

Full portable build ~2–4 min. Packaging uses `.pack-tmp` first to avoid antivirus locks on the output exe.

Does **not** bundle llama.cpp or GGUF models — users select paths in the setup wizard.

---

## Development

```bash
bun run --cwd packages/desktop dev
```

## Other Windows artifacts

```powershell
cd packages/desktop
bun run prebuild && bun run build
$env:LOCALCODER_CHANNEL = "prod"
bun run package:win-portable   # portable only
bun run package:win            # portable + NSIS installer
```

## macOS / Linux

See `electron-builder.config.ts` — `package:mac`, `package:linux`.

## Updates

Production builds use `electron-updater` and GitHub Releases.
