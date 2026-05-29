# LocalCoder — Improvements, Fixes & Roadmap

**Updated:** 2026-05-29 · **Release:** v1.14.46  
**VS Code tests:** `cd sdks/vscode && bun run test:unit` (fast) · `bun run test` (full)  
**Windows E2E:** `bun run e2e:smoke` (~15s) · `bun run e2e` (~1–2 min) · `bun run e2e:full` (build + Playwright)  
**v2 migration backlog:** [specs/v2/todo.md](specs/v2/todo.md)

---

## Executive summary

| Area | Status | Notes |
|------|--------|-------|
| **Zero-config providers** | **Done (2026-05-29)** | llama.cpp + OpenRouter + OpenCode Go wizards; `auth set-api` |
| **CLI reliability** | **Fixed** | Invalid model fail-fast (~2s); stdout progress; skip bundled plugin npm 404 |
| **TUI + llama.cpp** | **Working** | Interactive `llamacpp setup`; autostart; ctx + thinking in wizards |
| **Qwopus / Qwen3.5 agent** | **Fixed** | 16k ctx, tool-loop exit, thinking toggle |
| **Desktop click-to-undo** | **Fixed** | Backend restores files + syncs messages |
| **VS Code extension** | **Strong** | 84+ tests; zero-config wizards; SecretStorage; inline actions |
| **Portable Windows build** | **Fast** | `build:win-standalone` ~2–4 min; fast pack ~1 min |
| **Global CLI (Windows)** | **Fixed** | `bun run install:cli` from `dist/npm/localcoder` |
| **Multi-agent / subagents** | **Functional** | Parallel coordinator; desktop UX lagging TUI |
| **Internal architecture** | **In migration** | Effect services + v1/v2 dual-write |

---

## Session 3 — Zero-config & CLI polish (2026-05-29)

### User-facing: no manual config for providers

| Surface | What changed |
|---------|----------------|
| **CLI** | `localcoder llamacpp setup` interactive wizard (folder, GGUF, ctx, thinking) |
| **CLI** | `localcoder auth set-api -p openrouter\|opencode-go -k KEY` for IDE wizards |
| **VS Code** | First-run: llama.cpp, OpenRouter, OpenCode Go; Settings ⚙ buttons |
| **Desktop** | llama.cpp dialog: context size field added |
| **All** | User picks any llama.cpp folder — no hardcoded paths; LocalCoder starts server |

### CLI fixes (audit follow-up)

| Fix | Detail |
|-----|--------|
| Invalid model fail-fast | `run -m bad/provider` errors in ~2s with suggestions (was 84s+ hang) |
| Plugin npm 404 | Skip `@localcoder-ai/plugin` install when bundled (`pluginDependencyAvailable`) |
| Log noise | Missing optional providers → debug, not error |
| `run` progress | `… working` on busy; stderr/stdout flush for piped output |

### E2E smoke (2026-05-29)

| Command | Time | Coverage |
|---------|------|----------|
| `bun run e2e:smoke` | ~15s | VS Code compile + 84 contract tests + CLI version/search/fail-fast |
| `bun run e2e` | ~1–2 min | + llama setup/chat, agent bash, serve API + invalid-model gate, backend-live, Electron tests, desktop artifacts, Playwright UI |
| `bun run e2e:full` | ~10–30 min | + portable build, headed `LocalCoder.exe` launch, live llama VS Code E2E (skip with `E2E_SKIP_LLAMA_VSCODE=1`) |

Legacy wrappers: `scripts/e2e-full-windows.ts` (→ full), `scripts/readiness-windows.ts` (→ standard, skip build).

---

## Session 2 fixes (v1.14.46 — 2026-05-29)

### Root-cause bugs found and fixed

