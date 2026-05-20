import * as assert from "assert";
import type { ChatMessage, ToolCall } from "../backends/types";

export function makeTool(
  name: string,
  input: Record<string, unknown>,
  output: unknown,
  status: ToolCall["status"] = "completed",
  id?: string,
): ToolCall {
  return { id: id ?? `tc-${name}-${Date.now()}`, name, input, output, status };
}

export function makeAssistantMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { role: "assistant", content: "Done.", id: `msg-${Date.now()}`, toolCalls: [], ...overrides };
}

export const WRITE_TOOL_NAMES = ["Edit", "Write", "edit", "write", "edit_file", "write_file"];

export function isWriteTool(name: string): boolean {
  return WRITE_TOOL_NAMES.includes(name);
}

