import * as cp from "child_process";
import * as crypto from "crypto";
import * as net from "net";
import * as http from "http";
import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import type { ChatBackend, ChatMessage, FileAttachment, ToolCall } from "./types";

const DEBUG_FILE = path.join(__dirname, "..", "debug.txt");
function log(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 23);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(DEBUG_FILE, line + "\n"); } catch { /* ignore */ }
}

export class LocalcoderBackend implements ChatBackend {
  readonly type = "localcoder";
  private _serverProcess?: cp.ChildProcess;
  private _serverPort?: number;
  private _serverPassword?: string;
  private _sseRequest?: http.ClientRequest;
  private _activeSessionId?: string;
  private _localcoderDir: string;

  constructor(extensionPath: string) {
    this._localcoderDir = path.resolve(extensionPath, "..", "..", "packages", "localcoder");
  }

  private get workspaceDir(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
  }

  private resolveBunPath(): string {
    const candidates = [
      path.join(process.env.APPDATA || "", "npm", "node_modules", "bun", "bin", "bun.exe"),
      path.join(process.env.HOME || process.env.USERPROFILE || "", ".bun", "bin", "bun.exe"),
      path.join(process.env.HOME || process.env.USERPROFILE || "", ".bun", "bin", "bun"),
      "bun.exe", "bun.cmd", "bun",
    ];
    for (const c of candidates) { if (c && fs.existsSync(c)) { return c; } }
    return "bun";
  }