| Bug | File | Fix |
|-----|------|-----|
| `disabled_providers: ["llamacpp"]` in global config silently blocked all llama usage | `~/.config/localcoder/localcoder.jsonc` | Removed from global config; `reasoning: false` → `true` |
| `llamaDir` in saved config pointed to stale binary | `~/.localcoder/llamacpp.json` | Re-run `localcoder llamacpp setup` or use VS Code / desktop wizard |
| All E2E scripts hardcoded old llama binary path | `scripts/*.ts`, `sdks/vscode/src/extension.ts` | Removed hardcoded paths; dynamic discovery + user wizard |
| Serve API uses `/session/:id/message` not `/session/:id/prompt` | Server routes | Documented; the endpoint is synchronous — returns full response when done |
| VS Code llama E2E test: AI not calling tools | `sdks/vscode/src/test/suite/llama-e2e.test.ts` | Root cause: prompt engineering + tool permission setup (WIP) |

### Config state after fixes

```json
// ~/.config/localcoder/localcoder.jsonc
{
  "model": "llamacpp/<your-model>.gguf",
  "provider": { "llamacpp": { "models": { "..": { "reasoning": true, "tool_call": true } } } }
}

// ~/.localcoder/llamacpp.json  (written by wizard)
{ "llamaDir": "<path-to-llama.cpp-bin>", "thinking": true, "ctx": 16384 }
```

### What PASSED after fixes

| Test | Result |
|------|--------|
| `bun run scripts/e2e-llamacpp.ts` | ✅ chat/completions OK (89 t/s, loads in 7s on RTX 5070 Ti) |
| `AGENT_LIVE_E2E=1 AGENT_E2E_FAST=1 bun run scripts/agent-tool-e2e.ts` | ✅ bash tool called via real llama inference |
| `cd sdks/vscode && bun run test:unit` | ✅ 48/48 contract tests (~5s) |
| `cd sdks/vscode && bun run test` | ✅ 84+ full suite (incl. Electron) |
| VS Code E2E test 1: create session | ✅ passing |
| VS Code E2E test 4: session history | ✅ 15 messages in history |
| `localcoder.exe llamacpp status` | ✅ running=true, thinking=true, correct paths |
| `localcoder.exe run --dangerously-skip-permissions "Say hello"` | ✅ real llama response |

### What is STILL FAILING / WIP

| Issue | Details |
|-------|---------|
| VS Code E2E tests 2+3 (write/edit tools) | AI responds but may not call tools; Qwopus prompt tuning improved in `prompt/qwen.txt` — retest with `bun run e2e:full` |
| Binary serve mode tool calls | `POST /session/:id/message` with agent permissions works but the model needs to be prompted to use tools explicitly |

### Fixed (2026-05-29 session 4)

