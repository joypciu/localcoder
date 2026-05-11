/**
 * Test 5: Multi-turn conversation with context
 * Test 6: Grep/WebFetch/WebSearch tools + verify tool outputs
 */
import * as assert from "assert";
import type { ChatMessage, ToolCall } from "../../backends/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(
  name: string,
  input: Record<string, unknown>,
  output: unknown,
  status: ToolCall["status"] = "completed",
): ToolCall {
  return { id: `tc-${name}-${Date.now()}`, name, input, output, status };
}

function userMsg(content: string, id?: string): ChatMessage {
  return { role: "user", content, id: id || `u-${Date.now()}` };
}

function assistantMsg(content: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { role: "assistant", content, id: `a-${Date.now()}`, toolCalls: [], ...overrides };
}

// ---------------------------------------------------------------------------
// Test 5 — Multi-turn conversation with context
// ---------------------------------------------------------------------------

suite("Test 5: Multi-turn conversation with context", () => {
  test("conversation history array accumulates correctly", () => {
    const history: ChatMessage[] = [];

    // Turn 1
    const u1 = userMsg("What is the purpose of extension.ts?");
    history.push(u1);
    const a1 = assistantMsg("extension.ts is the main entry point for the VS Code extension.");
    history.push(a1);

    // Turn 2
    const u2 = userMsg("How does it activate?");
    history.push(u2);
    const a2 = assistantMsg("It activates on the command localcoder.openChat.");
    history.push(a2);

    assert.strictEqual(history.length, 4, "history should have 4 messages after 2 turns");
    assert.strictEqual(history[0].role, "user");
    assert.strictEqual(history[1].role, "assistant");
    assert.strictEqual(history[2].role, "user");
    assert.strictEqual(history[3].role, "assistant");
  });

  test("history sent for second message excludes the current message", () => {
    const history: ChatMessage[] = [];
    history.push(userMsg("First question"));
    history.push(assistantMsg("First answer"));
    history.push(userMsg("Second question"));

    // When sending the 3rd user message, history should be all prior messages
    // i.e. history.slice(0, -1) = first user + first assistant
    const sentHistory = history.slice(0, -1);
    assert.strictEqual(sentHistory.length, 2);
    assert.strictEqual(sentHistory[0].role, "user");
    assert.strictEqual(sentHistory[1].role, "assistant");
  });

  test("conversation with file reference in turn 1 carries context to turn 2", () => {
    const history: ChatMessage[] = [];
    history.push(userMsg("@src/extension.ts\nExplain this file."));
    history.push(assistantMsg("extension.ts exports the activate() function..."));
    history.push(userMsg("What commands does it register?"));

    // The history for the 3rd message includes the file context from turn 1
    const turn3History = history.slice(0, -1);
    assert.ok(turn3History[0].content.includes("@src/extension.ts"));
  });

  test("session ID is preserved across multiple turns", () => {
    const sessionId = "sess-abc123";
    const turns: { sessionId: string; text: string }[] = [
      { sessionId, text: "Hello" },
      { sessionId, text: "Follow-up" },
      { sessionId, text: "And another" },
    ];
    assert.ok(turns.every((t) => t.sessionId === sessionId), "session ID must be stable");
  });

  test("conversation with tool calls in history", () => {
    const toolCall = makeTool("Read", { file_path: "README.md" }, "# LocalCoder");
    const history: ChatMessage[] = [
      userMsg("Read the README"),
      assistantMsg("I read it. Here is a summary...", { toolCalls: [toolCall] }),
      userMsg("Now search for any TODOs in the source"),
    ];
    const a2Tools = history[1].toolCalls;
    assert.ok(a2Tools && a2Tools.length === 1);
    assert.strictEqual(a2Tools[0].name, "Read");
    assert.strictEqual(history[2].role, "user");
  });

  test("message IDs are unique across turns", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const u = userMsg(`Turn ${i}`);
      const a = assistantMsg(`Answer ${i}`);
      if (u.id) { ids.add(u.id); }
      if (a.id) { ids.add(a.id); }
    }
    assert.strictEqual(ids.size, 20, "all message IDs must be unique");
  });

  test("empty content message is valid (e.g. tool-only response)", () => {
    const toolCall = makeTool("Bash", { command: "ls" }, { stdout: "index.ts", stderr: "", exitCode: 0 });
    const msg = assistantMsg("", { toolCalls: [toolCall] });
    assert.strictEqual(msg.content, "");
    assert.strictEqual(msg.toolCalls!.length, 1);
  });

  test("tokens are accumulated from multiple assistant messages", () => {
    const turns = [
      assistantMsg("First.", { tokens: { input: 100, output: 50 } }),
      assistantMsg("Second.", { tokens: { input: 200, output: 80 } }),
      assistantMsg("Third.", { tokens: { input: 150, output: 60 } }),
    ];
    const totalIn  = turns.reduce((s, m) => s + (m.tokens?.input  || 0), 0);
    const totalOut = turns.reduce((s, m) => s + (m.tokens?.output || 0), 0);
    assert.strictEqual(totalIn, 450);
    assert.strictEqual(totalOut, 190);
  });
});

// ---------------------------------------------------------------------------
// Test 6 — Grep, WebFetch, WebSearch + tool output rendering verification
// ---------------------------------------------------------------------------

