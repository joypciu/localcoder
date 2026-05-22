# LocalCoder — Improvements, Fixes & Roadmap

**Updated:** 2026-05-22 · **Release:** v1.14.44  
**VS Code tests:** `cd sdks/vscode && bun run test:all`  
**Windows E2E gate:** `bun run scripts/e2e-full-windows.ts`  
**v2 migration backlog:** [specs/v2/todo.md](specs/v2/todo.md)

---

## Executive summary

| Area | Status | Notes |
|------|--------|-------|
| TUI + llama.cpp | **Mostly working** | Shared `packages/localcoder/src/llamacpp/`; CLI `llamacpp setup` |
| Qwopus / Qwen3.5 agent | **Fixed** | 16k ctx, tool-loop exit, thinking toggle |
| Desktop click-to-undo | **Fixed (v1.14.44)** | Backend restores files + syncs messages |
| Desktop llama.cpp picker | **Fixed (v1.14.44)** | Models from config + `llamacpp.json` when server offline |
| Portable Windows build | **Fast** | `build:win-standalone` ~2–4 min; fast pack ~1 min |
| Global CLI (Windows) | **Fixed** | `bun run install:cli` from `dist/npm/localcoder` |
| Internal architecture | **In migration** | Effect services + v1/v2 dual-write; Hono removal planned |
| Multi-agent / subagents | **Functional, immature** | Task tool works; orchestration + desktop UX lag TUI |
| Context / tokens | **Reactive** | Compaction + truncation; no proactive budget allocator |
| Cross-platform CLI | **Partial** | Builds for win/mac/linux; docs and CI Windows-heavy |
| Desktop (mac/linux) | **Secondary** | Electron builder targets exist; less tested than Windows |
| VS Code extension | **llama.cpp wizard** | 84/84 unit tests; manual F5 for wizard UX |

---

## Recently fixed (v1.14.44)

### Undo showed success but did not revert files

| Symptom | Fix |
|---------|-----|
| UI updated; files on disk unchanged | Revert API runs `cleanup()` after snapshot restore; desktop waits for API, force-syncs session/messages/diff |

**Files:** `packages/app/src/pages/session.tsx`, `packages/localcoder/src/server/routes/instance/session.ts`, `packages/localcoder/src/session/revert.ts`

**Note:** File undo needs `snapshot: true` (default) and git in the project.

### llama.cpp showed no models in desktop UI

| Symptom | Fix |
|---------|-----|
| Empty model picker after choosing llama.cpp | Provider database stub; seed from global config + `~/.localcoder/llamacpp.json`; offline discovery fallback |

**Files:** `packages/localcoder/src/provider/provider.ts`, `packages/app/src/utils/llamacpp-sync.ts`

### TUI tool undo wrong part id

TUI used `callID` instead of `part.id` for revert — fixed in `packages/localcoder/src/cli/cmd/tui/routes/session/index.tsx`.

---

## Architecture roadmap

LocalCoder is a Bun monorepo: **Effect-based services** in `packages/localcoder`, **SolidJS** UI in `packages/app` + `packages/ui`, **Electron** desktop shell in `packages/desktop`, HTTP SDK in `packages/sdk/js`. The server runs standalone (CLI/TUI), embedded (desktop), or as a global daemon (`serve`).

### P0 — Finish v2 data model and service boundaries

| Goal | Why | Key paths |
|------|-----|-----------|
| Complete v2 session/message events | v1 Bus and v2 events dual-write today; complicates undo, sync, plugins | `src/session/processor.ts`, `src/v2/`, `specs/v2/todo.md` |
| Unify agent loop on v2 model | Loop tied to legacy message shape; blocks compaction rework | `src/session/prompt.ts`, `src/session/compaction.ts` |
| Remove Hono / split server adapters | Reduce HTTP stack debt; cleaner Bun vs Node embed path | `src/server/`, `script/build-node.ts` |
| Single runtime composition root | `app-runtime.ts` is good; CLI/TUI still use promise bridges | `src/effect/app-runtime.ts`, `EffectBridge` usages |
| Plugin API stabilization | Hot reload + hook contracts undefined for third parties | `src/plugin/`, `specs/v2/todo.md` |

**Success criteria:** One event stream for session lifecycle; no dual-write in processor; desktop and CLI share identical server behavior without bridge hacks.

### P1 — Instance lifecycle and multi-project correctness