| Fix | Detail |
|-----|--------|
| Compaction headroom with `limit.input` | `overflow.ts` now subtracts output headroom for input-limited models (#10634) |
| Desktop subagent nav | `SessionSubagentBar` — Parent/Prev/Next + context indicator (TUI parity) |
| E2E serve invalid-model | Wired `stepServeInvalidModel` into standard tier |
| E2E backend-live | Wired `stepVscodeBackendLive` into standard tier |
| VS Code MCP panel | Always visible in Settings; lists servers or "None configured" |
| VS Code debug noise | File logging gated behind `LOCALCODER_VSCODE_DEBUG=1` |

### Key architecture note discovered

The `localcoder serve` prompt API is:
- **Endpoint**: `POST /session/:sessionID/message` (NOT `/prompt`)
- **Behavior**: Synchronous — waits for full AI response before returning
- **Format**: Returns `{ info: AssistantMessage, parts: Part[] }` where parts include tool results
- **Tools**: Must set `permission: { write: "allow", edit: "allow" }` in localcoder.json

---

## VS Code extension — llama.cpp E2E

**Status:** Implemented — `localcoder-llamacpp.test.ts`, `extension-llamacpp.test.ts`  
**Enable:** `VSCODE_LLAMA_E2E=1` (llama-server on `:8080` + built CLI)

**Remaining:** Tool-calling reliability with Qwopus — model sometimes responds without invoking tools; prompt/permission tuning in progress.

### Required for live E2E

- Built `localcoder.exe` at `packages/localcoder/dist/localcoder-windows-x64/bin/`
- llama-server running or `LLAMACPP_SKIP_SERVER=1` with server already up
- Workspace `localcoder.json` with `permission: { write: "allow", edit: "allow", bash: "allow" }`

### Run

```powershell
& "<llama-dir>\llama-server.exe" -m "<model.gguf>" --host 127.0.0.1 --port 8080 -c 16384 --jinja

$env:VSCODE_LLAMA_E2E = "1"
$env:LLAMACPP_API_URL = "http://127.0.0.1:8080/v1"
cd sdks/vscode && bun run test          # Electron host
# Or: bun x mocha out/test/suite/localcoder-llamacpp.test.js --ui tdd --timeout 300000
```

**Prompt tip:** Qwopus/Qwen3 with thinking blocks may describe actions instead of calling tools — use explicit "Call the write tool now" instructions.

---

### Tool permission pre-filtering — denied tools no longer shown to LLM

| Symptom | Fix |
|---------|-----|
| LLM saw tools it couldn't invoke (e.g. `question` for subagents, `todowrite` for explore) | `tools()` in `ToolRegistry` now checks `Permission.evaluate(tool.id, "*", agent.permission)` before including a tool in the model schema |

**File:** `packages/localcoder/src/tool/registry.ts`

**Effect:** The `explore` agent no longer receives `todowrite` in its schema; `compaction` / `title` / `summary` agents receive only the tools their permission ruleset explicitly allows.

### Session search tool (`session_search`) — cross-session recall

Implements the **Hermes Agent** pattern of FTS-backed cross-session memory. The agent can now search past sessions by title and message content, enabling it to recall prior work, past decisions, and previously discovered solutions without the user re-explaining context.

- **Title search**: SQLite LIKE query on `session.title` (fast, instant)
- **Content search**: `json_extract` over `part.data` text fields for user message body search
- **Scope**: `"title"`, `"content"`, or `"all"` (default)
- Automatically pre-filtered by the agent permission system (like every other tool)

**Files:** `packages/localcoder/src/tool/session-search.ts`, `packages/localcoder/src/tool/session-search.txt`, `packages/localcoder/src/tool/registry.ts`

### Skill-creation nudge in system prompt — Hermes-style memory persistence

When no project skills exist but the working directory has **5 or more past sessions**, the system prompt includes a `<memory-nudge>` reminding the agent to suggest creating a `.localcoder/skills/<name>/SKILL.md` file for repeated workflows. This mirrors Hermes Agent's "periodic nudges for memory persistence" design.

**File:** `packages/localcoder/src/session/system.ts`

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
| ~~Tool schema ↔ permission alignment~~ | ✅ **Done (v1.14.45)** — denied tools pre-filtered in `resolveTools()` / `registry.tools()` |
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
| Config wizard | ~~`localcoder onboard`~~ — **partial:** `llamacpp setup` + `auth set-api` + IDE wizards done; unified `onboard` TBD |
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

- **Config:** `~/.localcoder/llamacpp.json` (wizard writes this)
- **API:** `GET/POST /global/llamacpp/{status,setup,start,stop,thinking}`
- **CLI:** `localcoder llamacpp setup|status|stop`

```powershell
# Interactive (recommended)
localcoder llamacpp setup

# Manual server (only if not using autostart)
& "<llama-dir>\llama-server.exe" -m "<model.gguf>" --host 127.0.0.1 --port 8080 -c 16384 --jinja
```

---

## Priority matrix (consolidated)

| Priority | Theme | Top items |
|----------|-------|-----------|
| **P0** | Architecture | v2 events + agent loop; VS Code tool-calling E2E reliability |
| **P0** | Shipping | Rebuild portable exe; macOS build on tag; CLI tri-platform CI |
| **P0** | Zero-config | ✅ llama.cpp + cloud wizards (CLI, VS Code, desktop) |
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
| VS Code 84+ tests | Desktop GUI, subagent nav, mac/linux, live llama tool calls |
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