  async start(): Promise<void> {
    if (this._serverProcess) { return; }

    this._serverPort = await this.findFreePort();
    this._serverPassword = crypto.randomBytes(16).toString("hex");
    log(`LOCALCODER starting on port ${this._serverPort}`);

    const bunPath = this.resolveBunPath();
    this._serverProcess = cp.spawn(bunPath, [
      "run", "--cwd", this._localcoderDir, "--conditions=browser",
      "src/index.ts", "serve", "--port", String(this._serverPort),
      "--hostname", "127.0.0.1", "--cors",
    ], {
      cwd: this._localcoderDir,
      env: { ...process.env, LOCALCODER_SERVER_PASSWORD: this._serverPassword, LOCALCODER_CALLER: "vscode-chat" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    this._serverProcess.stdout?.on("data", (d) => log(`SRV: ${d.toString().trim()}`));
    this._serverProcess.stderr?.on("data", (d) => { const t = d.toString().trim(); if (t) { log(`SRV-ERR: ${t}`); } });
    this._serverProcess.on("exit", (c) => log(`SRV exited: ${c}`));

    await this.waitForServer();
    this.startSSE();
  }

  private async findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); });
      s.on("error", reject);
    });
  }

  private async waitForServer(maxRetries = 30): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      if (this._serverProcess?.exitCode !== null) { throw new Error(`Server died with code ${this._serverProcess?.exitCode}`); }
      try {
        const url = `http://127.0.0.1:${this._serverPort}/global/health`;
        const res = await fetch(url, { headers: this.getAuthHeaders() });
        if (res.ok) { log(`Health OK attempt ${i + 1}`); return; }
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("Server did not start in time");
  }

  private getAuthHeaders(): Record<string, string> {
    const token = Buffer.from(`localcoder:${this._serverPassword}`).toString("base64");
    return { Authorization: `Basic ${token}`, "Content-Type": "application/json" };
  }

  private async apiFetch(p: string, opts?: RequestInit): Promise<Response> {
    const u = new URL(`http://127.0.0.1:${this._serverPort}${p}`);
    if (this.workspaceDir) { u.searchParams.set("directory", this.workspaceDir); }
    const headers = { ...this.getAuthHeaders(), ...(opts?.headers || {}), "x-localcoder-directory": this.workspaceDir };
    const m = opts?.method || "GET";
    const res = await fetch(u.toString(), { ...opts, headers });
    log(`API ${m} ${p} -> ${res.status}`);
    return res;
  }

  private startSSE() {
    if (this._sseRequest) { this._sseRequest.destroy(); }
    const dir = this.workspaceDir ? `?directory=${encodeURIComponent(this.workspaceDir)}` : "";
    const u = `http://127.0.0.1:${this._serverPort}/global/event${dir}`;
    const parsed = new URL(u);
    const req = http.request({
      hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search,
      method: "GET", headers: { ...this.getAuthHeaders(), "Accept": "text/event-stream", "Connection": "keep-alive" },
    }, (res) => {
      let buf = "";
      res.on("data", (c: Buffer) => { buf += c.toString(); const lines = buf.split("\n"); buf = lines.pop() || ""; });
      res.on("end", () => { this._sseRequest = undefined; setTimeout(() => this.startSSE(), 3000); });
    });
    req.on("error", () => { this._sseRequest = undefined; setTimeout(() => this.startSSE(), 3000); });
    req.end();
    this._sseRequest = req;
  }

  async sendMessage(
    text: string,
    history: ChatMessage[],
    files: FileAttachment[],
    callbacks: {
      onDelta: (delta: string) => void;
      onToolCall: (tool: ToolCall) => void;
      onToolResult: (id: string, status: "completed" | "error", output?: any) => void;
      onDone: (message: Partial<ChatMessage>) => void;
      onError: (error: string) => void;
    },
  ): Promise<void> {
    try {
      // Create session if needed
      let sessionId = this._activeSessionId;
      if (!sessionId) {
        const cr = await this.apiFetch("/session", { method: "POST", body: JSON.stringify({ title: text.substring(0, 80) }) });
        const cd = (await cr.json()) as any;
        sessionId = cd.id || cd.sessionID;
        this._activeSessionId = sessionId;
      }

      // Send prompt
      const sendResult = await this.apiFetch(`/api/session/${sessionId}/message`, {
        method: "POST",
        body: JSON.stringify({ parts: [{ type: "text", text }] }),
      });

      if (!sendResult.ok) {
        callbacks.onError(`Failed to send message: ${sendResult.status}`);
        return;
      }

      // Poll for response with tool event tracking
      let lastContentLength = 0;
      let lastToolCalls: { [key: string]: ToolCall } = {};
      const pollInterval = setInterval(async () => {
        try {
          const mr = await this.apiFetch(`/api/session/${sessionId}/message`);
          if (!mr.ok) {
            return;
          }

          const md = (await mr.json()) as any;
          const msgs = (md.items || []).map((m: any) => this.mapMessage(m));
          const lastMsg = msgs[msgs.length - 1];

          if (lastMsg && lastMsg.role === "assistant") {
            const currentContent = lastMsg.content || "";
            const newContent = currentContent.substring(lastContentLength);

            // Emit text deltas
            if (newContent) {
              callbacks.onDelta(newContent);
              lastContentLength = currentContent.length;
            }

            // Emit tool call/result events
            const currentToolCalls: { [key: string]: ToolCall } = {};
            if (lastMsg.toolCalls && Array.isArray(lastMsg.toolCalls)) {
              for (const tool of lastMsg.toolCalls) {
                currentToolCalls[tool.id] = tool;
                const prev = lastToolCalls[tool.id];
                if (!prev) {
                  // New tool call started
                  callbacks.onToolCall(tool);
                } else if (prev.status !== tool.status && tool.status !== 'running') {
                  // Tool completed or errored
                  callbacks.onToolResult(tool.id, tool.status as "completed" | "error", tool.output);
                }
              }
            }
            lastToolCalls = currentToolCalls;

            // Check if response is complete
            const isComplete = lastMsg.finish && lastMsg.finish !== "tool-calls";
            if (isComplete || (currentContent && currentContent.length > 10 && !currentContent.endsWith("..."))) {
              clearInterval(pollInterval);
              callbacks.onDone(lastMsg);
            }
          }
        } catch (e) {
          // Ignore poll errors, will retry
        }
      }, 500);

      // Timeout after 60 seconds
      setTimeout(() => {
        clearInterval(pollInterval);
        if (lastContentLength === 0) {
          callbacks.onDone({ content: "No response received from AI. Please check your configuration." });
        } else {
          callbacks.onDone({});
        }
      }, 60000);

    } catch (error: any) {
      callbacks.onError(error.message || "Failed to send message");
    }
  }

  private mapMessage(m: any): ChatMessage {
    const isUser = m.type === "user";
    if (isUser) {
      return { role: "user", id: m.id, content: m.text || "" };
    }
    // Extract reasoning from parts if available
    let reasoning: string | undefined;
    const textParts = [];
    const toolParts: ToolCall[] = [];
    
    if (m.content && Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part.type === "reasoning") {
          reasoning = (reasoning || "") + (part.text || part.reasoning || "");
        } else if (part.type === "text") {
          textParts.push(part.text);
        } else if (part.type === "tool") {
          toolParts.push({
            id: part.id || part.callID,
            name: part.name,
            input: part.state?.input,
            status: part.state?.status || "completed",
            output: part.state?.content,
            error: part.state?.error,
            metadata: part.metadata,
          });
        }
      }
    }
    
    return {
      role: "assistant",
      id: m.id,
      content: textParts.join("\n\n") || m.text || "",
      agent: m.agent,
      model: m.model?.id,
      tokens: m.tokens,
      cost: m.cost,
      error: m.error,
      toolCalls: toolParts,
      reasoning,
    };
  }

  abort(): void {
    if (this._activeSessionId) {
      this.apiFetch(`/session/${this._activeSessionId}/abort`, { method: "POST" }).catch(() => {});
    }
  }

  async listSessions(): Promise<{ id: string; title: string }[]> {
    const r = await this.apiFetch("/api/session");
    const d = (await r.json()) as any;
    return (d.items || d || []).map((s: any) => ({ id: s.id, title: s.title || s.id }));
  }

  async loadMessages(sessionId: string): Promise<ChatMessage[]> {
    this._activeSessionId = sessionId;
    const r = await this.apiFetch(`/api/session/${sessionId}/message`);
    const d = (await r.json()) as any;
    return (d.items || []).map((m: any) => this.mapMessage(m));
  }

  getActiveSessionId(): string | null { return this._activeSessionId || null; }
  setActiveSessionId(id: string | null): void { this._activeSessionId = id || undefined; }

  dispose(): void {
    if (this._sseRequest) { this._sseRequest.destroy(); this._sseRequest = undefined; }
    if (this._serverProcess) { this._serverProcess.kill(); this._serverProcess = undefined; }
  }
}
