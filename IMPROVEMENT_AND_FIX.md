# LocalCoder — Improvements, Fixes & Roadmap

**Updated:** 2026-05-22 · **Release:** v1.14.43+  
**VS Code tests:** `cd sdks/vscode && bun run test:all`  
**Windows E2E gate:** `bun run scripts/e2e-full-windows.ts`

---

## Executive summary

| Area | Status | Notes |
|------|--------|-------|
| TUI + llama.cpp | Production-ready | Shared module under `packages/localcoder/src/llamacpp/`; CLI `llamacpp setup` |
| Web / Desktop UI | **Rebranded** | LocalCoder LC monogram, `localcoder` default theme, home + setup wizard |
| VS Code extension | **llama.cpp wizard** | First-run + `localcoder.setupLlamaCpp`; spawns built `.exe` |
| npm / Windows CLI | **Fixed** | `postinstall` copies platform binary; Explorer double-click shows help |
| Desktop Electron | **Shippable** | `LocalCoder.exe` + NSIS installer; OAuth externals fixed |
| CI release | Tag-driven | `.github/workflows/release.yml` — Win/Mac CLI + desktop + npm |

---

## v1.14.43 — llama.cpp everywhere + LocalCoder identity

### Shared llama.cpp module
- **Config:** `~/.localcoder/llamacpp.json` (llama dir, GGUF path, autoStart, ctx, MTP).
- **API:** `GET/POST /global/llamacpp/{status,setup,start,stop}` on `localcoder serve`.
- **Auto-start:** `maybeAutoStartLlamaCpp()` after server listen when `autoStart` is set.
- **CLI:** `localcoder llamacpp setup|status|stop` — configure provider + start `llama-server`.

### App / Desktop UI
- LC monogram logo, favicon v3, enhanced `localcoder` theme (default).
- Home page: “Set up local llama.cpp” + “Connect cloud provider”.
- In-app wizard: browse llama.cpp folder + GGUF, discovered models list.

### VS Code extension
- First-run option: **Local — llama.cpp (GGUF)** — folder + file pickers, runs `localcoder.exe llamacpp setup`.
- Command: **LocalCoder: Set up llama.cpp** (`localcoder.setupLlamaCpp`).
- Backend still prefers `dist/localcoder-windows-x64/bin/localcoder.exe`.

### Desktop app
- Unpacked: `packages/desktop/dist/win-unpacked/LocalCoder.exe`
- Installer: `packages/desktop/dist/localcoder-desktop-win-x64.exe`
- NSIS icons use `.ico` (not `.png`).

---

## Fixes in v1.14.39

### Windows double-click — root cause fixed
- **Problem:** Double-clicking `localcoder.exe` showed nothing (invisible TUI under Explorer).
- **Fix:** Early `src/entry.ts` detects `explorer.exe` parent → visible `cmd` + `--help`.
- **npm:** `bin/localcoder.cmd` shim via `postinstall`.

---

## Verify locally (Windows + llama.cpp)

Default paths on this machine:

- llama.cpp: `P:\llama cpp\llama-b9222-bin-win-cuda-13.1-x64`
- GGUF: `P:\gguf models\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf`

### Full E2E gate (recommended before release)

```powershell
cd P:\localcoder
bun run scripts/e2e-full-windows.ts
```

Steps: `build:win` → `llamacpp setup` → chat smoke → `serve` + API → VS Code `test:all` → desktop artifact check.

Skip slow steps when iterating:

```powershell
$env:E2E_SKIP_BUILD = "1"
$env:E2E_SKIP_LLAMA = "1"
bun run scripts/e2e-full-windows.ts
```

### Manual checks

```powershell
cd packages/localcoder
bun run build:win
.\dist\localcoder-windows-x64\bin\localcoder.exe llamacpp setup `
  --dir "P:\llama cpp\llama-b9222-bin-win-cuda-13.1-x64" `
  --model "P:\gguf models\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf"

bun run ..\..\scripts\e2e-llamacpp.ts

cd ..\desktop
bun run build
bun run package:win

cd ..\..\sdks\vscode
bun run test:all
```

**VS Code:** F5 from `sdks/vscode`, or set `localcoder.packagePath` to `packages/localcoder`.

**Desktop:** double-click `LocalCoder.exe` → use in-app llama setup or connect cloud provider.

---

## Further fixes (recommended next)

| Priority | Item |
|----------|------|
| P0 | Publish VSIX to Marketplace; document `localcoder.packagePath` |
| P0 | Run `e2e-full-windows.ts` in CI on self-hosted Windows GPU runner |
| P1 | Regenerate `packages/desktop/icons/prod/icon.png` from favicon v3 (512×512) |
| P1 | Native diff apply/reject in VS Code (`vscode.diff`) |
| P1 | SecretStorage for API keys |
| P2 | MCP panel in VS Code; inline editor chat |

---

## Test coverage (honest)

| What tests prove | What they do *not* prove |
|------------------|---------------------------|
| `e2e-full-windows.ts` | CLI, llama chat, serve API, VS Code suite, desktop binary exists |
| VS Code unit + `backend-live.test.ts` | Manual F5 wizard UX on a fresh VS Code profile |
| `e2e-llamacpp.ts` | Full agent tool loop (use `AGENT_LIVE_E2E=1` for that) |
| Desktop `package:win` | Code signing / notarization |

See `sdks/vscode/FUTURE_IMPROVEMENTS.md` for extension changelog detail.
