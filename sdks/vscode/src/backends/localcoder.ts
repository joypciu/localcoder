import * as cp from "child_process";
import * as crypto from "crypto";
import * as net from "net";
import * as http from "http";
import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import type { ChatBackend, ChatMessage, FileAttachment, ToolCall } from "./types";
import { directoryMatches, parseGlobalEvent, parseSseBlocks } from "./sse-events";

const DEBUG_FILE = path.join(__dirname, "..", "debug.txt");
function log(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 23);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(DEBUG_FILE, line + "\n"); } catch { /* ignore */ }
}

type StreamCallbacks = {
  onDelta: (delta: string) => void;
  onToolCall: (tool: ToolCall) => void;
  onToolResult: (id: string, status: "completed" | "error", output?: any) => void;
};

export interface LocalcoderSendOptions { agent?: string; }

export class LocalcoderBackend implements ChatBackend {
  readonly type = "localcoder";
  private _serverProcess?: cp.ChildProcess;
  private _serverPort?: number;
  private _serverPassword?: string;
  private _sseRequest?: http.ClientRequest;
  private _activeSessionId?: string;
  private _localcoderDir: string;
  private _abortController?: AbortController;
  private _streamCallbacks?: StreamCallbacks;
  private _streamSessionId?: string;
  private _streamedText = "";
  private _seenToolIds = new Set<string>();

  constructor(extensionPath: string) {
    const cfg = vscode.workspace.getConfiguration("localcoder");
    const configured = cfg.get<string>("packagePath");
    this._localcoderDir = configured
      ? path.resolve(configured)
      : path.resolve(extensionPath, "..", "..", "packages", "localcoder");
  }

  private get workspaceDir(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
  }

