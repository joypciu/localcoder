import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import type { ChatBackend } from "./backends/types";
import type { BackendConfig } from "./backends/types";
import { LocalcoderBackend } from "./backends/localcoder";
import { OpenAIBackend } from "./backends/openai";

const DEBUG_FILE = path.join(__dirname, "..", "debug.txt");
function log(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 23);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(DEBUG_FILE, line + "\n"); } catch { /* ignore */ }
}

// Tool names that write to the filesystem — snapshot these for undo
const WRITE_TOOLS = new Set(["Edit", "Write", "edit", "write", "edit_file", "write_file"]);

// ---------------------------------------------------------------------------
// Shared base — backend + message handling + file-snapshot undo
// ---------------------------------------------------------------------------
type OpenAIStoredSession = { id: string; title: string; messages: import("./backends/types").ChatMessage[] };

abstract class ChatProviderBase {
  protected _backend?: ChatBackend;
  protected _config: BackendConfig;
  protected _extensionPath: string;
  protected _inited = false;
  protected _configLoaded = false;
  protected _disposables: vscode.Disposable[] = [];

  // Undo: map of absolutePath → file content BEFORE the current turn's edits
  private _turnSnapshots = new Map<string, Uint8Array | null>();
  private _runningTools = new Map<string, { name: string; input?: Record<string, unknown> }>();
  private _hasUndo = false;

  constructor(protected readonly _context: vscode.ExtensionContext) {
    this._extensionPath = _context.extensionPath;
    this._config = this.loadConfig();
    log(`CHAT init backend=${this._config.type}`);
  }

  protected abstract postMessage(msg: any): void;

  protected loadConfig(): BackendConfig {
    const c = this._context.globalState.get<BackendConfig>("chatBackendConfig");
    if (!c) { return { type: "localcoder" }; }
    // Older builds defaulted to "none" and broke the sidebar; recover automatically
    if (c.type === "none") { return { ...c, type: "localcoder" }; }
    return c;
  }

  protected async ensureSecretsLoaded() {
    if (this._configLoaded) { return; }
    try {
      const key = await this._context.secrets.get("localcoder.openaiKey");
      if (key) { this._config.openaiKey = key; }
    } catch { /* ignore */ }
    this._configLoaded = true;
  }

  protected workspaceKey(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "global";
  }

  protected async persistChatSession(sessionId: string | null) {
    const key = this.workspaceKey();
    const map = this._context.globalState.get<Record<string, string>>("lastChatSessionByWorkspace") ?? {};
    if (sessionId) { map[key] = sessionId; } else { delete map[key]; }
    await this._context.globalState.update("lastChatSessionByWorkspace", map);
    if (this._backend?.type === "openai" && this._backend instanceof OpenAIBackend) {
      await this._context.globalState.update("openaiChatSessions", this._backend.exportSessions());
    }
  }

  protected async restoreLastChatSession(backend: ChatBackend) {
    const last = this._context.globalState.get<Record<string, string>>("lastChatSessionByWorkspace")?.[this.workspaceKey()];
    if (!last) { return; }
    const sessions = await backend.listSessions();
    if (!sessions.some((s) => s.id === last)) { return; }
    backend.setActiveSessionId(last);
    const messages = await backend.loadMessages(last);
    this.postMessage({ type: "messages", messages, sessionId: last });
    this.postUsage(messages);
  }

  protected async saveConfig() {
    const { openaiKey, ...rest } = this._config;
    await this._context.globalState.update("chatBackendConfig", {
      ...rest,
      openaiKey: openaiKey ? "***" : undefined,
    });
    if (openaiKey && openaiKey !== "***") {
      await this._context.secrets.store("localcoder.openaiKey", openaiKey);
    }
  }

  protected getOrCreateBackend(): ChatBackend | undefined {
    if (this._config.type === "none") {
      return undefined;
    }
    if (!this._backend) {
      if (this._config.type === "openai") {
        const backend = new OpenAIBackend({
          apiKey: this._config.openaiKey,
          endpoint: this._config.openaiEndpoint,
          model: this._config.openaiModel,
        });
        const stored = this._context.globalState.get<OpenAIStoredSession[]>("openaiChatSessions");
        if (stored?.length) { backend.restoreSessions(stored); }
        this._backend = backend;
      } else {
        const backend = new LocalcoderBackend(this._extensionPath);
        this.wireBackendEvents(backend);
        this._backend = backend;
      }
    }
    return this._backend;
  }

