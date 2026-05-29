# LocalCoder VS Code Extension — Changelog & Roadmap

**Last updated:** 2026-05-29  
**Test status:** 93+ unit contract tests (`bun run test:unit` ~5s); full `bun run test` includes Electron; webview visual tests in repo `packages/app/e2e/visual/`

---

## Completed (2026-05-29)

### Zero-config providers
- **First-run wizard** — llama.cpp, OpenRouter, OpenCode Go, Groq, Gemini, Ollama, OpenAI-compatible
- **`LocalCoder: Set up llama.cpp`** — folder picker, GGUF discovery, context presets, thinking toggle
- **`LocalCoder: Connect cloud provider`** — API key → `localcoder auth set-api` (no manual JSON)
- **Settings (⚙)** — "Set up llama.cpp" and "Connect cloud provider" buttons in chat overlay

### Agent UX (2026-05-22 – 2026-05-29)
- Live reasoning stream (`reasoning_delta` SSE)
- Composer-style input, usage bar, message queue while busy
- Regenerate, compact (`/compact`), slash commands
- SecretStorage for API keys (not plaintext globalState)
- CodeLens: Explain, Fix, Ask, Edit on selections
- Todo panel via SSE `todo.updated`
- Native `vscode.diff` on edit/write tool completion
- Session search in overlay; model/agents/MCP badge in settings

### Core (2026-05-20 – 2026-05-22)
- Live SSE streaming, abort, Build/Plan agent, @ mentions, undo per turn/file
- Desktop UI parity — click-to-undo matches VS Code/TUI
- Install-path fixes — resolves `localcoder.exe`, migrates stale `none` backend
- 84+ unit/integration tests (SSE parser, chat HTML contract, OpenAI backend, manifest)

---

## High priority (next)

- [x] **Native diff apply/reject** — Accept/Reject in chat changes bar, diff editor title, CodeLens, Ctrl+Shift+Y/N
- [x] **MCP panel** — MCP servers listed in Settings overlay (empty state when none configured)
- [x] **Header model picker** — Cursor-style dropdown in chat header (not only settings overlay)
- [x] **Subagent navigation bar** — Parent/Prev/Next when session has `parentID` (desktop parity)
- [x] **Stop button sync** — `agentStatus`/`sessionStatus` idle clears busy state
- [x] **Compaction summary UX** — webview shows "Context compacted." banner only (no template body in chat)
- [x] **Visual webview regression** — Playwright specs under `packages/app/e2e/visual/`
- [ ] **Model picker** — persist last model per workspace folder
- [ ] **Reliable stop-button sync** during slow abort on server

## Medium priority

- [ ] OpenAI backend session persistence across reloads
- [ ] Anthropic Messages API backend
- [ ] Drag-and-drop file / image upload
- [ ] Real llama.cpp VS Code E2E stable tool-calling (Qwopus prompt tuning — mostly working; keep monitoring)

## Low priority

- [ ] Light theme polish for webview
- [ ] Voice input via VS Code speech API

---

## Known issues

1. **Monorepo layout** — LocalCoder backend expects `packages/localcoder` or `localcoder.packagePath`.
2. **Bun or built exe** — required to spawn the local agent server.
3. **OpenAI backend** — chat only, no tools; sessions in-memory until persisted.
4. **Cloud provider cold start** — first `run` may take 10–15s; use Settings wizard to pre-configure keys.
5. **Shift+Enter in terminal TUI** — use `Ctrl+Enter` / `Ctrl+J` for newline.

---

## Test suites

| Command | What it runs |
|---------|----------------|
| `bun run test:unit` | Mocha contract tests (~5s, no Electron) |
| `bun run test` | Full suite + VS Code host integration |
| `bun run test:llama-e2e` | Live llama.cpp (`VSCODE_LLAMA_E2E=1`) |
| `bun run ../../scripts/vscode-extension-e2e.ts` | compile + unit + optional Electron |

See [IMPROVEMENT_AND_FIX.md](../../IMPROVEMENT_AND_FIX.md)
