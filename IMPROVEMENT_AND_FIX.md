# LocalCoder — Improvements, Fixes & Roadmap

**Updated:** 2026-05-22 · **Release:** v1.14.43  
**VS Code tests:** `cd sdks/vscode && bun run test:all`  
**Windows E2E gate:** `bun run scripts/e2e-full-windows.ts`

---

## Executive summary

| Area | Status | Notes |
|------|--------|-------|
| TUI + llama.cpp | Production-ready | Shared module `packages/localcoder/src/llamacpp/`; CLI `llamacpp setup` |
| Qwopus / Qwen3.5 agent | **Fixed** | 16k ctx, tool-loop exit, thinking toggle, CLI exit after prompt |
| Desktop UI | **Polished** | Cursor default theme, flat chrome, click-to-undo (per tool + per turn) |
| Portable Windows build | **Fast** | `build:win-standalone` ~2–4 min; AV-lock workaround via `.pack-tmp` |
| Global CLI (Windows) | **Fixed** | `install:cli`; embeds binary in local npm package; `localcoder.cjs` launcher |
| VS Code extension | **llama.cpp wizard** | First-run + `localcoder.setupLlamaCpp`; 84/84 tests |
| CI release | Tag-driven | `.github/workflows/release.yml` — Win/Mac CLI + desktop + npm |

---

## v1.14.43 — Desktop polish + packaging + CLI install

### Desktop UI (commits `1a20ea0`)

| Change | Detail |
|--------|--------|
| Default theme | **Cursor** palette (`#181818` dark); Inter + JetBrains Mono |
| Layout | Flat panels, narrower sidebar rail, synced Windows titlebar colors |
| Click-to-undo | **Undo change** on Write/Edit/Patch tools; **Undo all changes** on turn diff bar |
| Revert dock | Lists affected files with +/- counts when expanded |
| llama.cpp UX | Provider refresh after start/stop; auto-select model; managed vs external server |

### Windows standalone build

```powershell
bun run build:win-standalone              # full portable exe
$env:LOCALCODER_FAST_PACK = "1"; bun run build:win-standalone   # dev (~1 min, win-unpacked)
```

Output: `packages/desktop/dist/LocalCoder-<version>-portable.exe`

Optimizations: pack to `.pack-tmp` first (AV lock safe), reuse `dist/node`, skip unnecessary rebuild/signing.

### Global CLI fix (commit `e099c79`)

| Problem | Fix |
|---------|-----|
| `Cannot find module ...\node_modules\localcoder\bin\localcoder` | Stale npm shim; reinstall from `dist/npm/localcoder` |
| `require is not defined` when linking dev package | Launcher moved to `bin/localcoder.cjs`; local `prepare:npm` embeds `.exe` |
| `file:` optional deps fail on `npm install -g .` | Local prepare copies platform binary to `bin/.localcoder` |

One-command from repo root:

```powershell
bun run install:cli
```

---

## v1.14.43+ — Qwopus agent + llama.cpp b9284

### Agent fixes (commit `cd97898` and follow-ups)

| Issue | Symptom | Fix |
|-------|---------|-----|
| Context overflow | `ContextOverflowError` (~9k tokens vs 4096 ctx) | Default ctx **16384** in agent E2E and `llamacpp.json` |
| Infinite agent loop | Completed tools counted as unresolved | `hasUnresolvedToolParts()` only counts pending/running |
| CLI hang | `localcoder run` did not exit after prompt | Abort SSE after prompt |
| Pipe deadlock | E2E scripts hung with captured stdout | `scripts/spawn-utils.ts` drains pipes reliably |

### Qwen3.5 / Qwopus thinking toggle

Use `chat_template_args: { enable_thinking: true/false }` — not `/think` soft switches.

- **App toggle:** `POST /global/llamacpp/thinking` + setup dialog
- **Config:** `thinking` in `~/.localcoder/llamacpp.json`
- **Wire quirk:** provider sends `enable_thinking: true` on API so tool calls populate `content`
- **Do not** pass server `--reasoning off` (breaks `content` on some builds)

### llama.cpp b9284

`resolveLlamaDir()` auto-discovers the newest `llama-b*-bin-*` under `P:\llama cpp` (and `C:\llama cpp`).

**Server flags (Qwopus MTP):**

```powershell
& "P:\llama cpp\llama-b9284-bin-win-cuda-13.1-x64\llama-server.exe" `
  -m "P:\gguf models\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf" `
  --host 127.0.0.1 --port 8080 -c 16384 --jinja
```

Do **not** use `LLAMACPP_SKIP_SERVER=1` unless a server with `-c 16384` is already running.

---

## Shared llama.cpp module

- **Config:** `~/.localcoder/llamacpp.json`
- **API:** `GET/POST /global/llamacpp/{status,setup,start,stop,thinking}`
- **CLI:** `localcoder llamacpp setup|status|stop`
- **Surfaces:** TUI `/llama`, desktop wizard, VS Code `localcoder.setupLlamaCpp`

---

## Verify locally (Windows)

### Quick CLI check

```powershell
localcoder --version
bun run install:cli    # if global CLI broken
```

### Agent + tool E2E (live LLM)

```powershell
cd P:\localcoder
Remove-Item Env:LLAMACPP_SKIP_SERVER -ErrorAction SilentlyContinue
$env:AGENT_LIVE_E2E = "1"
$env:AGENT_E2E_FAST = "1"
bun run scripts/agent-tool-e2e.ts
```

### Full E2E gate

```powershell
bun run scripts/e2e-full-windows.ts
```

Skip slow steps when iterating:

```powershell
$env:E2E_SKIP_BUILD = "1"
$env:E2E_SKIP_LLAMA = "1"
bun run scripts/e2e-full-windows.ts
```

### Desktop smoke test

```powershell
bun run build:win-standalone
# Double-click packages\desktop\dist\LocalCoder-*-portable.exe
# Or: packages\desktop\dist\win-unpacked\LocalCoder.exe (fast pack)
```

---

## Further work (recommended next)

| Priority | Item |
|----------|------|
| P0 | Publish VSIX to Marketplace |
| P0 | Run `e2e-full-windows.ts` on self-hosted Windows GPU CI |
| P1 | Native diff apply/reject in VS Code (`vscode.diff`) |
| P1 | SecretStorage for API keys in VS Code |
| P2 | Session timeline virtualization in desktop UI |
| P2 | MCP panel in VS Code |

---

## Test coverage (honest)

| What tests prove | What they do *not* prove |
|------------------|---------------------------|
| `e2e-full-windows.ts` | CLI, llama chat, serve API, VS Code suite, desktop binary exists |
| `agent-tool-e2e.ts` | Full agent tool loop with Qwopus (~30s) |
| VS Code 84 tests | Extension logic; manual F5 still needed for wizard UX |
| Desktop portable build | Code signing / notarization |
| Desktop click-to-undo | Manual UI verification after agent edits |

See [sdks/vscode/FUTURE_IMPROVEMENTS.md](sdks/vscode/FUTURE_IMPROVEMENTS.md) for extension detail.
