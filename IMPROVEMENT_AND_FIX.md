# LocalCoder — Improvements, Fixes & Roadmap

**Updated:** 2026-05-20 (v1.14.38) (v1.14.38)  
**VS Code extension tests:** **84/84 passing** (`cd sdks/vscode && bun run test`)

---

## Executive summary

| Area | Status | Score |
|------|--------|-------|
| TUI + llama.cpp (Qwopus, tools, context) | Production-ready | **8.0/10** |
| VS Code extension (agentic, SSE, undo, @files) | E2E verified | **~7.8/10** |
| Desktop (Electron, Win/Mac installers) | CI release.yml | **~7.5/10** |
| Desktop (Electron, Win/Mac installers) | CI + local package scripts | **~7.5/10** |
| vs Copilot / Claude Code / Kilo | Gap: MCP, inline chat, native diff | — |

---

## VS Code extension — verified (E2E)

### Implemented & tested

| Feature | Test coverage |
|---------|----------------|
| SSE live streaming | `sse-events.test.ts` (9), live SSE connect |
| Tool call shapes | Suites 1–4, 6 (35 tests) |
| Multi-turn / session | Suite 5 (8 tests) |
| Undo write tools | `undo-snapshots.test.ts` (4) |
| @ mentions + agent/files in send | `chat-html-contract.test.ts` (7) |
| package.json / commands / config | `extension-manifest.test.ts` (6) |
| Extension activate + commands | `extension-integration.test.ts` (5) |
| Live HTTP server | `backend-live.test.ts` (3) |
| OpenAI backend edges | `openai-backend.test.ts` (5) |

### Run tests

```bash
# Full (unit + live + VS Code Electron)
cd sdks/vscode && bun run test

# Fast unit only
cd sdks/vscode && bun run test:unit

# Orchestrator from repo root
bun run scripts/vscode-extension-e2e.ts
```

### Remaining P0

- Native diff apply/reject (`vscode.diff`)
- MCP in extension
- Inline editor chat
- SecretStorage for API keys
- Context/token bar in webview

---

## Core / TUI (completed)

- **Qwopus3.5-9B** default for 16 GB GPU, 16k context, MTP
- Overflow/compaction for ≤32k models
- `/context`, context usage bar, `/compact`
- Portable `llamacpp-setup.ts` + example config
- **agent-tool-real-e2e.ts** — 9/10 live tool tasks

---

## Competitor matrix (abbrev.)

| Capability | Copilot | Claude Code | LocalCoder VS Code |
|------------|---------|-------------|-------------------|
| Sidebar chat | ✓ | ✓ | ✓ |
| Live stream + tools | ✓ | ✓ | ✓ |
| File undo | ✓ | ✓ | ✓ (turn + per-file) |
| @ files | ✓ | ✓ | ✓ |
| Local llama | — | — | ✓ (TUI + backend) |
| MCP | ✓ | ✓ | TUI only |

---

## Files (VS Code test pass)

- `src/backends/sse-events.ts` — testable SSE parser
- `src/test/suite/*.test.ts` — 10 suites, 84 tests
- `scripts/vscode-extension-e2e.ts` — E2E runner

See `sdks/vscode/FUTURE_IMPROVEMENTS.md` for detailed changelog.
