# LocalCoder VS Code Extension — Changelog & Roadmap

**Last updated:** 2026-05-20  
**Test status:** **84/84 passing** (`bun run test` — unit + live HTTP + VS Code host integration)

---

## Completed

### Install-path fixes (v1.14.38)
- **LocalcoderBackend** resolves built `localcoder.exe`, PATH, then Bun fallback
- Migrates stale `chatBackendConfig.type === "none"` to `localcoder`
- Live tests use Windows `.exe` when `dist/localcoder-windows-x64` exists
- `needsSetup` opens settings when backend fails to start

### Agentic core (2026-05-20)
- **Live SSE streaming** — `/global/event` parsed via `src/backends/sse-events.ts`; tokens and tools stream to the webview during turns
- **Abort** — `AbortController` + server `/session/{id}/abort`
- **Build / Plan agent** — header selector; `agent` sent on message POST
- **@ file mentions** — autocomplete (`listFiles`) + file parts embedded in prompts
- **Undo** — turn-level “Revert all” + per-file ↩ on the changes bar
- **VS Code settings** — `localcoder.packagePath`, `bunPath`, `defaultAgent`, `openDiffOnEdit`
- **Commands** — undo (`Ctrl+Shift+U`), add selection (`Ctrl+Shift+A`), explain/fix selection
- **Activation** — `onView:localcoder.chatView` (sidebar loads without extra command)
- **Marketplace icon** — `images/icon.png`

### UX (prior)
- Activity Bar sidebar + floating panel (`Ctrl+Shift+L`)
- First-run provider wizard (Gemini, Groq, Ollama, OpenAI-compatible, LocalCoder backend)
- Self-contained webview (no CDN), tool cards, diff rendering, thinking blocks, sessions
- Terminal TUI bridge + active file context badge

### Test suite (84 tests, 10 suites)

| Suite | Tests | Coverage |
|-------|-------|----------|
| Tool read/glob | 7 | Read, Glob shapes, history |
| Tool write/edit | 6 | FS I/O, diff fields |
| Tool shell | 8 | stdout/stderr, exit codes, truncation |
| Tool agent | 7 | delegation, metadata |
| Conversation + search | 17 | multi-turn, Grep/WebSearch/WebFetch |
| SSE events parser | 9 | deltas, tools, session filter, SSE blocks |
| Extension manifest | 6 | package.json, commands, config, keybindings |
| OpenAI backend | 5 | config, abort, API key validation |
| Undo snapshots | 4 | write tools, restore simulation |
| Chat HTML contract | 7 | DOM ids, message handlers, @mentions |
| Backend live HTTP | 3 | health, session CRUD, SSE connect |
| Extension integration | 5 | activate, commands, config (Electron) |

**Run tests:**
```bash
cd sdks/vscode
bun run test              # full suite (downloads VS Code once)
bun run test:unit         # mocha only (no Electron)
bun run ../../scripts/vscode-extension-e2e.ts   # compile + unit + optional vscode-test
```

---

## High priority (next)

- [ ] **Native diff apply/reject** — `vscode.diff` + snapshot content provider
- [ ] **MCP** — expose LocalCoder MCP config in the extension
- [ ] **Inline chat** — editor gutter / selection actions
- [ ] **SecretStorage** for API keys (replace `globalState` plaintext)
- [ ] **Context bar in webview** — token usage + `/compact` (parity with TUI)

## Medium priority

- [ ] OpenAI session persistence across reloads
- [ ] Model picker from connected provider
- [ ] Reliable stop-button UI sync during abort
- [ ] Anthropic Messages API backend
- [ ] Drag-and-drop file / image upload

## Low priority

- [ ] Light theme polish for webview
- [ ] Voice input via VS Code speech API

---

## Known issues

1. **Monorepo layout required** — LocalCoder backend expects `packages/localcoder` or `localcoder.packagePath`.
2. **Bun required** — for spawning the local agent server.
3. **OpenAI backend** — chat only, no tools; sessions in-memory until persisted.
4. **Windows paths with spaces** — rare Bash tool quoting issues.
5. **Shift+Enter in terminal TUI** — use `Ctrl+Enter` / `Ctrl+J` for newline.

See also: [IMPROVEMENT_AND_FIX.md](../../IMPROVEMENT_AND_FIX.md)
