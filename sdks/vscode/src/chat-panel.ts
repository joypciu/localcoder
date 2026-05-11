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

export class ChatPanelProvider {
  public static readonly viewType = "localcoder.chatPanel";
  private _panel?: vscode.WebviewPanel;
  private _backend?: ChatBackend;
  private _config: BackendConfig;
  private _extensionPath: string;
  private _opening = false;
  private _inited = false;
  private _previousType = "localcoder";
  private _disposables: vscode.Disposable[] = [];

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._extensionPath = _context.extensionPath;
    this._config = this.loadConfig();
    this._previousType = this._config.type;
    log(`CHAT init backend=${this._config.type}`);
  }

  private loadConfig(): BackendConfig {
    const c = this._context.globalState.get<BackendConfig>("chatBackendConfig");
    return c || { type: "localcoder" };
  }

  private saveConfig() {
    this._context.globalState.update("chatBackendConfig", this._config);
  }

  private getOrCreateBackend(): ChatBackend {
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

  private buildInitPayload(backend: ChatBackend, error?: string) {
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

  async openChat() {
    if (this._opening) { return; }
    if (this._panel) { this._panel.reveal(vscode.ViewColumn.Beside); return; }

    this._opening = true;
    this._inited = false;
    try {
      this._panel = vscode.window.createWebviewPanel(
        ChatPanelProvider.viewType, "localcoder Chat", vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true },
      );

      this._panel.iconPath = {
        light: vscode.Uri.file(this._context.asAbsolutePath("images/button-dark.svg")),
        dark: vscode.Uri.file(this._context.asAbsolutePath("images/button-light.svg")),
      };

      const htmlPath = path.join(this._extensionPath, "media", "chat.html");
      const htmlContent = await vscode.workspace.fs.readFile(vscode.Uri.file(htmlPath));
      this._panel.webview.html = Buffer.from(htmlContent).toString("utf8");

      this._panel.webview.onDidReceiveMessage(
        async (msg) => { await this.handleMessage(msg); },
        undefined, this._disposables,
      );

      this._panel.onDidDispose(
        () => { log("CHAT panel disposed"); this.disposePanel(); },
        undefined, this._disposables,
      );

      vscode.window.onDidChangeActiveTextEditor(
        () => this.sendActiveFile(), undefined, this._disposables,
      );

      // Start backend
      const backend = this.getOrCreateBackend();
      log(`CHAT starting backend: ${backend.type}`);
      try {
        await backend.start();
        log(`CHAT backend started`);
        this._panel.webview.postMessage(this.buildInitPayload(backend));
        this._inited = true;
        this.sendActiveFile();
      } catch (e: any) {
        log(`CHAT backend start error: ${e.message}`);
        this._panel.webview.postMessage({ type: "error", message: e.message });
        this._panel.webview.postMessage(this.buildInitPayload(backend, e.message));
        this._inited = true;
      }
    } catch (e: any) {
      log(`CHAT fatal error: ${e.message}`);
      vscode.window.showErrorMessage(`localcoder Chat: ${e.message}`);
    } finally {
      this._opening = false;
    }
  }

  private async handleMessage(msg: any) {
    const backend = this._backend;
    log(`RECV ${msg.type}`);

    try {
      switch (msg.type) {
        case "ready": {
          if (this._inited && backend) {
            // Re-send init in case webview refreshed
            this._panel?.webview.postMessage(this.buildInitPayload(backend));
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
            this._panel?.webview.postMessage({
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
            this._panel?.webview.postMessage(this.buildInitPayload(newBackend));
          } catch (e: any) {
            log(`CHAT switch error: ${e.message}`);
            this._panel?.webview.postMessage({ type: "error", message: e.message });
            // Fall back
            this._config.type = fallbackType;
            this.saveConfig();
            this._backend = undefined;
            const fallback = this.getOrCreateBackend();
            try {
              await fallback.start();
              this._panel?.webview.postMessage(this.buildInitPayload(fallback));
            } catch {
              this._panel?.webview.postMessage({ type: "error", message: "Failed to start any backend" });
            }
          }
          break;
        }

        case "listSessions": {
          if (!backend) { break; }
          const sessions = await backend.listSessions();
          this._panel?.webview.postMessage({ type: "sessions", sessions });
          break;
        }

        case "loadMessages": {
          if (!backend) { break; }
          const messages = await backend.loadMessages(msg.sessionId);
          this._panel?.webview.postMessage({ type: "messages", messages });
          break;
        }

        case "sendMessage": {
          if (!backend) { break; }
          const sessionId = backend.getActiveSessionId() || msg.sessionId;
          backend.setActiveSessionId(sessionId);

          await backend.sendMessage(msg.text, msg.history || [], msg.files || [], {
            onDelta: (delta) => this._panel?.webview.postMessage({ type: "streamDelta", delta }),
            onToolCall: (tool) => this._panel?.webview.postMessage({ type: "toolCall", tool }),
            onToolResult: (id, status, output) => this._panel?.webview.postMessage({ type: "toolResult", id, status, output }),
            onDone: (message) => {
              this._panel?.webview.postMessage({ type: "streamDone", message });
              const sid = backend.getActiveSessionId();
              if (sid) {
                this._panel?.webview.postMessage({ type: "sessionCreated", sessionId: sid });
              }
              backend.listSessions().then((s) => this._panel?.webview.postMessage({ type: "sessions", sessions: s }));
            },
            onError: (error) => {
              this._panel?.webview.postMessage({ type: "error", message: error });
              this._panel?.webview.postMessage({ type: "streamDone", message: {} });
            },
          });
          break;
        }

        case "abort":
          backend?.abort();
          this._panel?.webview.postMessage({ type: "streamDone", message: {} });
          break;

        case "getActiveFile":
          this.sendActiveFile();
          break;

        case "getSelection":
          this.sendSelection();
          break;
      }
    } catch (e: any) {
      log(`ERROR handling ${msg.type}: ${e.message}`);
      this._panel?.webview.postMessage({ type: "error", message: e.message });
      this._panel?.webview.postMessage({ type: "streamDone", message: {} });
    }
  }

  private getActiveFileInfo(): { relativePath: string } | undefined {
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
    return { relativePath: ref };
  }

  private sendActiveFile() {
    const info = this.getActiveFileInfo();
    if (info) { this._panel?.webview.postMessage({ type: "activeFile", file: info.relativePath }); }
  }

  private sendSelection() { this.sendActiveFile(); }

  private disposePanel() {
    this._backend?.dispose();
    this._backend = undefined;
    this._panel?.dispose();
    this._panel = undefined;
    this._inited = false;
    while (this._disposables.length) { this._disposables.pop()?.dispose(); }
  }
}