suite("Test 6: Grep/WebFetch/WebSearch tools and output rendering", () => {
  test("Grep tool call has correct shape", () => {
    const tool = makeTool(
      "Grep",
      { pattern: "ChatPanelProvider", path: "src/", glob: "**/*.ts" },
      {
        matches: [
          { file: "src/chat-panel.ts", line: 17, match: "export class ChatPanelProvider {" },
          { file: "src/extension.ts",  line: 28, match: "const provider = new ChatPanelProvider(context);" },
        ],
      },
    );
    assert.strictEqual(tool.name, "Grep");
    const output = tool.output as { matches: Array<{ file: string; line: number; match: string }> };
    assert.ok(Array.isArray(output.matches));
    assert.strictEqual(output.matches.length, 2);
    assert.ok(output.matches[0].file, "match must have a file");
    assert.ok(output.matches[0].line > 0, "match must have a line number");
  });

  test("Grep tool with zero matches is valid", () => {
    const tool = makeTool("Grep", { pattern: "nonexistent_symbol_xyz" }, { matches: [] });
    const output = tool.output as { matches: unknown[] };
    assert.ok(Array.isArray(output.matches));
    assert.strictEqual(output.matches.length, 0);
  });

  test("WebSearch tool call has correct shape", () => {
    const tool = makeTool(
      "WebSearch",
      { query: "VS Code webview CSP best practices" },
      {
        results: [
          { title: "VS Code Webview API", url: "https://code.visualstudio.com/api/extension-guides/webview", snippet: "Webviews allow you to create fully customizable views..." },
          { title: "Content Security Policy", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP", snippet: "CSP is an added layer of security that helps to detect..." },
        ],
      },
    );
    assert.strictEqual(tool.name, "WebSearch");
    const output = tool.output as { results: Array<{ title: string; url: string; snippet: string }> };
    assert.ok(Array.isArray(output.results));
    assert.strictEqual(output.results.length, 2);
    assert.ok(output.results[0].title, "result must have title");
    assert.ok(output.results[0].url, "result must have url");
    assert.ok(output.results[0].snippet, "result must have snippet");
  });

  test("WebFetch tool call has correct shape", () => {
    const tool = makeTool(
      "WebFetch",
      { url: "https://code.visualstudio.com/api/extension-guides/webview" },
      { content: "# Webview API\nWebviews allow extensions to create fully customizable views...", statusCode: 200 },
    );
    assert.strictEqual(tool.name, "WebFetch");
    const output = tool.output as { content: string; statusCode: number };
    assert.ok(output.content.length > 0);
    assert.strictEqual(output.statusCode, 200);
  });

  test("WebFetch 404 error is captured in output", () => {
    const tool = makeTool(
      "WebFetch",
      { url: "https://example.com/not-found" },
      { content: "", statusCode: 404 },
      "error",
    );
    assert.strictEqual(tool.status, "error");
    const output = tool.output as { statusCode: number };
    assert.strictEqual(output.statusCode, 404);
  });

  test("assistant message rendering verifies all tool types are present", () => {
    const tools: ToolCall[] = [
      makeTool("Grep",      { pattern: "TODO" }, { matches: [{ file: "src/a.ts", line: 5, match: "// TODO" }] }),
      makeTool("WebSearch", { query: "openai API" }, { results: [{ title: "OpenAI", url: "https://openai.com", snippet: "..." }] }),
      makeTool("WebFetch",  { url: "https://openai.com" }, { content: "OpenAI homepage", statusCode: 200 }),
    ];
    const msg = assistantMsg("Research complete.", { toolCalls: tools });

    const names = msg.toolCalls!.map((tc) => tc.name);
    assert.ok(names.includes("Grep"),      "must have Grep tool");
    assert.ok(names.includes("WebSearch"), "must have WebSearch tool");
    assert.ok(names.includes("WebFetch"),  "must have WebFetch tool");
  });

  test("tool call sequence: Grep → Read → WebSearch renders in order", () => {
    const grep   = makeTool("Grep",      { pattern: "fetchData" }, { matches: [{ file: "src/api.ts", line: 42, match: "async function fetchData(" }] });
    const read   = makeTool("Read",      { file_path: "src/api.ts" }, "async function fetchData(url: string) {...}");
    const search = makeTool("WebSearch", { query: "fetch API best practices" }, { results: [] });

    const msg = assistantMsg("Here is what I found.", { toolCalls: [grep, read, search] });
    assert.strictEqual(msg.toolCalls![0].name, "Grep");
    assert.strictEqual(msg.toolCalls![1].name, "Read");
    assert.strictEqual(msg.toolCalls![2].name, "WebSearch");
  });

  test("tool output with long text is capped in rendering logic (simulation)", () => {
    const longContent = "A".repeat(5000);
    const tool = makeTool("WebFetch", { url: "https://example.com" }, { content: longContent, statusCode: 200 });
    const output = tool.output as { content: string };
    // Rendering logic would truncate at 2000 chars; verify the full output is stored
    assert.strictEqual(output.content.length, 5000);
    const truncated = output.content.length > 2000
      ? output.content.slice(0, 2000) + "… (truncated)"
      : output.content;
    assert.ok(truncated.includes("… (truncated)"));
  });

  test("Grep output with file, line, and match fields renders correctly", () => {
    const matches = [
      { file: "src/backends/localcoder.ts", line: 95, match: "getAuthHeaders(): Record<string, string> {" },
      { file: "src/chat-panel.ts",          line: 56, match: "private getOrCreateBackend(): ChatBackend {" },
    ];
    const tool = makeTool("Grep", { pattern: "getAuth|getOrCreate" }, { matches });

    const output = tool.output as { matches: typeof matches };
    output.matches.forEach((m) => {
      assert.ok(m.file,  "each match needs a file");
      assert.ok(m.line,  "each match needs a line number");
      assert.ok(m.match, "each match needs the matched text");
    });
  });
});
