# LocalCoder — Architecture Iteration Log

Incremental migration plan: small, testable steps toward an expandable v2 event-driven core with Cursor/Hermes-grade UX on every surface.

## Principles

1. **Dual-write until v2 agent loop is ready** — v1 `MessageV2` + v2 `SessionEventEmit` → `projectors-next` → `SessionMessageTable`.
2. **Parity belts** — each layer gets regression tests before the next layer changes.
3. **UI follows backend contracts** — VS Code webview, desktop (Solid app), and TUI consume the same session APIs.
4. **Sequential commits** — one concern per commit; push after green tests.

## Completed iterations

| # | Date | Focus | Tests |
|---|------|-------|-------|
| 1 | 2026-05-29 | Diff accept/reject, v2 event emit centralization | VS Code unit + llama E2E |
| 2 | 2026-05-29 | HttpApi 404 mapping, v2 updater/projector tests | httpapi-parity, projectors-next, processor dual-write |
| 3 | 2026-05-29 | VS Code header model picker, subagent bar, abort sync | chat-html-contract (+4) |

## Next iterations (ordered)

| # | Focus | Architecture touch | Tests |
|---|-------|-------------------|-------|
| 4 | VS Code stop-button + session status SSE hardening | Wire `sessionStatus` idle → webview consistently | VS Code unit + serve E2E |
| 5 | Desktop context meter in Playwright | Reuse `getSessionContextMetrics` | `session-ui.spec.ts` |
| 6 | v2 read path for `/api/session/:id/message` | Projectors-only reads behind flag | httpapi-session + v2 |
| 7 | Agent loop v2 (per `specs/v2/todo.md`) | Remove dual-write from processor | processor-effect + prompt |

## Layer map

```
UI (VS Code / Desktop / TUI)
        ↓ HTTP + SSE
HttpApi / Hono routes  ← mapNotFound, OpenAPI errors
        ↓
Session services (v1)  ← processor, prompt, compaction
        ↓ dual-write
SessionEventEmit → SyncEvent → projectors-next → SessionMessageTable (v2)
```

See also: [specs/v2/todo.md](../v2/todo.md), [IMPROVEMENT_AND_FIX.md](../../IMPROVEMENT_AND_FIX.md).
