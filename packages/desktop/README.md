# LocalCoder Desktop

**Standalone Windows GUI** — one portable `.exe`, no Bun/CLI/terminal required at runtime.

Embeds Electron + SolidJS UI + LocalCoder server (in-process). Double-click to run.

## End users

Download **`LocalCoder-*-portable.exe`** from [GitHub Releases](https://github.com/joypciu/localcoder/releases).

1. Download the portable exe
2. Double-click — no install, no dependencies
3. **First-run wizard:** cloud API key or local llama.cpp (any folder + any `.gguf`)

User data: `%APPDATA%\ai.localcoder.desktop\`

### Setup wizard (no manual config)

| Step | What you do | What LocalCoder does |
|------|-------------|----------------------|
| **llama.cpp** | Pick folder with `llama-server`, pick `.gguf`, set context size | Saves config, starts server, registers provider |
| **Cloud** | Paste API key (OpenRouter, etc.) | Stores in auth, lists models |

### UI (default: desktop-shell)

Windows builds use **`@localcoder-ai/desktop-shell`** — a small Solid.js UI on the LocalCoder SDK (sessions, streaming chat, tools). No legacy OpenCode web-app shell unless you opt in:

```powershell
$env:LOCALCODER_LEGACY_UI = "1"
bun run build
```

- Session sidebar, model picker (connected providers only), composer (Enter send / Shift+Enter newline)
- SDK event stream for live assistant output, tool lines, and permission prompts
- E2E: `cd packages/desktop-shell && bun run test:e2e` — Playwright against live `localcoder serve` (no mock UI)
- Legacy full IDE UI: set `LOCALCODER_LEGACY_UI=1` at build time

### UI highlights (legacy IDE)

- Cursor-style default theme, flat IDE layout
- **Undo change** on each Write/Edit/Patch tool
- **Undo all changes** on turn diff summaries
- llama.cpp dialog: browse paths, discovered GGUF list, context tokens, thinking toggle

---

## Build portable exe (developers)

From repo root:

```powershell
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

Full portable build ~2–4 min. Does **not** bundle llama.cpp or GGUF models.

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
bun run package:win-portable
bun run package:win            # portable + NSIS installer
```

## macOS / Linux

See `electron-builder.config.ts` — `package:mac`, `package:linux`.

## Updates

Production builds use `electron-updater` and GitHub Releases.
