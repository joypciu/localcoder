# LocalCoder — Architecture Iteration Log

Incremental migration plan: small, testable steps toward an expandable v2 event-driven core with Cursor/Hermes-grade UX on every surface.

## Principles

1. **Dual-write until v2 agent loop is ready** — v1 `MessageV2` + v2 `SessionEventEmit` → `projectors-next` → `SessionMessageTable`.
2. **Parity belts** — each layer gets regression tests before the next layer changes.
3. **UI follows backend contracts** — VS Code webview, desktop (Solid app), and TUI consume the same session APIs.
4. **Visual regression for dialogs** — OpenTUI char-frames + Playwright webview screenshots catch layout bugs unit tests miss.
5. **Sequential commits** — one concern per commit; push after green tests.

## Completed iterations

| # | Date | Focus | Tests |
|---|------|-------|-------|
| 1 | 2026-05-29 | Diff accept/reject, v2 event emit centralization | VS Code unit + llama E2E |
| 2 | 2026-05-29 | HttpApi 404 mapping, v2 updater/projector tests | httpapi-parity, projectors-next, processor dual-write |
| 3 | 2026-05-29 | VS Code header model picker, subagent bar, abort sync | chat-html-contract (+4) |
| 4 | 2026-05-29 | SSE abort watchdog + `aborted` webview message | sse-events (+3), chat-html-contract |
| 5 | 2026-05-29 | Playwright live session context meter | `session-ui.spec.ts` + seed globalSetup |
| 6 | 2026-05-29 | v2 read bridge + parity test | `message-read-parity.test.ts` |
| 7 | 2026-05-29 | VS Code command palette + drag-and-drop attachments | chat-html-contract, command palette cmd |
| 8 | 2026-05-29 | **Visual regression tool** — TUI dialogs, VS Code webview, app shell | `test/visual/` (8), `e2e/visual/*.spec.ts`, `bun run visual-test` |
| 9 | 2026-05-29 | **TUI llama/connect UX** — orphan text, /connect order, session delete | visual + manual QA |
| 10 | 2026-05-29 | **Ctx restart + compaction UX** — 128K server restart, overflow, summary hide | `overflow.test.ts`, webview compact banner |

## Next iterations (ordered)

| # | Focus | Architecture touch | Tests |
|---|-------|-------------------|-------|
| 11 | Agent loop v2 (per `specs/v2/todo.md`) | Remove dual-write from processor | processor-effect + prompt |
| 12 | v1 message handler → v2 read behind flag | `v2-read-bridge` full MessageV2 mapping | httpapi-session parity |
| 13 | ctx-mismatch warning in TUI/desktop status | Compare saved ctx vs running server | visual snapshot |
| 14 | Desktop drag-and-drop on composer | Match VS Code attach chips | Playwright composer spec |

## Layer map

```
UI (VS Code / Desktop / TUI)
        ↓ HTTP + SSE
HttpApi / Hono routes  ← mapNotFound, OpenAPI errors
        ↓
Session services (v1)  ← processor, prompt, compaction, overflow
        ↓ dual-write
SessionEventEmit → SyncEvent → projectors-next → SessionMessageTable (v2)
        ↑
v2-read-bridge (summaries today; full WithParts mapping next)

Visual belt (parallel):
  test/visual/ + scripts/visual-test/  ← char-frames + Playwright screenshots
```

See also: [specs/v2/todo.md](../v2/todo.md), [IMPROVEMENT_AND_FIX.md](../../IMPROVEMENT_AND_FIX.md).