| Goal | Detail |
|------|--------|
| Global vs instance config clarity | llama.cpp, providers, and model selection propagate consistently to project instances |
| Instance dispose / refresh contract | After global config change, open projects refresh providers without manual restart |
| Workspace isolation | Snapshot, permission, and MCP state must not leak across directories |
| Structured logging + trace IDs | Per-session, per-agent, per-tool correlation across CLI, server, and desktop |

### P2 — Observability and operability

| Goal | Detail |
|------|--------|
| `localcoder doctor` | Checks git, snapshot, provider auth, llama.cpp, port conflicts, disk space |
| `localcoder stats` expansion | Token usage, compaction counts, tool error rates, model latency — exportable JSON |
| Debug bundle | One command to collect logs, config (redacted), session metadata for support |

---

## Multi-agent and subagent roadmap

**Current:** Agents in `src/agent/agent.ts` (`build`, `plan`, `general`, `explore`, hidden compaction/title/summary). Subagents delegate via **Task tool** (`src/tool/task.ts`) into child sessions with inherited permissions and no nested `task`.

### P0 — Permission and delegation correctness

| Item | Detail |
|------|--------|
| Pre-filter tools at registration | Agent `deny` rules apply at execution today; LLM still sees denied tools. Filter in `resolveTools()` (`prompt.ts`) |
| Subagent permission inheritance audit | Test `external_directory`, deny propagation, MCP visibility in child sessions |
| `@agent` bypass review | User `@agent` parts skip task permission check — tighten or make explicit |

### P1 — Orchestration beyond single Task calls

| Item | Detail |
|------|--------|
| Parallel subagent coordinator | Queue/worker pool with concurrency limits and cancellation |
| Subagent result aggregation | Standard pattern for merging explore + general outputs into parent turn |
| Subagent budgets | Max steps, tokens, wall time per child session; surface in UI |
| Plan ↔ build handoff | Polish `plan_enter` / `plan_exit` workflow and desktop UX |

### P1 — Desktop and TUI parity

| Item | Detail |
|------|--------|
| Subagent navigation (desktop) | TUI has footer + sibling switcher; desktop needs turn grouping, child session links, status chips |
| Subagent diff/revert scope | Undo in parent vs child session must be unambiguous |
| ACP subagent exposure | External clients via `src/acp/` should see delegation tree; permissions auto-approve today |

### P2 — Agent authoring

| Item | Detail |
|------|--------|
| Agent markdown hot reload | Config agents in `.localcoder/` without server restart |
| Agent templates | Curated agents (review, test, docs, refactor) with tested permission sets |
| Agent testing harness | `localcoder agent test <name> --fixture` with mock LLM |

---

## Tool calling roadmap

**Pipeline:** `SessionPrompt.loop` → `resolveTools()` → `SessionProcessor` stream → `completeToolCall` → permission bus → tool registry (`src/tool/registry.ts`).

### P0 — Reliability

| Item | Detail |
|------|--------|
| Tool schema ↔ permission alignment | Denied tools never appear in model schema |
| Doom-loop guard tuning | Threshold 3 in processor — configurable; user-visible explanation |
| Tool error taxonomy | Retriable vs fatal; auto-retry read/grep; never auto-retry write/shell |
| MCP permission granularity | Per-server, per-tool rules instead of coarse keys |

### P1 — Richer tool surface

| Item | Detail |
|------|--------|
| Structured tool output | Consistent JSON + human summary for UI and compaction |
| Tool output indexing | Search prior tool results without re-reading truncated blobs |
| Batch tool calls | Parallel independent reads where provider supports it |
| LSP tool GA | Default on when stable; document language server setup |
| Patch tool UX | Unified diff preview in desktop + VS Code before apply |

### P2 — Extensibility

| Item | Detail |
|------|--------|
| `.localcoder/tool/*` SDK | Typed helper for custom tools with schema, permissions, tests |
| Tool versioning | Breaking schema changes without breaking old sessions |
| Sandboxed shell profiles | Named profiles (read-only, test, deploy) |

**Key files:** `src/tool/registry.ts`, `src/session/processor.ts`, `src/session/tool-phase.ts`, `src/permission/`, `src/tool/truncate.ts`

---

## Context and token management roadmap

**Current:** Overflow in `src/session/overflow.ts`; compaction in `src/session/compaction.ts`; truncation in `src/tool/truncate.ts` (50KB / 2000 lines); TUI meter in `cli/cmd/tui/util/context-usage.ts`.

### P0 — Predictable behavior on small contexts