  protected wireBackendEvents(backend: ChatBackend) {
    if (backend instanceof LocalcoderBackend) {
      backend.setPushListener((msg) => this.postMessage(msg));
    }
  }

  protected async postWorkspaceMeta(backend: ChatBackend) {
    if (!(backend instanceof LocalcoderBackend)) { return; }
    try {
      const meta = await backend.fetchWorkspaceMeta();
      this.postMessage({ type: "workspaceMeta", meta });
      const sid = backend.getActiveSessionId();
      if (sid) {
        const todos = await backend.getTodos(sid);
        this.postMessage({ type: "todos", sessionId: sid, todos });
      }
    } catch { /* ignore */ }
  }

  protected buildInitPayload(backend?: ChatBackend, error?: string) {
    const defaultAgent = vscode.workspace.getConfiguration("localcoder").get<string>("defaultAgent") || "build";
    return {
      type: "init" as const,
      backend: backend?.type ?? this._config.type,
      error,
      defaultAgent,
      config: {
        openaiKey: this._config.openaiKey ? "***" : "",
        openaiEndpoint: this._config.openaiEndpoint || "",
        openaiModel: this._config.openaiModel || "",
      },
    };
  }

  protected async startBackend() {
    await this.ensureSecretsLoaded();
    if (this._config.type === "none") {
      this.postMessage({
        ...this.buildInitPayload(undefined, "No provider configured. Open settings (gear) and choose LocalCoder backend or an API."),
        needsSetup: true,
      });
      this._inited = true;
      return;
    }
    let backend: ChatBackend;
    try {
      backend = this.getOrCreateBackend()!;
    } catch (e: any) {
      log(`CHAT backend create error: ${e.message}`);
      this.postMessage({ type: "error", message: e.message });
      this.postMessage(this.buildInitPayload(undefined, e.message));
      this._inited = true;
      return;
    }
    log(`CHAT starting backend: ${backend.type}`);
    try {
      await backend.start();
      log(`CHAT backend started`);
      this.postMessage(this.buildInitPayload(backend));
      await this.postWorkspaceMeta(backend);
      this._inited = true;
      await this.restoreLastChatSession(backend);
      this.sendActiveFile();
    } catch (e: any) {
      log(`CHAT backend start error: ${e.message}`);
      this.postMessage({ type: "error", message: e.message });
      this.postMessage(this.buildInitPayload(backend, e.message));
      this._inited = true;
    }
  }

  // ---------------------------------------------------------------------------
  // File snapshot helpers (for undo)
  // ---------------------------------------------------------------------------

  private async snapshotFile(filePath: string) {
    const abs = this.resolveFilePath(filePath);
    if (this._turnSnapshots.has(abs)) { return; } // already snapshotted
    try {
      const uri = vscode.Uri.file(abs);
      const content = await vscode.workspace.fs.readFile(uri);
      this._turnSnapshots.set(abs, content);
      log(`SNAP ${filePath}`);
    } catch {
      // File doesn't exist yet (new file being created) — snapshot null so we
      // know to delete it on undo.
      this._turnSnapshots.set(abs, null);
    }
  }

  private async restoreSnapshots() {
    if (!this._hasUndo || this._turnSnapshots.size === 0) {
      this.postMessage({ type: "error", message: "Nothing to undo." });
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    const toDelete: vscode.Uri[] = [];

    for (const [filePath, content] of this._turnSnapshots) {
      const uri = vscode.Uri.file(filePath);
      if (content === null) {
        // File was created this turn — delete it
        toDelete.push(uri);
      } else {
        // File existed before — restore original content
        edit.replace(
          uri,
          new vscode.Range(
            new vscode.Position(0, 0),
            new vscode.Position(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
          ),
          Buffer.from(content).toString("utf8"),
        );
      }
    }

    // Apply edits (these go into VS Code's undo stack)
    if (edit.size > 0) {
      await vscode.workspace.applyEdit(edit);
      // Save all restored files
      for (const [filePath] of this._turnSnapshots) {
        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
          await doc.save();
        } catch { /* ignore */ }
      }
    }

    // Delete newly created files
    const deleteEdit = new vscode.WorkspaceEdit();
    for (const uri of toDelete) {
      deleteEdit.deleteFile(uri, { ignoreIfNotExists: true });
    }
    if (toDelete.length > 0) {
      await vscode.workspace.applyEdit(deleteEdit);
    }

    const count = this._turnSnapshots.size;
    this._turnSnapshots.clear();
    this._hasUndo = false;
    this.postMessage({ type: "undone", count });
    log(`UNDO restored ${count} file(s)`);
  }


  private async openFileInEditor(filePath: string) {
    const abs = this.resolveFilePath(filePath);
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
      await vscode.window.showTextDocument(doc, { preview: false });
    } catch (e: any) {
      this.postMessage({ type: "error", message: `Cannot open ${filePath}: ${e.message}` });
    }
  }

