import * as fs from "fs";
import * as path from "path";
import type { ChatBackend, ToolCall } from "../backends/types";

export const LLAMA_API = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1";
export const LIVE = process.env.VSCODE_LLAMA_E2E === "1";
export const PKG = path.resolve(__dirname, "../../../../packages/localcoder");
export const WIN_EXE = path.join(PKG, "dist", "localcoder-windows-x64", "bin", "localcoder.exe");
export const HAS_EXE = process.platform === "win32" && fs.existsSync(WIN_EXE);

export async function probeLlamaServer(): Promise<string | undefined> {
  try {
    const r = await fetch(`${LLAMA_API}/models`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) {
      return undefined;
    }
    const d = (await r.json()) as { data?: { id: string }[] };
    return d.data?.[0]?.id;
  } catch {
    return undefined;
  }
}

export function writeProjectConfig(
  workDir: string,
  modelId: string,
  permission?: Record<string, string>,
): void {
  fs.writeFileSync(
    path.join(workDir, "localcoder.json"),
    JSON.stringify(
      {
        $schema: "https://localcoder.ai/config.json",
        model: `llamacpp/${modelId}`,
        provider: {
          llamacpp: {
            npm: "@ai-sdk/openai-compatible",
            options: { baseURL: LLAMA_API, apiKey: "not-needed" },
            models: {
              [modelId]: {
                id: modelId,
                name: modelId,
                tool_call: true,
                reasoning: true,
                interleaved: { field: "reasoning_content" },
                temperature: true,
                limit: { context: 16384, output: 2048 },
              },
            },
          },
        },
        permission: permission ?? {
          "*": "allow",
          session_search: "deny",
          list: "deny",
          grep: "deny",
          glob: "deny",
        },
      },
      null,
      2,
    ),
  );
}

export function hasCompletedTool(calls: ToolCall[], name: string): boolean {
  return calls.some((t) => t.name === name && t.status === "completed");
}

export async function pollCompletedTools(
  backend: ChatBackend,
  names: string[],
  timeoutMs = 30_000,
): Promise<ToolCall[]> {
  const sessionId = backend.getActiveSessionId();
  if (!sessionId) {
    return [];
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = await backend.loadMessages(sessionId);
    const allTools = messages
      .filter((m) => m.role === "assistant")
      .flatMap((m) => m.toolCalls ?? []);
    const matched = allTools.filter((t) => names.includes(t.name) && t.status === "completed");
    if (names.every((n) => matched.some((t) => t.name === n))) {
      return matched;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  const messages = await backend.loadMessages(sessionId);
  return messages
    .filter((m) => m.role === "assistant")
    .flatMap((m) => m.toolCalls ?? [])
    .filter((t) => names.includes(t.name));
}

export async function sendAndCollect(
  backend: ChatBackend,
  text: string,
  agent = "build",
): Promise<{ content: string; toolCalls: ToolCall[]; error?: string }> {
  const result = await new Promise<{ content: string; toolCalls: ToolCall[]; error?: string }>(
    (resolve, reject) => {
      const toolCalls: ToolCall[] = [];
      backend
        .sendMessage(
          text,
          [],
          [],
          {
            onDelta: () => {},
            onToolCall: (tc) => toolCalls.push(tc),
            onToolResult: () => {},
            onDone: (msg) =>
              resolve({
                content: msg.content || "",
                toolCalls: msg.toolCalls?.length ? msg.toolCalls : toolCalls,
              }),
            onError: (err) => resolve({ content: "", toolCalls, error: err }),
          },
          { agent },
        )
        .catch(reject);
    },
  );

  const sessionId = backend.getActiveSessionId();
  if (sessionId) {
    const messages = await backend.loadMessages(sessionId);
    const persisted = messages
      .filter((m) => m.role === "assistant")
      .flatMap((m) => m.toolCalls ?? [])
      .filter((t) => t.status === "completed");
    if (persisted.length) {
      result.toolCalls = persisted;
    }
  }

  return result;
}
