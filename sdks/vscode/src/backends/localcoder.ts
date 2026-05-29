import * as cp from "child_process";
import * as crypto from "crypto";
import * as net from "net";
import * as http from "http";
import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import type { ChatBackend, ChatMessage, FileAttachment, ToolCall } from "./types";
import { directoryMatches, parseGlobalEvent, parseGlobalPushEvent, parseSseBlocks } from "./sse-events";

import { vscodeDebugLog as log } from "../debug-log";

type StreamCallbacks = {
  onDelta: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onToolCall: (tool: ToolCall) => void;
  onToolResult: (id: string, status: "completed" | "error", output?: any) => void;
};

export interface LocalcoderSendOptions { agent?: string; }

export type TodoItem = { content: string; status: string; priority: string };

export type WorkspaceMeta = {
  model?: string;
  agents?: Array<{ name: string; description?: string; mode?: string }>;
  mcpServers?: string[];
  skills?: string[];
  llamacppRunning?: boolean;
  contextLimit?: number;
  contextTokens?: number;
  models?: Array<{ id: string; name: string }>;
};

function stripThinkingFromText(text: string): string {
  return text
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, "")
    .trim();
}

export class LocalcoderBackend implements ChatBackend {
  readonly type = "localcoder";
  private _serverProcess?: cp.ChildProcess;
  private _serverPort?: number;
  private _serverPassword?: string;
  private _sseRequest?: http.ClientRequest;
  private _activeSessionId?: string;
  private _localcoderDir: string;
  private _extensionPath: string;
  private _abortController?: AbortController;
  private _streamCallbacks?: StreamCallbacks;
  private _streamSessionId?: string;
  private _streamedText = "";
  private _streamedReasoning = "";
  private _seenToolIds = new Set<string>();
  private _serverStderr = "";
  private _workspaceDirOverride?: string;
  private _pushListener?: (msg: Record<string, unknown>) => void;

  constructor(extensionPath: string, workspaceDirOverride?: string) {
    const cfg = vscode.workspace.getConfiguration("localcoder");
    const configured = cfg.get<string>("packagePath");
    this._extensionPath = extensionPath;
    this._workspaceDirOverride = workspaceDirOverride;
    this._localcoderDir = configured
      ? path.resolve(configured)
      : path.resolve(extensionPath, "..", "..", "packages", "localcoder");
  }