| Item | Detail |
|------|--------|
| Model-aware budgets | Usable context from model + variant; llama.cpp 16k ≠ Claude 200k |
| Proactive compaction trigger | Compact before hard overflow; per-agent thresholds |
| Compaction + revert safety | Test undo across compaction boundaries |
| Token accounting accuracy | Reconcile provider usage with internal estimates; show in UI |

### P1 — Smarter context assembly

| Item | Detail |
|------|--------|
| Context budget allocator | Reserve slices: system, tools, history, attachments, output headroom |
| Importance-weighted history | Keep intent + failed tools; prune redundant successful reads |
| File attachment dedup | Same file read twice — serve from cache part |
| Skill / rules injection budget | Cap `@skill` and rules size |
| Optional project memory | Explicit user-approved memory, not silent growth |

### P2 — Power-user controls

| Item | Detail |
|------|--------|
| `/compact`, `/context`, `/tokens` commands | Manual compaction and visibility |
| Per-turn context diff | Debug what entered the model each step |
| Export context snapshot | Reproduce bugs without sharing full repo |

---

## CLI roadmap (Windows, Linux, macOS)

**Current:** yargs entry `src/index.ts`; commands: `run`, `thread`, `attach`, `serve`, `web`, `models`, `agent`, `mcp`, `llamacpp`, `session`, `acp`, `export/import`, `upgrade`. Native binaries via `script/build.ts` (win/darwin/linux glibc/musl).

### P0 — One binary, three platforms, same behavior

| Item | Detail |
|------|--------|
| Parity CI matrix | Build + smoke CLI on win/mac/linux every release |
| `install:cli` for mac/linux | Homebrew, shell installer, or npm-global with embedded binary |
| Shell integration | `localcoder init` — bash/zsh/fish/powershell completions |
| No Bun required for end users | npm package always ships prebuilt binary per platform |

### P1 — Rich standalone CLI

| Item | Detail |
|------|--------|
| `localcoder run` polish | JSON/stream modes; exit codes; `--timeout`, `--max-steps` |
| Headless agent mode | `localcoder agent run --agent build --model … --prompt-file` for CI |
| Session management CLI | `session list`, `session show`, `session export`, `session fork` |
| Config wizard | `localcoder onboard` — providers, llama.cpp, git snapshot, default agent |
| TUI performance | Virtualized message list in OpenTUI for long sessions |
| Attach / multiplex | TUI + desktop + VS Code on same session with clear leader |

### P2 — Developer ergonomics

| Item | Detail |
|------|--------|
| `localcoder debug tool …` | Replay tool call offline |
| Scripting SDK | Thin wrapper over `@localcoder-ai/sdk` |
| Workspace profiles | Switch repos without restarting global server |

**Key files:** `src/index.ts`, `script/build.ts`, `script/prepare-npm-package.ts`, `INSTALL.md`

---

## Desktop build roadmap

**Stack:** Electron 41 (`packages/desktop`). Windows portable via `script/build-win-standalone.ts`; embeds server via `build-node.ts`.

### P0 — Super-fast Windows portable

| Item | Detail |
|------|--------|
| Keep fast pack path | `LOCALCODER_FAST_PACK=1` → `win-unpacked` ~1 min |
| Incremental server bundle | Skip `build-node.ts` when server hash unchanged |
| AV-lock hardening | `.pack-tmp` pattern; optional signed builds |
| Ship validated artifacts | Rebuild portable exe after each fix release |

### P1 — macOS binaries

| Item | Detail |
|------|--------|
| macOS CI on tag | DMG + zip; signing + notarization via `electron-builder.config.ts` |
| Universal binary | arm64 + x64 artifacts |
| macOS llama.cpp wizard | Native pickers; Gatekeeper-friendly server spawn |
| Native window polish | `native/` addon for traffic lights, vibrancy |

### P1 — Linux desktop

| Item | Detail |
|------|--------|
| AppImage / deb in CI | electron-builder linux targets |
| Wayland + X11 | IME, shortcuts, file picker |
| Browser fallback | Open web UI when Electron unavailable |

### P2 — Packaging consolidation

| Item | Detail |
|------|--------|
| Unify CLI + desktop native build | Shared `build.ts` artifacts for desktop embed |
| Delta updates | electron-updater channel |
| Size reduction | Tree-shake server bundle; optional lite SKU |

```powershell
bun run build:win-standalone
$env:LOCALCODER_FAST_PACK = "1"; bun run build:win-standalone
```

Output: `packages/desktop/dist/LocalCoder-<version>-portable.exe`

---

## Desktop UI roadmap

