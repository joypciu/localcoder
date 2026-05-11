import * as https from "https";
import * as http from "http";
import type { ChatBackend, ChatMessage, FileAttachment, ToolCall } from "./types";

export class OpenAIBackend implements ChatBackend {
  readonly type = "openai";
  private _apiKey: string;
  private _endpoint: string;
  private _model: string;
  private _abortController?: AbortController;
  private _activeSessionId: string | null = null;
  private _sessions: { id: string; title: string; messages: ChatMessage[] }[] = [];
  private _sessionCounter = 0;

  constructor(config: { apiKey?: string; endpoint?: string; model?: string }) {
    this._apiKey = config.apiKey || "";
    this._endpoint = config.endpoint || "https://api.openai.com/v1";
    this._model = config.model || "gpt-4o";
  }

  updateConfig(config: { apiKey?: string; endpoint?: string; model?: string }) {
    if (config.apiKey !== undefined) {this._apiKey = config.apiKey;}
    if (config.endpoint) {this._endpoint = config.endpoint;}
    if (config.model) {this._model = config.model;}
  }

  async start(): Promise<void> {
    // No server to start - just validate config
    if (!this._apiKey) {throw new Error("OpenAI API key not configured. Use settings to set it.");}
  }

  async sendMessage(
    text: string,
    history: ChatMessage[],
    _files: FileAttachment[],
    callbacks: {
      onDelta: (delta: string) => void;
      onToolCall: (tool: ToolCall) => void;
      onToolResult: (id: string, status: "completed" | "error", output?: any) => void;
      onDone: (message: Partial<ChatMessage>) => void;
      onError: (error: string) => void;
    },
  ): Promise<void> {
    this._abortController = new AbortController();

    // Build messages array from history
    const messages = history.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    // Add current user message
    messages.push({ role: "user", content: text });

    const body = JSON.stringify({
      model: this._model,
      messages,
      stream: true,
    });

    const url = new URL(this._endpoint.replace(/\/+$/, "") + "/chat/completions");
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;

    let fullContent = "";

    const req = transport.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this._apiKey}`,
          "Accept": "text/event-stream",
        },
        signal: this._abortController.signal,
      },
      (res) => {
        let buffer = "";
        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) {continue;}
            const data = trimmed.slice(6);
            if (data === "[DONE]") {
              callbacks.onDone({ content: fullContent, model: this._model });
              return;
            }
            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta;
              if (delta?.content) {
                fullContent += delta.content;
                callbacks.onDelta(delta.content);
              }
              if (json.choices?.[0]?.finish_reason === "stop") {
                callbacks.onDone({ content: fullContent, model: this._model });
              }
            } catch {}
          }
        });
        res.on("end", () => callbacks.onDone({ content: fullContent, model: this._model }));
        res.on("error", (e) => callbacks.onError(e.message));
      },
    );

    req.on("error", (e: any) => {
      if (e.name !== "AbortError") {callbacks.onError(e.message);}
    });

    req.write(body);
    req.end();

    // Wait for streaming to complete before saving to session
    await new Promise<void>((resolve) => {
      const origDone = callbacks.onDone;
      callbacks.onDone = (msg) => {
        origDone(msg);
        // Save to session when done
        if (!this._activeSessionId) {
          this._sessionCounter++;
          this._activeSessionId = `openai-${this._sessionCounter}`;
          this._sessions.push({ id: this._activeSessionId, title: text.substring(0, 50), messages: [] });
        }
        const sess = this._sessions.find((s) => s.id === this._activeSessionId);
        if (sess) {
          sess.messages.push({ role: "user", content: text });
          sess.messages.push({ role: "assistant", content: fullContent || msg.content || "" });
          if (sess.messages.length <= 2) { sess.title = text.substring(0, 50); }
        }
        resolve();
      };
      callbacks.onError = (err) => {
        callbacks.onError(err);
        resolve();
      };
    });
  }

  abort(): void {
    this._abortController?.abort();
  }

  async listSessions(): Promise<{ id: string; title: string }[]> {
    return this._sessions.map((s) => ({ id: s.id, title: s.title }));
  }

  async loadMessages(sessionId: string): Promise<ChatMessage[]> {
    this._activeSessionId = sessionId;
    return this._sessions.find((s) => s.id === sessionId)?.messages || [];
  }

  getActiveSessionId(): string | null { return this._activeSessionId; }
  setActiveSessionId(id: string | null): void { this._activeSessionId = id; }

  dispose(): void {
    this._abortController?.abort();
  }
}