  private computeUsage(messages: import("./backends/types").ChatMessage[]) {
    let input = 0;
    let output = 0;
    for (const m of messages) {
      if (m.role === "assistant" && m.tokens) {
        input += m.tokens.input ?? 0;
        output += m.tokens.output ?? 0;
      }
    }
    return { input, output, messages: messages.length };
  }

  private postUsage(messages?: import("./backends/types").ChatMessage[]) {
    const msgs = messages ?? [];
    this.postMessage({ type: "usage", ...this.computeUsage(msgs) });
  }

  private resolveFilePath(filePath: string): string {
    const wf = vscode.workspace.workspaceFolders?.[0];
    if (!wf) { return filePath; }
    if (path.isAbsolute(filePath)) { return filePath; }
    return path.join(wf.uri.fsPath, filePath);
  }

  private async restoreOneFile(filePath: string) {
    const abs = this.resolveFilePath(filePath);
    const content = this._turnSnapshots.get(abs);
    if (content === undefined) {
      this.postMessage({ type: "error", message: `No snapshot for ${filePath}` });
      return;
    }
    const uri = vscode.Uri.file(abs);
    if (content === null) {
      const del = new vscode.WorkspaceEdit();
      del.deleteFile(uri, { ignoreIfNotExists: true });
      await vscode.workspace.applyEdit(del);
    } else {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(new vscode.Position(0, 0), new vscode.Position(Number.MAX_VALUE, Number.MAX_VALUE)), Buffer.from(content).toString("utf8"));
      await vscode.workspace.applyEdit(edit);
      try { const doc = await vscode.workspace.openTextDocument(uri); await doc.save(); } catch { /* ignore */ }
    }
    this._turnSnapshots.delete(abs);
    if (this._turnSnapshots.size === 0) { this._hasUndo = false; }
    this.postMessage({ type: "fileUndone", path: abs });
    log(`UNDO one file ${abs}`);
  }

  private async maybeOpenDiff(tool: { name: string; input?: Record<string, unknown> }) {
    const cfg = vscode.workspace.getConfiguration("localcoder");
    if (!cfg.get<boolean>("openDiffOnEdit", true)) { return; }
    if (!WRITE_TOOLS.has(tool.name)) { return; }
    const fp = tool.input?.file_path ?? tool.input?.path ?? tool.input?.filename;
    if (typeof fp !== "string") { return; }
    const abs = this.resolveFilePath(fp);
    const uri = vscode.Uri.file(abs);
    try {
      const afterDoc = await vscode.workspace.openTextDocument(uri);
      const before = this._turnSnapshots.get(abs);
      if (before === undefined) { return; }
      const beforeDoc = await vscode.workspace.openTextDocument({
        content: before === null ? "" : Buffer.from(before).toString("utf8"),
        language: afterDoc.languageId,
      });
      const title = `${path.basename(abs)} (LocalCoder)`;
      await vscode.commands.executeCommand("vscode.diff", beforeDoc.uri, afterDoc.uri, title);
    } catch { /* ignore */ }
  }

  async listWorkspaceFiles(query: string): Promise<{ path: string; label: string }[]> {
    const wf = vscode.workspace.workspaceFolders?.[0];
    if (!wf) { return []; }
    const q = query.toLowerCase();
    const out: { path: string; label: string }[] = [];
    const files = await vscode.workspace.findFiles("**/*", "**/node_modules/**", 200);
    for (const uri of files) {
      const rel = vscode.workspace.asRelativePath(uri);
      if (q && !rel.toLowerCase().includes(q)) { continue; }
      out.push({ path: rel, label: rel });
      if (out.length >= 30) { break; }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Exposed for VS Code commands */
  async commandUndo() { await this.restoreSnapshots(); }
  async commandInsertText(text: string) { this.postMessage({ type: "insertText", text }); }
  async commandSendText(text: string) {
    if (!this._inited) { await this.startBackend(); }
    const agent = vscode.workspace.getConfiguration("localcoder").get<string>("defaultAgent") || "build";
    this.postMessage({ type: "streamStart", text, agent });
    await this.handleMessage({ type: "sendMessage", text, agent, history: [], files: [] });
  }

  getBackend(): ChatBackend | undefined {
    return this._backend;
  }

  async restartBackend(): Promise<void> {
    this._backend?.dispose();
    this._backend = undefined;
    this._inited = false;
    await this.startBackend();
  }


  // ---------------------------------------------------------------------------
  // Message handler
  // ---------------------------------------------------------------------------

  protected async handleMessage(msg: any) {
    const backend = this._backend;
    log(`RECV ${msg.type}`);

    try {
      switch (msg.type) {
        case "ready": {
          if (this._inited && backend) {
            this.postMessage(this.buildInitPayload(backend));
            this.sendActiveFile();
          }
          break;
        }

        case "connectProvider":
          await vscode.commands.executeCommand("localcoder.connectProvider");
          break;

        case "setupLlamaCpp":
          await vscode.commands.executeCommand("localcoder.setupLlamaCpp");
          break;

        case "setConfig":
          if (msg.config) {
            if (msg.config.openaiKey && msg.config.openaiKey !== "***") {
              this._config.openaiKey = msg.config.openaiKey;
            }
            if (msg.config.openaiEndpoint) { this._config.openaiEndpoint = msg.config.openaiEndpoint; }
            if (msg.config.openaiModel) { this._config.openaiModel = msg.config.openaiModel; }
            await this.saveConfig();

            if (backend && backend.type === "openai" && backend instanceof OpenAIBackend) {
              backend.updateConfig({
                apiKey: this._config.openaiKey,
                endpoint: this._config.openaiEndpoint,
                model: this._config.openaiModel,
              });
            }
            this.postMessage({
              type: "configSaved",
              config: { ...this._config, openaiKey: this._config.openaiKey ? "***" : "" },
            });
          }
          break;

        case "switchBackend": {
          const requested = msg.backend;
          if (requested === this._config.type) { break; }

          const fallbackType = this._config.type;
          this._config.type = requested;
          await this.saveConfig();

          this._backend?.dispose();
          this._backend = undefined;
          const newBackend = this.getOrCreateBackend();
          if (!newBackend) { break; }

          try {
            await newBackend.start();
            this._inited = true;
            this.wireBackendEvents(newBackend);
            this.postMessage(this.buildInitPayload(newBackend));
            await this.postWorkspaceMeta(newBackend);
          } catch (e: any) {
            log(`CHAT switch error: ${e.message}`);
            this.postMessage({ type: "error", message: e.message });
            this._config.type = fallbackType;
            await this.saveConfig();
            this._backend = undefined;
            const fallback = this.getOrCreateBackend();
            if (!fallback) { break; }
            try {
              await fallback.start();
              this.postMessage(this.buildInitPayload(fallback));
            } catch {
              this.postMessage({ type: "error", message: "Failed to start any backend" });
            }
          }
          break;
        }

        case "listSessions": {
          if (!backend) { break; }
          const sessions = await backend.listSessions(msg.query);
          this.postMessage({ type: "sessions", sessions });
          break;
        }

        case "loadMessages": {
          if (!backend) { break; }
          const messages = await backend.loadMessages(msg.sessionId);
          await this.persistChatSession(msg.sessionId);
          this.postMessage({ type: "messages", messages, sessionId: msg.sessionId });
          this.postUsage(messages);
          if (backend instanceof LocalcoderBackend) {
            const todos = await backend.getTodos(msg.sessionId);
            this.postMessage({ type: "todos", sessionId: msg.sessionId, todos });
          }
          break;
        }

        case "setAgent": {
          const agent = msg.agent as string;
          if (agent === "build" || agent === "plan") {
            await vscode.workspace.getConfiguration("localcoder").update("defaultAgent", agent, true);
          }
          break;
        }

        case "compactSession": {
          if (!backend?.compactSession) {
            this.postMessage({ type: "error", message: "Compact is only available with the LocalCoder backend." });
            break;
          }
          try {
            await backend.compactSession();
            const sid = backend.getActiveSessionId();
            if (sid) {
              const messages = await backend.loadMessages(sid);
              this.postMessage({ type: "messages", messages, sessionId: sid });
              this.postUsage(messages);
            }
            this.postMessage({ type: "compactDone" });
          } catch (e: any) {
            this.postMessage({ type: "error", message: e.message || "Compact failed" });
          }
          break;
        }

        case "openFile":
          if (msg.path) { await this.openFileInEditor(String(msg.path)); }
          break;

        case "newSession":
          backend?.setActiveSessionId(null);
          await this.persistChatSession(null);
          break;

        case "sendMessage": {
          if (this._config.type === "none") {
            this.postMessage({ type: "error", message: "Configure a provider in settings before sending messages." });
            break;
          }
          if (!backend) { break; }
          // Clear undo snapshots for new turn
          this._turnSnapshots.clear();
          this._runningTools.clear();
          this._hasUndo = false;

          const sessionId = backend.getActiveSessionId() || msg.sessionId;
          backend.setActiveSessionId(sessionId);

          const agent = msg.agent || vscode.workspace.getConfiguration("localcoder").get<string>("defaultAgent") || "build";
          await backend.sendMessage(msg.text, msg.history || [], msg.files || [], {
            onDelta: (delta) => this.postMessage({ type: "streamDelta", delta }),
            onReasoningDelta: (delta) => this.postMessage({ type: "streamReasoningDelta", delta }),
            onToolCall: async (tool) => {
              // Snapshot files BEFORE they are modified, so we can undo later
              if (WRITE_TOOLS.has(tool.name)) {
                const filePath = tool.input?.file_path ?? tool.input?.path ?? tool.input?.filename;
                if (typeof filePath === "string") {
                  await this.snapshotFile(filePath);
                }
              }
              this.postMessage({ type: "agentStatus", status: "tool", tool: tool.name });
              this._runningTools.set(tool.id, { name: tool.name, input: tool.input });
              this.postMessage({ type: "toolCall", tool });
            },
            onToolResult: async (id, status, output) => {
              this.postMessage({ type: "toolResult", id, status, output });
              if (status === "completed") {
                const t = this._runningTools.get(id);
                if (t) { await this.maybeOpenDiff(t); }
              }
              this._runningTools.delete(id);
            },
            onDone: (message) => {
              this.postMessage({ type: "agentStatus", status: "idle" });
              // Mark undo available if any files were snapshotted
              if (this._turnSnapshots.size > 0) {
                this._hasUndo = true;
              }
              this.postMessage({ type: "streamDone", message, canUndo: this._hasUndo });
              const sid = backend.getActiveSessionId();
              if (sid) { void this.persistChatSession(sid); this.postMessage({ type: "sessionCreated", sessionId: sid }); }
              backend.listSessions().then((s) => this.postMessage({ type: "sessions", sessions: s }));
              if (message.content || message.toolCalls?.length) {
                this.postUsage([...(msg.history || []), { role: "user", content: msg.text }, {
                  role: "assistant",
                  content: message.content || "",
                  tokens: message.tokens,
                }]);
              }
            },
            onError: (error) => {
              this.postMessage({ type: "agentStatus", status: "idle" });
              this.postMessage({ type: "error", message: error });
              this.postMessage({ type: "streamDone", message: {}, canUndo: false });
            },
          }, backend.type === "localcoder" ? { agent } : undefined);
          this.postMessage({ type: "agentStatus", status: "thinking" });
          break;
        }

        case "abort":
          backend?.abort();
          this.postMessage({ type: "agentStatus", status: "idle" });
          this.postMessage({ type: "streamDone", message: {}, canUndo: false });
          break;

        case "undoLastTurn":
          await this.restoreSnapshots();
          break;

        case "undoFile":
          if (msg.path) { await this.restoreOneFile(msg.path); }
          break;

        case "listFiles": {
          const files = await this.listWorkspaceFiles(msg.query || "");
          this.postMessage({ type: "fileSuggestions", files });
          break;
        }

        case "insertText":
          break;

        case "getActiveFile":
        case "getSelection":
          this.sendActiveFile();
          break;
      }
    } catch (e: any) {
      log(`ERROR handling ${msg.type}: ${e.message}`);
      this.postMessage({ type: "error", message: e.message });
      this.postMessage({ type: "streamDone", message: {}, canUndo: false });
    }
  }

  protected getActiveFileInfo(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return undefined; }
    const wf = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!wf) { return undefined; }
    let ref = `@${vscode.workspace.asRelativePath(editor.document.uri)}`;
    const sel = editor.selection;
    if (!sel.isEmpty) {
      const s = sel.start.line + 1, e = sel.end.line + 1;
      ref += s === e ? `#L${s}` : `#L${s}-${e}`;
    }
    return ref;
  }

  protected sendActiveFile() {
    const file = this.getActiveFileInfo();
    if (file) { this.postMessage({ type: "activeFile", file }); }
  }

  protected async loadHtml(): Promise<string> {
    const htmlPath = path.join(this._extensionPath, "media", "chat.html");
    const htmlContent = await vscode.workspace.fs.readFile(vscode.Uri.file(htmlPath));
    return Buffer.from(htmlContent).toString("utf8");
  }

  protected disposeBackend() {
    this._backend?.dispose();
    this._backend = undefined;
    this._inited = false;
    this._turnSnapshots.clear();
    this._hasUndo = false;
    while (this._disposables.length) { this._disposables.pop()?.dispose(); }
  }
}