**Architecture:** `@localcoder-ai/app` (SolidJS) in Electron; sync via `global-sync/` + TanStack Query.

### P0 — Core UX gaps

| Item | Detail |
|------|--------|
| Desktop E2E suite | Playwright: undo, llama picker, permissions, model switch |
| Undo while agent busy | Queue or auto-abort with confirmation |
| Session timeline perf | Virtualize turns for 500+ message sessions |
| Version skew cleanup | Align `packages/app` version with release |

### P1 — IDE-quality polish

| Item | Detail |
|------|--------|
| File editor integration | Monaco/CodeMirror; inline diff from tool parts |
| Review panel | Session diff sidebar — apply/reject per file |
| Terminal panel | Multiple tabs; link shell tool output |
| Command palette | Cursor-style for sessions, models, agents, files |
| Notification center | Permissions, subagent completion, errors |
| Onboarding flow | First-run provider, llama.cpp, theme, keybind tour |

### P1 — Multi-surface consistency

| Item | Detail |
|------|--------|
| Subagent UX parity | Match TUI footer — child list, jump to parent |
| Theme system | High-contrast; optional VS Code theme sync |
| i18n completeness | Audit undo, llama, subagent strings |
| Accessibility | Focus order, screen reader labels on tool cards |

### P2 — Advanced UI

| Item | Detail |
|------|--------|
| Session branching / fork | Tree view; fork from any user message |
| MCP manager panel | Add/remove servers, test connection |
| Agent editor UI | Visual permission rule builder |
| Collaborative mode | Read-only session share link |

**Key files:** `packages/app/src/pages/session.tsx`, `packages/app/src/context/global-sync/`, `packages/ui/src/components/session-turn.tsx`, `packages/desktop/src/main/`

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

## Priority matrix (consolidated)

| Priority | Theme | Top items |
|----------|-------|-----------|
| **P0** | Architecture | v2 events + agent loop; tool permission pre-filter; desktop E2E |
| **P0** | Shipping | Rebuild portable exe; macOS build on tag; CLI tri-platform CI |
| **P1** | Agents | Parallel subagent coordinator; desktop subagent nav; ACP permissions |
| **P1** | Context | Model-aware budgets; proactive compaction; token UI accuracy |
| **P1** | CLI | `onboard`, headless `agent run`, session subcommands, completions |
| **P1** | Desktop UI | Timeline virtualization; review panel; undo-while-busy |
| **P2** | Tools | Batch reads; MCP granularity; custom tool SDK |
| **P2** | Packaging | Unified native build; delta updates; Linux AppImage |
| **P3** | Future | Session fork UI; collaborative read-only; plugin marketplace |

---

## Verify locally

```powershell
bun run install:cli
bun run build:win-standalone

$env:AGENT_LIVE_E2E = "1"
$env:AGENT_E2E_FAST = "1"
bun run scripts/agent-tool-e2e.ts

bun run scripts/e2e-full-windows.ts
```

Skip slow steps: `$env:E2E_SKIP_BUILD = "1"; $env:E2E_SKIP_LLAMA = "1"`

---

## Test coverage (honest)

| Proves | Does not prove |
|--------|----------------|
| `agent-tool-e2e.ts` | Live Qwopus tool loop |
| `e2e-full-windows.ts` | CLI, llama chat, VS Code suite, binary exists |
| VS Code 84 tests | Desktop GUI, subagent nav, mac/linux |
| Unit tests | Processor, permissions, revert/compaction |

See: [sdks/vscode/FUTURE_IMPROVEMENTS.md](sdks/vscode/FUTURE_IMPROVEMENTS.md) · [specs/v2/todo.md](specs/v2/todo.md)

---

## Key file index

```
packages/localcoder/src/
  agent/agent.ts              Agent definitions
  tool/task.ts                Subagent delegation
  tool/registry.ts            Tool catalog
  session/prompt.ts           Agent loop, resolveTools
  session/processor.ts        LLM stream, tool execution
  session/compaction.ts       Context compaction
  session/overflow.ts         Token limits
  session/revert.ts           Undo / file restore
  permission/                 Permission engine
  provider/provider.ts        Models and providers
  effect/app-runtime.ts       Effect composition
  llamacpp/                   Local model bootstrap
  index.ts                    CLI entry
  acp/                        External agent protocol

packages/app/src/context/     UI state, sync, permissions
packages/desktop/src/main/    Electron + embedded server
packages/localcoder/script/   build.ts, build-win-standalone.ts
```
