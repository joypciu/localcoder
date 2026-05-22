# LocalCoder — Improvements, Fixes & Roadmap

**Updated:** 2026-05-22 · **Release:** v1.14.43+  
**VS Code tests:** `cd sdks/vscode && bun run test:all`  
**Windows E2E gate:** `bun run scripts/e2e-full-windows.ts`

---

## Executive summary

| Area | Status | Notes |
|------|--------|-------|
| TUI + llama.cpp | Production-ready | Shared module under `packages/localcoder/src/llamacpp/`; CLI `llamacpp setup` |
| Qwopus / Qwen3.5 agent | **Fixed** | 16k ctx, tool-loop exit, thinking toggle, CLI exit after prompt |
| Web / Desktop UI | **Rebranded** | LocalCoder LC monogram, `localcoder` default theme, home + setup wizard |
| VS Code extension | **llama.cpp wizard** | First-run + `localcoder.setupLlamaCpp`; spawns built `.exe` |
| npm / Windows CLI | **Fixed** | `postinstall` copies platform binary; Explorer double-click shows help |
| Desktop Electron | **Shippable** | `LocalCoder.exe` + NSIS installer; OAuth externals fixed |
| CI release | Tag-driven | `.github/workflows/release.yml` — Win/Mac CLI + desktop + npm |

---

## v1.14.43+ — Qwopus agent + llama.cpp b9284

### Agent fixes (commit `cd97898` and follow-ups)

| Issue | Symptom | Fix |
|-------|---------|-----|
| Context overflow | `ContextOverflowError` (~9k tokens vs 4096 ctx) | Default ctx **16384** in agent E2E scripts and `llamacpp.json` |
| Infinite agent loop | Completed tools counted as unresolved | `hasUnresolvedToolParts()` only counts pending/running tools |
| CLI hang | `localcoder run` did not exit after prompt | Abort SSE after prompt; do not treat abort as fatal |
| Pipe deadlock | E2E scripts hung with captured stdout | `scripts/spawn-utils.ts` drains pipes reliably |

### Qwen3.5 / Qwopus thinking toggle

Per [Qwen3.5 HF docs](https://huggingface.co/Qwen/Qwen3.5-9B#instruct-or-non-thinking-mode), use `chat_template_args: { enable_thinking: true/false }` — not `/think` soft switches.

- **App toggle:** `POST /global/llamacpp/thinking` + setup dialog (`dialog-setup-llamacpp.tsx`)
- **Config:** `thinking` in `~/.localcoder/llamacpp.json`
- **Wire quirk:** llamacpp provider always sends `enable_thinking: true` on the API so tool calls populate `content`; UI toggle uses `capabilities.reasoning` instead
- **Do not** pass server `--reasoning off` (breaks `content` on some builds)

### llama.cpp b9284

Default Windows binary path (override with `LOCALCODER_LLAMACPP_DIR` or `llamacpp.json`):

- `P:\llama cpp\llama-b9284-bin-win-cuda-13.1-x64`

`resolveLlamaDir()` auto-discovers the newest `llama-b*-bin-*` folder under `P:\llama cpp` (and `C:\llama cpp`).

**Server flags (Qwopus MTP):**

```powershell
& "P:\llama cpp\llama-b9284-bin-win-cuda-13.1-x64\llama-server.exe" `
  -m "P:\gguf models\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf" `
  --host 127.0.0.1 --port 8080 -c 16384 --jinja
```

Do **not** use `LLAMACPP_SKIP_SERVER=1` unless an existing server already runs with `-c 16384`.

---

## v1.14.43 — llama.cpp everywhere + LocalCoder identity

### Shared llama.cpp module
- **Config:** `~/.localcoder/llamacpp.json` (llama dir, GGUF path, autoStart, ctx, MTP, thinking).
- **API:** `GET/POST /global/llamacpp/{status,setup,start,stop,thinking}` on `localcoder serve`.
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

- llama.cpp: `P:\llama cpp\llama-b9284-bin-win-cuda-13.1-x64`
- GGUF: `P:\gguf models\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf`

### Staged diagnostics

```powershell
cd P:\localcoder

# Stage 1: llama.cpp + GGUF only (server must be up on :8080)
bun run scripts/diag-llama-localcoder.ts

# Stage 2: includes LocalCoder agent path (same script, both stages)
```

### Agent + tool E2E (live LLM)

```powershell
Remove-Item Env:LLAMACPP_SKIP_SERVER -ErrorAction SilentlyContinue
$env:AGENT_LIVE_E2E = "1"
$env:AGENT_E2E_FAST = "1"
bun run scripts/agent-tool-e2e.ts

# Multi-turn: write -> edit -> bash in one session
$env:AGENT_MULTITURN_E2E = "1"
bun run scripts/agent-multiturn-e2e.ts
```

Expected: **PASSED** in ~25-60s with b9284 and `-c 16384`.

### Full E2E gate (recommended before release)

```powershell
cd P:\localcoder
bun run scripts/e2e-full-windows.ts
```

Steps: `build:win` -> `llamacpp setup` -> chat smoke -> `serve` + API -> VS Code `test:all` -> desktop artifact check.

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
  --dir "P:\llama cpp\llama-b9284-bin-win-cuda-13.1-x64" `
  --model "P:\gguf models\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf"

bun run ..\..\scripts\e2e-llamacpp.ts

cd ..\desktop
bun run build
bun run package:win

cd ..\..\sdks\vscode
bun run test:all
```

**VS Code:** F5 from `sdks/vscode`, or set `localcoder.packagePath` to `packages/localcoder`.

**Desktop:** double-click `LocalCoder.exe` -> use in-app llama setup or connect cloud provider.

---

## Further fixes (recommended next)

| Priority | Item |
|----------|------|
| P0 | Publish VSIX to Marketplace; document `localcoder.packagePath` |
| P0 | Run `e2e-full-windows.ts` in CI on self-hosted Windows GPU runner |
| P1 | Regenerate `packages/desktop/icons/prod/icon.png` from favicon v3 (512x512) |
| P1 | Native diff apply/reject in VS Code (`vscode.diff`) |
| P1 | SecretStorage for API keys |
| P2 | MCP panel in VS Code; inline editor chat |

---

## Test coverage (honest)

| What tests prove | What they do *not* prove |
|------------------|---------------------------|
| `e2e-full-windows.ts` | CLI, llama chat, serve API, VS Code suite, desktop binary exists |
| `agent-tool-e2e.ts` (`AGENT_LIVE_E2E=1`) | Full agent tool loop with Qwopus + bash tool (~30s) |
| `agent-multiturn-e2e.ts` | Chained write/edit/bash in one session |
| `diag-llama-localcoder.ts` | llama.cpp API smoke + LocalCoder integration |
| VS Code unit + `backend-live.test.ts` | Manual F5 wizard UX on a fresh VS Code profile |
| `e2e-llamacpp.ts` | Chat completion smoke only (no agent loop) |
| Desktop `package:win` | Code signing / notarization |

See `sdks/vscode/FUTURE_IMPROVEMENTS.md` for extension changelog detail.