// ---------------------------------------------------------------------------
// Sidebar provider — shows the chat UI in the VS Code Activity Bar panel
// ---------------------------------------------------------------------------
export class ChatSidebarProvider extends ChatProviderBase implements vscode.WebviewViewProvider {
  public static readonly viewType = "localcoder.chatView";
  private _view?: vscode.WebviewView;

  protected postMessage(msg: any) {
    this._view?.webview.postMessage(msg);
  }

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _resolveContext: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;
    chatProviderRef = this;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(this._extensionPath)],
    };

    webviewView.webview.html = await this.loadHtml();

    webviewView.webview.onDidReceiveMessage(
      async (msg) => { await this.handleMessage(msg); },
      undefined, this._disposables,
    );

    vscode.window.onDidChangeActiveTextEditor(
      () => this.sendActiveFile(), undefined, this._disposables,
    );

    webviewView.onDidDispose(() => {
      log("CHAT sidebar disposed");
      this.disposeBackend();
      this._view = undefined;
    }, undefined, this._disposables);

    await this.startBackend();
  }
}

// ---------------------------------------------------------------------------
// Panel provider — opens chat as a floating tab (used by Ctrl+Shift+L)
// ---------------------------------------------------------------------------
export class ChatPanelProvider extends ChatProviderBase {
  public static readonly viewType = "localcoder.chatPanel";
  private _panel?: vscode.WebviewPanel;
  private _opening = false;

