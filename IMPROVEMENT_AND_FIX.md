# LocalCoder — Improvements, Fixes & Roadmap

**Updated:** 2026-05-22 · **Release:** v1.14.44  
**VS Code tests:** `cd sdks/vscode && bun run test:all`  
**Windows E2E gate:** `bun run scripts/e2e-full-windows.ts`

---

## Executive summary

| Area | Status | Notes |
|------|--------|-------|
| TUI + llama.cpp | **Mostly working** | CLI/TUI setup verified; desktop model picker had gaps (fixed below) |
| Qwopus / Qwen3.5 agent | **Fixed** | 16k ctx, tool-loop exit, thinking toggle |
| Desktop UI | **Polished; bugs fixed** | Cursor theme; undo + llama.cpp picker fixes in this pass |
| Desktop click-to-undo | **Fixed (retest)** | Was cosmetic-only; backend now restores files |
| Desktop llama.cpp picker | **Fixed (retest)** | Models from config + `~/.localcoder/llamacpp.json` when server offline |
| Portable Windows build | **Fast** | `build:win-standalone` ~2–4 min |
| Global CLI (Windows) | **Fixed** | `bun run install:cli` from `dist/npm/localcoder` |
| VS Code extension | **llama.cpp wizard** | 84/84 tests; manual F5 for wizard UX |

---

## Bugs fixed in this pass (2026-05-22)

### P0 — Undo showed success but did not revert files

| Symptom | Root cause | Fix |
|---------|------------|-----|
| **Undo change** updated UI but files unchanged | Optimistic `roll()` before API; revert route skipped `cleanup()`; silent no-op on bad target | API restores files then `cleanup()`; desktop waits for API, force-syncs session/messages/diff, reloads editor; toast on error |

**Files:** `packages/app/src/pages/session.tsx`, `packages/localcoder/src/server/routes/instance/session.ts`, `packages/localcoder/src/session/revert.ts`

**Note:** File undo needs `snapshot: true` (default) and git in the project. With `snapshot: false`, only messages are affected.

### P0 — llama.cpp showed no models in desktop UI

| Symptom | Root cause | Fix |
|---------|------------|-----|
| Empty model list after choosing llama.cpp | `llamacpp` absent from models.dev; loader skipped when server down | Database stub; seed from config + `llamacpp.json`; autoload when saved model exists |

**Files:** `packages/localcoder/src/provider/provider.ts`, `packages/app/src/utils/llamacpp-sync.ts`

Run setup once: **Connect provider → llama.cpp (local)** (or TUI `/llama`, `localcoder llamacpp setup`).

### P1 — TUI tool undo wrong part id

TUI used `callID` instead of `part.id` for revert. Fixed in `packages/localcoder/src/cli/cmd/tui/routes/session/index.tsx`.

---

## Remaining gaps (honest)

| Priority | Item |
|----------|------|
| P1 | Rebuild portable exe: `bun run build:win-standalone` |
| P1 | Manual smoke: undo after Write/Edit; llama model after setup |
| P2 | Undo while agent busy (must abort first) |
| P2 | Session timeline perf on long chats |
| P2 | VS Code native diff apply/reject |

---

## llama.cpp quick reference

- **Config:** `~/.localcoder/llamacpp.json`
- **API:** `GET/POST /global/llamacpp/{status,setup,start,stop,thinking}`
- **CLI:** `localcoder llamacpp setup|status|stop`

```powershell
& "P:\llama cpp\llama-b9284-bin-win-cuda-13.1-x64\llama-server.exe" `
  -m "P:\gguf models\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf" `
  --host 127.0.0.1 --port 8080 -c 16384 --jinja
```

---

## Verify locally

```powershell
bun run install:cli
bun run build:win-standalone
# Desktop: undo after agent edit; llama.cpp model in picker after wizard

$env:AGENT_LIVE_E2E = "1"
$env:AGENT_E2E_FAST = "1"
bun run scripts/agent-tool-e2e.ts
```

---

## Test coverage (honest)

| Proves | Does not prove |
|--------|----------------|
| `agent-tool-e2e.ts` | Live Qwopus tool loop |
| `e2e-full-windows.ts` | CLI, llama chat, VS Code suite |
| VS Code 84 tests | Desktop undo UX, llama desktop picker |

See [sdks/vscode/FUTURE_IMPROVEMENTS.md](sdks/vscode/FUTURE_IMPROVEMENTS.md).
