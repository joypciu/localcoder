export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  id?: string;
  agent?: string;
  model?: string;
  tokens?: { input?: number; output?: number };
  cost?: number;
  error?: { message: string };
  toolCalls?: ToolCall[];
  reasoning?: string;  // Thinking/reasoning block (Claude-style)
}

export interface ToolCall {
  id: string;
  name: string;
  input: any;
  status: "running" | "completed" | "error";
  output?: any;
  error?: string;
  metadata?: Record<string, any>;  // Additional metadata (truncation, diff stats, etc.)
}

export interface FileAttachment {
  uri: string;
  mime: string;
  name?: string;
}

export interface SendMessageOptions {
  agent?: string;
}

export interface BackendConfig {
  type: "localcoder" | "openai" | "none";
  openaiKey?: string;
  openaiEndpoint?: string;
  openaiModel?: string;
}

export interface ChatBackend {
  readonly type: string;

  /** Start the backend (e.g., spawn server, initialize connection) */
  start(): Promise<void>;

  /** Send a user message and stream the response */
  sendMessage(
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
    options?: SendMessageOptions,
  ): Promise<void>;

  /** Abort the current generation */
  abort(): void;

  /** List previous sessions/conversations */
  listSessions(query?: string): Promise<{ id: string; title: string }[]>;

  /** Load messages for a session */
  loadMessages(sessionId: string): Promise<ChatMessage[]>;

  /** Get the current session ID (null if none) */
  getActiveSessionId(): string | null;

  /** Set the active session ID */
  setActiveSessionId(id: string | null): void;

  /** Clean up resources */
  dispose(): void;

  /** Compact session context (localcoder backend) */
  compactSession?(): Promise<void>;
}

/** Events the backend can emit to the webview */
export type BackendEvent =
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "error"; message: string }
  | { type: "activeFile"; file: string };
