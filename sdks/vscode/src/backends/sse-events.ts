import * as path from "path";
import type { ToolCall } from "./types";

export type GlobalEventEnvelope = {
  directory?: string;
  payload?: { type?: string; properties?: Record<string, unknown> };
};

export type StreamEventAction =
  | { kind: "delta"; delta: string }
  | { kind: "reasoning_delta"; delta: string }
  | { kind: "tool_call"; tool: ToolCall }
  | { kind: "tool_result"; id: string; status: "completed" | "error"; output?: unknown };

export function directoryMatches(workspaceDir: string, dir?: string): boolean {
  if (!dir || dir === "global") { return true; }
  if (!workspaceDir) { return true; }
  const norm = (p: string) => path.normalize(p).toLowerCase();
  return norm(dir) === norm(workspaceDir);
}

export type PushEventAction =
  | { kind: "todos"; sessionId: string; todos: Array<{ content: string; status: string; priority: string }> }
  | { kind: "session_status"; sessionId: string; status: string };

export function parseGlobalPushEvent(
  raw: string,
  workspaceDir: string,
  activeSessionId?: string,
): PushEventAction[] {
  let envelope: GlobalEventEnvelope;
  try {
    envelope = JSON.parse(raw) as GlobalEventEnvelope;
  } catch {
    return [];
  }
  if (!directoryMatches(workspaceDir, envelope.directory)) { return []; }
  const payload = envelope.payload;
  if (!payload?.type) { return []; }
  const props = payload.properties || {};

  if (payload.type === "todo.updated") {
    const sessionId = props.sessionID as string | undefined;
    if (!sessionId || (activeSessionId && sessionId !== activeSessionId)) { return []; }
    const todos = (props.todos as Array<{ content: string; status: string; priority: string }>) || [];
    return [{ kind: "todos", sessionId, todos }];
  }

  if (payload.type === "session.status") {
    const sessionId = props.sessionID as string | undefined;
    const status = props.status as string | undefined;
    if (!sessionId || !status || (activeSessionId && sessionId !== activeSessionId)) { return []; }
    return [{ kind: "session_status", sessionId, status }];
  }

  return [];
}

export function parseGlobalEvent(
  raw: string,
  workspaceDir: string,
  streamSessionId: string,
): StreamEventAction[] {
  let envelope: GlobalEventEnvelope;
  try {
    envelope = JSON.parse(raw) as GlobalEventEnvelope;
  } catch {
    return [];
  }
  if (!directoryMatches(workspaceDir, envelope.directory)) { return []; }
  const payload = envelope.payload;
  if (!payload?.type) { return []; }

  const props = payload.properties || {};
  const part = props.part as Record<string, unknown> | undefined;
  const sessionFromPart = part?.sessionID as string | undefined;
  const sessionID =
    (props.sessionID as string) ||
    sessionFromPart ||
    (props.info as { sessionID?: string } | undefined)?.sessionID;
  if (sessionID && sessionID !== streamSessionId) { return []; }

  if (payload.type === "message.part.delta") {
    const delta = props.delta as string | undefined;
    const field = props.field as string | undefined;
    if (delta && field === "reasoning") {
      return [{ kind: "reasoning_delta", delta }];
    }
    if (delta && (field === "text" || !field)) {
      return [{ kind: "delta", delta }];
    }
    return [];
  }

  if (payload.type === "message.part.updated" && part?.type === "tool") {
    if (part.sessionID !== streamSessionId) { return []; }
    const callID = String(part.callID || part.id || "");
    const state = (part.state || {}) as Record<string, unknown>;
    const status = state.status as string;
    const tc: ToolCall = {
      id: callID,
      name: String(part.tool || part.name || "tool"),
      input: state.input,
      status: status === "error" ? "error" : status === "completed" ? "completed" : "running",
      output: state.output ?? state.content,
      error: state.error as string | undefined,
      metadata: (part.metadata ?? state.metadata) as Record<string, unknown> | undefined,
    };
    if (status === "pending" || status === "running") {
      return [{ kind: "tool_call", tool: tc }];
    }
    if (status === "completed" || status === "error") {
      return [{
        kind: "tool_result",
        id: callID,
        status: status === "error" ? "error" : "completed",
        output: state.output ?? state.content,
      }];
    }
  }
  return [];
}

export function parseSseBlocks(buffer: string): { events: string[]; remainder: string } {
  const blocks = buffer.split("\n\n");
  const remainder = blocks.pop() || "";
  const events: string[] = [];
  for (const block of blocks) {
    for (const line of block.split("\n")) {
      if (line.startsWith("data:")) {
        const data = line.slice(5).trim();
        if (data && data !== "[DONE]") { events.push(data); }
      }
    }
  }
  return { events, remainder };
}