  protected postMessage(msg: any) {
    this._panel?.webview.postMessage(msg);
  }

  async openChat() {
    if (this._opening) { return; }
    if (this._panel) { this._panel.reveal(vscode.ViewColumn.Beside); return; }

    this._opening = true;
    try {
      this._panel = vscode.window.createWebviewPanel(
        ChatPanelProvider.viewType, "LocalCoder Chat", vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      chatProviderRef = this;

      this._panel.iconPath = {
        light: vscode.Uri.file(this._context.asAbsolutePath("images/button-dark.svg")),
        dark: vscode.Uri.file(this._context.asAbsolutePath("images/button-light.svg")),
      };

      this._panel.webview.html = await this.loadHtml();

      this._panel.webview.onDidReceiveMessage(
        async (msg) => { await this.handleMessage(msg); },
        undefined, this._disposables,
      );

      this._panel.onDidDispose(() => {
        log("CHAT panel disposed");
        this.disposeBackend();
        this._panel = undefined;
      }, undefined, this._disposables);

      vscode.window.onDidChangeActiveTextEditor(
        () => this.sendActiveFile(), undefined, this._disposables,
      );

      await this.startBackend();
    } catch (e: any) {
      log(`CHAT fatal error: ${e.message}`);
      vscode.window.showErrorMessage(`LocalCoder Chat: ${e.message}`);
    } finally {
      this._opening = false;
    }
  }
}


export let chatProviderRef: ChatProviderBase | null = null;
