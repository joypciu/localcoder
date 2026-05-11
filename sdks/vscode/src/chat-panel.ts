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
abstract class ChatProviderBase {
  protected _backend?: ChatBackend;
  protected _config: BackendConfig;
  protected _extensionPath: string;
  protected _inited = false;
  protected _disposables: vscode.Disposable[] = [];

  // Undo: map of absolutePath → file content BEFORE the current turn's edits
  private _turnSnapshots = new Map<string, Uint8Array | null>();
  private _hasUndo = false;

  constructor(protected readonly _context: vscode.ExtensionContext) {
    this._extensionPath = _context.extensionPath;
    this._config = this.loadConfig();
    log(`CHAT init backend=${this._config.type}`);
  }

  protected abstract postMessage(msg: any): void;

  protected loadConfig(): BackendConfig {
    const c = this._context.globalState.get<BackendConfig>("chatBackendConfig");
    return c || { type: "localcoder" };
  }

  protected saveConfig() {
    this._context.globalState.update("chatBackendConfig", this._config);
  }

  protected getOrCreateBackend(): ChatBackend {
    if (!this._backend) {
      if (this._config.type === "openai") {
        this._backend = new OpenAIBackend({
          apiKey: this._config.openaiKey,
          endpoint: this._config.openaiEndpoint,
          model: this._config.openaiModel,
        });
      } else {
        this._backend = new LocalcoderBackend(this._extensionPath);
      }
    }
    return this._backend;
  }

  protected buildInitPayload(backend: ChatBackend, error?: string) {
    return {
      type: "init" as const,
      backend: backend.type,
      error,
      config: {
        openaiKey: this._config.openaiKey ? "***" : "",
        openaiEndpoint: this._config.openaiEndpoint || "",
        openaiModel: this._config.openaiModel || "",
      },
    };
  }

  protected async startBackend() {
    const backend = this.getOrCreateBackend();
    log(`CHAT starting backend: ${backend.type}`);
    try {
      await backend.start();
      log(`CHAT backend started`);
      this.postMessage(this.buildInitPayload(backend));
      this._inited = true;
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
    if (this._turnSnapshots.has(filePath)) { return; } // already snapshotted
    try {
      const uri = vscode.Uri.file(filePath);
      const content = await vscode.workspace.fs.readFile(uri);
      this._turnSnapshots.set(filePath, content);
      log(`SNAP ${filePath}`);
    } catch {
      // File doesn't exist yet (new file being created) — snapshot null so we
      // know to delete it on undo.
      this._turnSnapshots.set(filePath, null);
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

        case "setConfig":
          if (msg.config) {
            if (msg.config.openaiKey && msg.config.openaiKey !== "***") {
              this._config.openaiKey = msg.config.openaiKey;
            }
            if (msg.config.openaiEndpoint) { this._config.openaiEndpoint = msg.config.openaiEndpoint; }
            if (msg.config.openaiModel) { this._config.openaiModel = msg.config.openaiModel; }
            this.saveConfig();

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
          this.saveConfig();

          this._backend?.dispose();
          this._backend = undefined;
          const newBackend = this.getOrCreateBackend();

          try {
            await newBackend.start();
            this._inited = true;
            this.postMessage(this.buildInitPayload(newBackend));
          } catch (e: any) {
            log(`CHAT switch error: ${e.message}`);
            this.postMessage({ type: "error", message: e.message });
            this._config.type = fallbackType;
            this.saveConfig();
            this._backend = undefined;
            const fallback = this.getOrCreateBackend();
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
          const sessions = await backend.listSessions();
          this.postMessage({ type: "sessions", sessions });
          break;
        }

        case "loadMessages": {
          if (!backend) { break; }
          const messages = await backend.loadMessages(msg.sessionId);
          this.postMessage({ type: "messages", messages });
          break;
        }

        case "sendMessage": {
          if (!backend) { break; }
          // Clear undo snapshots for new turn
          this._turnSnapshots.clear();
          this._hasUndo = false;

          const sessionId = backend.getActiveSessionId() || msg.sessionId;
          backend.setActiveSessionId(sessionId);

          await backend.sendMessage(msg.text, msg.history || [], msg.files || [], {
            onDelta: (delta) => this.postMessage({ type: "streamDelta", delta }),
            onToolCall: async (tool) => {
              // Snapshot files BEFORE they are modified, so we can undo later
              if (WRITE_TOOLS.has(tool.name)) {
                const filePath = tool.input?.file_path ?? tool.input?.path ?? tool.input?.filename;
                if (typeof filePath === "string") {
                  await this.snapshotFile(filePath);
                }
              }
              this.postMessage({ type: "toolCall", tool });
            },
            onToolResult: (id, status, output) => this.postMessage({ type: "toolResult", id, status, output }),
            onDone: (message) => {
              // Mark undo available if any files were snapshotted
              if (this._turnSnapshots.size > 0) {
                this._hasUndo = true;
              }
              this.postMessage({ type: "streamDone", message, canUndo: this._hasUndo });
              const sid = backend.getActiveSessionId();
              if (sid) { this.postMessage({ type: "sessionCreated", sessionId: sid }); }
              backend.listSessions().then((s) => this.postMessage({ type: "sessions", sessions: s }));
            },
            onError: (error) => {
              this.postMessage({ type: "error", message: error });
              this.postMessage({ type: "streamDone", message: {}, canUndo: false });
            },
          });
          break;
        }

        case "abort":
          backend?.abort();
          this.postMessage({ type: "streamDone", message: {}, canUndo: false });
          break;

        case "undoLastTurn":
          await this.restoreSnapshots();
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