  private get workspaceDir(): string {
    return this._workspaceDirOverride
      ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      ?? "";
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


  private resolveLocalcoderCommand(): { command: string; args: string[]; cwd?: string } {
    const cfg = vscode.workspace.getConfiguration("localcoder");
    const configured = cfg.get<string>("packagePath");
    const candidates: string[] = [];

    if (configured) {
      const base = path.resolve(configured);
      candidates.push(
        path.join(base, "dist", "localcoder-windows-x64", "bin", "localcoder.exe"),
        path.join(base, "bin", "localcoder.exe"),
        path.join(base, "bin", "localcoder"),
      );
    }

    candidates.push(
      path.resolve(this._extensionPath, "..", "..", "packages", "localcoder", "dist", "localcoder-windows-x64", "bin", "localcoder.exe"),
      path.resolve(this._extensionPath, "..", "..", "packages", "localcoder", "bin", "localcoder"),
    );

    for (const c of ["localcoder.exe", "localcoder.cmd", "localcoder"]) {
      const fromPath = this.which(c);
      if (fromPath) { candidates.push(fromPath); }
    }

    for (const c of candidates) {
      if (!c || !fs.existsSync(c)) { continue; }
      if (c.endsWith(".exe") || c.endsWith(".cmd")) {
        return { command: c, args: ["serve", "--port", String(this._serverPort!), "--hostname", "127.0.0.1", "--cors"] };
      }
      if (c.endsWith("localcoder") && !c.endsWith(".js")) {
        return { command: process.execPath, args: [c, "serve", "--port", String(this._serverPort!), "--hostname", "127.0.0.1", "--cors"] };
      }
    }

    const src = configured
      ? path.join(path.resolve(configured), "src", "index.ts")
      : path.join(this._localcoderDir, "src", "index.ts");
    if (!fs.existsSync(src)) {
      throw new Error(
        `LocalCoder not found. Install globally (npm install -g localcoder), set localcoder.packagePath, or build packages/localcoder (bun run build:win).`,
      );
    }
    return {
      command: this.resolveBunPath(),
      args: ["run", "--cwd", this._localcoderDir, "--conditions=browser", "src/index.ts", "serve", "--port", String(this._serverPort!), "--hostname", "127.0.0.1", "--cors"],
      cwd: this._localcoderDir,
    };
  }

  private which(cmd: string): string | undefined {
    const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
    const dirs = (process.env.PATH || "").split(path.delimiter);
    for (const d of dirs) {
      for (const ext of exts) {
        const p = path.join(d, cmd + ext);
        if (fs.existsSync(p)) { return p; }
      }
    }
    return undefined;
  }

  async start(): Promise<void> {
    if (this._serverProcess) { return; }

    this._serverPort = await this.findFreePort();
    this._serverPassword = crypto.randomBytes(16).toString("hex");
    log(`LOCALCODER starting on port ${this._serverPort} dir=${this._localcoderDir}`);

    const launch = this.resolveLocalcoderCommand();
    log(`LOCALCODER launch ${launch.command} ${launch.args.join(" ")}`);
    this._serverProcess = cp.spawn(launch.command, launch.args, {
      cwd: launch.cwd || path.dirname(launch.command),
      env: { ...process.env, LOCALCODER_SERVER_PASSWORD: this._serverPassword, LOCALCODER_CALLER: "vscode-chat" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    this._serverProcess.stdout?.on("data", (d) => log(`SRV: ${d.toString().trim()}`));
    this._serverProcess.stderr?.on("data", (d) => {
      const line = d.toString();
      this._serverStderr = (this._serverStderr + line).slice(-4000);
      const trimmed = line.trim();
      if (trimmed) { log(`SRV-ERR: ${trimmed}`); }
    });
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
      if (this._serverProcess?.exitCode != null) {
        const tail = this._serverStderr.trim().slice(-800);
        throw new Error(tail ? `Server exited (${this._serverProcess.exitCode}): ${tail}` : `Server died with code ${this._serverProcess.exitCode}`);
      }
      try {
        const url = `http://127.0.0.1:${this._serverPort}/global/health`;
        const res = await fetch(url, { headers: this.getAuthHeaders() });
        if (res.ok) { log(`Health OK attempt ${i + 1}`); return; }
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    const tail = this._serverStderr.trim().slice(-800);
    throw new Error(tail ? `Server did not start: ${tail}` : "Server did not start in time. Build CLI (bun run build:win) or npm install -g localcoder.");
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
    for (const action of parseGlobalPushEvent(raw, this.workspaceDir, this._activeSessionId || undefined)) {
      if (action.kind === "todos") {
        this._pushListener?.({ type: "todos", sessionId: action.sessionId, todos: action.todos });
      } else if (action.kind === "session_status") {
        this._pushListener?.({ type: "sessionStatus", sessionId: action.sessionId, status: action.status });
      }
    }

    if (!this._streamCallbacks || !this._streamSessionId) { return; }
    for (const action of parseGlobalEvent(raw, this.workspaceDir, this._streamSessionId)) {
      if (action.kind === "delta") {
        this._streamedText += action.delta;
        this._streamCallbacks.onDelta(action.delta);
      } else if (action.kind === "reasoning_delta") {
        this._streamedReasoning += action.delta;
        this._streamCallbacks.onReasoningDelta?.(action.delta);
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
      onReasoningDelta?: (delta: string) => void;
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
    this._streamedReasoning = "";
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
              metadata: part.metadata as Record<string, any> | undefined,
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
        reasoning: this._streamedReasoning || undefined,
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
    const info = m.info ?? m;
    const parts: any[] = m.parts ?? m.content ?? [];
    const isUser = info.role === "user" || info.type === "user";

    if (isUser) {
      const text = parts
        .filter((p) => p.type === "text")
        .map((p) => p.text || "")
        .join("\n");
      return { role: "user", id: info.id, content: text || info.text || "" };
    }

    let reasoning: string | undefined;
    const textParts: string[] = [];
    const toolParts: ToolCall[] = [];

    for (const part of parts) {
      if (part.type === "reasoning") {
        reasoning = (reasoning || "") + (part.text || part.reasoning || "");
      } else if (part.type === "text") {
        textParts.push(part.text || "");
      } else if (part.type === "tool") {
        toolParts.push({
          id: part.id || part.callID,
          name: String(part.tool || part.name || ""),
          input: part.state?.input,
          status: part.state?.status || "completed",
          output: part.state?.output ?? part.state?.content,
          error: part.state?.error,
          metadata: part.metadata,
        });
      }
    }

    return {
      role: "assistant",
      id: info.id,
      content: stripThinkingFromText(textParts.join("\n\n") || info.text || ""),
      agent: info.agent,
      model: info.model?.modelID ?? info.model?.id,
      tokens: info.tokens,
      cost: info.cost,
      error: info.error,
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

  async listSessions(query?: string): Promise<{ id: string; title: string }[]> {
    const qs = query?.trim() ? `?search=${encodeURIComponent(query.trim())}` : "";
    const r = await this.apiFetch(`/api/session${qs}`);
    const d = (await r.json()) as any;
    return (d.items || d || []).map((s: any) => ({ id: s.id, title: s.title || s.id }));
  }

  setPushListener(listener?: (msg: Record<string, unknown>) => void): void {
    this._pushListener = listener;
  }

  async getTodos(sessionId: string): Promise<TodoItem[]> {
    const r = await this.apiFetch(`/session/${sessionId}/todo`);
    if (!r.ok) { return []; }
    const d = (await r.json()) as TodoItem[];
    return Array.isArray(d) ? d : [];
  }

  async fetchWorkspaceMeta(): Promise<WorkspaceMeta> {
    const meta: WorkspaceMeta = {};
    try {
      const [cfgRes, agentRes, skillRes, llamaRes] = await Promise.all([
        this.apiFetch("/global/config").catch(() => undefined),
        this.apiFetch("/agent").catch(() => undefined),
        this.apiFetch("/skill").catch(() => undefined),
        this.apiFetch("/global/llamacpp/status").catch(() => undefined),
      ]);
      if (cfgRes?.ok) {
        const cfg = (await cfgRes.json()) as { model?: string; mcp?: Record<string, unknown> };
        meta.model = cfg.model;
        if (cfg.mcp) { meta.mcpServers = Object.keys(cfg.mcp); }
      }
      if (agentRes?.ok) {
        const agents = (await agentRes.json()) as Array<{ name: string; description?: string; mode?: string; hidden?: boolean }>;
        meta.agents = (agents || []).filter((a) => !a.hidden).map((a) => ({
          name: a.name,
          description: a.description,
          mode: a.mode,
        }));
      }
      if (skillRes?.ok) {
        const skills = (await skillRes.json()) as Array<{ name?: string; id?: string }>;
        meta.skills = (skills || []).map((s) => s.name || s.id || "").filter(Boolean);
      }
      if (llamaRes?.ok) {
        const llama = (await llamaRes.json()) as { running?: boolean; model?: string; modelId?: string; ctx?: number };
        meta.llamacppRunning = llama.running;
        if (llama.model || llama.modelId) { meta.model = meta.model || llama.model || llama.modelId; }
        if (llama.ctx) { meta.contextLimit = llama.ctx; }
      }
      const provRes = await this.apiFetch("/config/providers").catch(() => undefined);
      if (provRes?.ok) {
        const prov = (await provRes.json()) as { providers?: Array<{ id: string; name?: string; models?: Array<{ id: string; name?: string }> }> };
        const models: Array<{ id: string; name: string }> = [];
        for (const p of prov.providers ?? []) {
          for (const m of p.models ?? []) {
            const id = m.id.includes("/") ? m.id : `${p.id}/${m.id}`;
            models.push({ id, name: m.name || m.id });
          }
        }
        if (models.length) { meta.models = models; }
      }
    } catch { /* ignore */ }
    return meta;
  }

  async listModels(): Promise<Array<{ id: string; name: string }>> {
    const meta = await this.fetchWorkspaceMeta();
    return meta.models ?? [];
  }

  async setActiveModel(model: string): Promise<void> {
    const r = await this.apiFetch("/global/config", {
      method: "PATCH",
      body: JSON.stringify({ model }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(body || `Failed to set model (${r.status})`);
    }
  }

  async compactSession(): Promise<void> {
    const sessionId = this._activeSessionId;
    if (!sessionId) { throw new Error("No active session to compact"); }
    const r = await this.apiFetch(`/api/session/${sessionId}/compact`, { method: "POST" });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new Error(body || `Compact failed (${r.status})`);
    }
  }

  async loadMessages(sessionId: string): Promise<ChatMessage[]> {
    this._activeSessionId = sessionId;
    const r = await this.apiFetch(`/session/${sessionId}/message?limit=50`);
    const d = (await r.json()) as any;
    const items = Array.isArray(d) ? d : (d.items || []);
    return items.map((m: any) => this.mapMessage(m));
  }

  getActiveSessionId(): string | null { return this._activeSessionId || null; }
  setActiveSessionId(id: string | null): void { this._activeSessionId = id || undefined; }

  dispose(): void {
    if (this._sseRequest) { this._sseRequest.destroy(); this._sseRequest = undefined; }
    if (this._serverProcess) { this._serverProcess.kill(); this._serverProcess = undefined; }
  }
}
