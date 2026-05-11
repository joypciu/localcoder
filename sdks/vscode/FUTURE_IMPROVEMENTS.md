# Future Improvements

## Completed ✅

### Activity Bar Icon + Sidebar Chat Panel
- Full VS Code Activity Bar icon — click the LocalCoder icon to open the chat panel directly in the sidebar, just like GitHub Copilot or Claude Code
- Sidebar uses `WebviewViewProvider` (persistent context, no re-renders on focus change)
- `Ctrl+Shift+L` / `Cmd+Shift+L` still opens a floating panel tab as an alternative

### First-Run Provider Setup Wizard
- On first activation, a QuickPick walks the user through choosing an AI provider
- Free options highlighted by default: Google Gemini (free tier), Groq (free tier), Ollama (local)
- Preset configurations auto-fill endpoint + model; user only needs to enter API key
- Setting is persisted to `globalState` — wizard never shows again after setup

### Undo Last Changes (VS Code)
- After every assistant response that modifies files, a **changes bar** appears below the message
- Shows every file created or modified during that turn (✏️ icon + short path, full path on hover)
- "↩ Revert all" button restores all files to their pre-turn state using `vscode.workspace.applyEdit`
- Reverts go through VS Code's native undo stack — you can re-undo the revert with Ctrl+Z
- No git required — works on any workspace

### Chat UI Overhaul
- Self-contained webview with **no CDN dependencies** — inline Markdown renderer, inline CSS, zero external fetches
- Content Security Policy hardened to `default-src 'none'` (scripts/styles inline-only)
- Fenced code blocks with language label and **Copy** button
- **Tool call cards** — collapsible per-tool sections with icon, status badge, formatted input/output
  - Tool-type icons and color coding (📄 Read, ✏️ Edit, 💻 Bash, 🔍 Glob, 🔎 Grep, 🌐 WebSearch/WebFetch, ⚙️ Agent)
  - Shell: stdout in teal, stderr in red
  - Edit/write: unified diff view with green/red line highlights
  - Glob/Grep: structured file-path and match lists
  - Web search: title + snippet cards
  - Agent (sub-agent): collapsible delegation block
  - Auto-collapse completed tools to keep the thread readable
- **`toolCall` / `toolResult` real-time events** now handled in the webview (previously missing)
- **Thinking/reasoning blocks** — collapsible `🧠 Thinking…` section for chain-of-thought models
- Streaming cursor animation during live token output
- Message copy (📋) and 👍/👎 rating buttons per message
- Empty state with one-click suggestion chips
- Smooth fade-in animation per message turn

### Session/History
- Session dropdown in header — switch between previous conversations
- Sessions persist across VS Code restarts (stored by the localcoder backend)
- "New session" button clears the active conversation

### Test Suite (45 tests across 6 suites)
- **Test 1** — Read file + Glob search tool call shapes and edge cases
- **Test 2** — Write + Edit tool calls including actual filesystem I/O in temp dir
- **Test 3** — Bash/shell tool — stdout/stderr, exit codes, multi-command
- **Test 4** — Sub-agent delegation — Agent tool call, nested delegation, metadata
- **Test 5** — Multi-turn conversation — history accumulation, session ID stability, token totals
- **Test 6** — Grep, WebSearch, WebFetch — output shapes, zero-result edge cases, truncation

### Marketplace Readiness
- `@vscode/vsce` added to devDependencies
- `publisher`, `categories`, `keywords`, `galleryBanner` set in `package.json`
- `version` set to `1.0.0`
- Clean package file list (10 files, no dev artifacts)

---

## High Priority

### Real-time Streaming for localcoder Backend ⏳
**Currently: synchronous POST — waits for the full LLM response before rendering.**
The SSE connection to `/global/event` is established but not forwarded to the webview.
Goal: pipe SSE events (token deltas, tool start/done) into `onDelta` / `onToolCall` / `onToolResult` callbacks as they arrive, matching the OpenAI backend's streaming behaviour.

### Selective Revert (per-file)
Currently "Revert all" reverts every file in the turn. Add per-file revert so users can keep some changes and roll back others. The snapshot data is already collected per-file in the extension.

### @-Mention File Context
Type `@filename` in the chat input to reference workspace files. Show an autocomplete dropdown filtered by workspace files. Embed file contents as context in the sent prompt.

### Diff View for Code Changes
When the agent edits files, open a native VS Code diff editor showing the changes. Allow one-click apply / reject. (Inline diff in tool cards already works; native diff view is still missing.)

### OpenAI Session Persistence
OpenAI backend sessions live only in memory and are lost on extension reload. Persist session metadata to `globalState` or `ExtensionContext.storageUri`.

## Medium Priority

### Token Usage & Cost Display
Show per-message and per-session token counts and estimated cost. Display a running total in the status bar.

### Stop Generation — Reliable Abort
The stop button sends an HTTP abort request but UI state may desync. Make the abort path update the webview synchronously and cancel pending SSE reads.

### Agent Mode Switcher
For the localcoder backend, allow switching between agents (`build`, `plan`, `general`, etc.) from the chat header without restarting the session.

### Anthropic / Claude Backend
Add a third backend using Anthropic's Messages API with native tool-use support and streaming.

### Image & File Upload
Support drag-and-drop file uploads into the chat. Preview images inline, send file contents as context.

## Low Priority

### Chat Themes
Support VS Code's light theme and custom colour schemes (currently dark-only).

### Voice Input
Integrate VS Code's speech API for voice-to-text input in the chat.

---

## Known Issues

1. **Shift+Enter in VS Code terminal** — Many terminal emulators cannot distinguish Shift+Enter from plain Enter at the byte level. Use `Ctrl+Enter` or `Ctrl+J` instead to insert a newline in the localcoder TUI.
2. **OpenAI history grows unbounded** — Messages accumulate in memory with no compaction. Long conversations will eventually hit the model's context limit.
3. **Streaming abort for OpenAI is incomplete** — `AbortController` is created but the stream-reading loop does not check it on every chunk.
4. **localcoder server port race** — Rare: if the free-port probe and server bind race, the server may fail to start. Retry logic partially mitigates this.
5. **Windows path quoting** — Workspace paths containing spaces may need additional escaping in some Bash tool commands.