  private resolveBunPath(): string {
    const cfg = vscode.workspace.getConfiguration("localcoder");
    const configured = cfg.get<string>("bunPath");
    if (configured && fs.existsSync(configured)) { return configured; }
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
    log(`LOCALCODER starting on port ${this._serverPort} dir=${this._localcoderDir}`);

    if (!fs.existsSync(path.join(this._localcoderDir, "src", "index.ts"))) {
      throw new Error(`LocalCoder package not found at ${this._localcoderDir}. Set localcoder.packagePath in settings.`);
    }

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


  private handleGlobalEvent(raw: string) {
    if (!this._streamCallbacks || !this._streamSessionId) { return; }
    for (const action of parseGlobalEvent(raw, this.workspaceDir, this._streamSessionId)) {
      if (action.kind === "delta") {
        this._streamedText += action.delta;
        this._streamCallbacks.onDelta(action.delta);
      } else if (action.kind === "tool_call") {
        if (!this._seenToolIds.has(action.tool.id)) {
          this._seenToolIds.add(action.tool.id);
          this._streamCallbacks.onToolCall(action.tool);
        }
      } else if (action.kind === "tool_result") {
        this._streamCallbacks.onToolResult(action.id, action.status, action.output);
      }
    }
  }

  private startSSE() {
    if (this._sseRequest) { this._sseRequest.destroy(); }
    const dir = this.workspaceDir ? `?directory=${encodeURIComponent(this.workspaceDir)}` : "";
    const u = `http://127.0.0.1:${this._serverPort}/global/event${dir}`;
    const parsed = new URL(u);
    const req = http.request({
      hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search,
      method: "GET", headers: { ...this.getAuthHeaders(), Accept: "text/event-stream", Connection: "keep-alive" },
    }, (res) => {
      let buf = "";
      res.on("data", (c: Buffer) => {
        buf += c.toString();
        const parsed = parseSseBlocks(buf);
        buf = parsed.remainder;
        for (const ev of parsed.events) { this.handleGlobalEvent(ev); }
      });
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
    options?: LocalcoderSendOptions,
  ): Promise<void> {
    const controller = new AbortController();
    this._abortController = controller;
    this._streamCallbacks = callbacks;
    this._streamedText = "";
    this._seenToolIds.clear();

    try {
      let sessionId = this._activeSessionId;
      if (!sessionId) {
        const cr = await this.apiFetch("/session", {
          method: "POST",
          body: JSON.stringify({ title: text.substring(0, 80) }),
          signal: controller.signal,
        });
        const cd = (await cr.json()) as { id?: string; sessionID?: string };
        sessionId = cd.id || cd.sessionID;
        this._activeSessionId = sessionId;
      }
      this._streamSessionId = sessionId;

      const parts: Array<Record<string, unknown>> = [{ type: "text", text }];
      for (const f of files) {
        try {
          const uri = vscode.Uri.parse(f.uri);
          const raw = await vscode.workspace.fs.readFile(uri);
          const body = Buffer.from(raw).toString("utf8");
          const rel = vscode.workspace.asRelativePath(uri);
          parts.push({
            type: "file",
            mime: f.mime || "text/plain",
            filename: f.name || rel,
            url: `file://${uri.fsPath}`,
            source: { type: "text", text: body },
          });
        } catch (e: unknown) {
          log(`FILE-ATTACH skip ${f.uri}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      const body: Record<string, unknown> = { parts };
      if (options?.agent) { body.agent = options.agent; }

      const sendResult = await this.apiFetch(`/session/${sessionId}/message`, {
        method: "POST",
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!sendResult.ok) {
        let errBody = "";
        try { errBody = await sendResult.text(); } catch { /* ignore */ }
        log(`SEND-ERR ${sendResult.status}: ${errBody.slice(0, 500)}`);
        callbacks.onError(`Failed to send message: ${sendResult.status}${errBody ? " — " + errBody.slice(0, 200) : ""}`);
        return;
      }

      const reader = sendResult.body?.getReader();
      let rawText = "";
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) { break; }
          rawText += decoder.decode(value, { stream: true });
        }
      } else {
        rawText = await sendResult.text();
      }

      const data = JSON.parse(rawText) as { info?: Record<string, unknown>; parts?: Array<Record<string, unknown>> };
      const respParts = data.parts || [];
      let textContent = this._streamedText;
      const toolCalls: ToolCall[] = [];

      for (const part of respParts) {
        if (part.type === "text" && !textContent) {
          textContent += (textContent ? "\n\n" : "") + String(part.text || "");
        } else if (part.type === "tool") {
          const state = (part.state || {}) as Record<string, unknown>;
          const id = String(part.id || part.callID || "");
          if (!this._seenToolIds.has(id)) {
            const tc: ToolCall = {
              id,
              name: String(part.tool || part.name || ""),
              input: state.input,
              status: state.status === "error" ? "error" : "completed",
              output: state.output ?? state.content,
              error: state.error as string | undefined,
            };
            toolCalls.push(tc);
            callbacks.onToolCall(tc);
            callbacks.onToolResult(tc.id, tc.status === "error" ? "error" : "completed", tc.output);
          }
        }
      }

      if (textContent && !this._streamedText) { callbacks.onDelta(textContent); }

      const info = data.info || {};
      callbacks.onDone({
        role: "assistant",
        id: info.id as string | undefined,
        content: textContent,
        model: (info.model as { id?: string })?.id,
        tokens: info.tokens as ChatMessage["tokens"],
        error: info.error as ChatMessage["error"],
        toolCalls: toolCalls.length ? toolCalls : undefined,
        agent: info.agent as string | undefined,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") { return; }
      const msg = error instanceof Error ? error.message : String(error);
      log(`SEND-ERROR: ${msg}`);
      callbacks.onError(msg || "Failed to send message");
    } finally {
      this._abortController = undefined;
      this._streamCallbacks = undefined;
      this._streamSessionId = undefined;
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
            name: String(part.tool || part.name || ""),
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
    this._abortController?.abort();
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
