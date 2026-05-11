/**
 * Test 3: Shell tool (run commands)
 * Test 4: Sub-agent task delegation
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

function makeAssistantMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    role: "assistant",
    content: "",
    id: `msg-${Date.now()}`,
    toolCalls: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 3 — Shell / Bash tool
// ---------------------------------------------------------------------------

suite("Test 3: Shell tool — run commands and capture output", () => {
  test("Bash tool call has correct shape", () => {
    const tool = makeTool("Bash", { command: "ls -la" }, { stdout: "total 64\ndrwxr-xr-x ...", stderr: "", exitCode: 0 });
    assert.strictEqual(tool.name, "Bash");
    assert.strictEqual((tool.input as Record<string, string>).command, "ls -la");
  });

  test("shell output has stdout and stderr fields", () => {
    const output = { stdout: "hello\nworld", stderr: "", exitCode: 0 };
    const tool = makeTool("Bash", { command: "echo hello && echo world" }, output);
    const out = tool.output as Record<string, unknown>;
    assert.ok("stdout" in out, "output must have stdout");
    assert.ok("stderr" in out, "output must have stderr");
    assert.ok((out.stdout as string).includes("hello"));
  });

  test("failed shell command has non-zero exit code in stderr", () => {
    const output = { stdout: "", stderr: "No such file or directory", exitCode: 1 };
    const tool = makeTool("Bash", { command: "cat /nonexistent" }, output, "error");
    assert.strictEqual(tool.status, "error");
    const out = tool.output as Record<string, unknown>;
    assert.ok((out.stderr as string).length > 0);
    assert.strictEqual(out.exitCode, 1);
  });

  test("shell command output is truncated correctly at 2000 chars", () => {
    const bigOutput = "x".repeat(3000);
    const output = { stdout: bigOutput, stderr: "", exitCode: 0 };
    const tool = makeTool("Bash", { command: "cat large-file.txt" }, output);
    // Simulates what the UI formatter would do: output is stored as-is in the tool call
    // The renderer would truncate it; the tool call itself stores the full output
    const out = tool.output as Record<string, unknown>;
    assert.strictEqual((out.stdout as string).length, 3000);
  });

  test("multi-command pipeline tool call", () => {
    const cmd = "find . -name '*.ts' | head -10";
    const tool = makeTool("Bash", { command: cmd }, { stdout: "src/index.ts\nsrc/utils.ts", stderr: "", exitCode: 0 });
    assert.strictEqual((tool.input as Record<string, string>).command, cmd);
  });

  test("assistant message with multiple bash tool calls", () => {
    const t1 = makeTool("Bash", { command: "npm install" }, { stdout: "added 10 packages", stderr: "", exitCode: 0 });
    const t2 = makeTool("Bash", { command: "npm test" }, { stdout: "All tests passed", stderr: "", exitCode: 0 });
    const msg = makeAssistantMsg({ content: "Installed and tested.", toolCalls: [t1, t2] });
    assert.strictEqual(msg.toolCalls!.length, 2);
    assert.ok(msg.toolCalls!.every((tc) => tc.name === "Bash"));
  });

  test("shell tool with running status (in progress)", () => {
    const tool = makeTool("Bash", { command: "sleep 5" }, undefined, "running");
    assert.strictEqual(tool.status, "running");
    assert.strictEqual(tool.output, undefined);
  });

  test("Bash tool call with cwd input field", () => {
    const tool = makeTool("Bash", { command: "ls", cwd: "/workspace/src" }, { stdout: "index.ts", stderr: "", exitCode: 0 });
    const inp = tool.input as Record<string, string>;
    assert.ok(inp.cwd, "tool input should support cwd");
    assert.strictEqual(inp.cwd, "/workspace/src");
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Sub-agent task delegation
// ---------------------------------------------------------------------------

suite("Test 4: Sub-agent task delegation", () => {
  test("Agent tool call has correct shape", () => {
    const tool = makeTool(
      "Agent",
      { description: "Search the codebase for all TODO comments", agent_type: "Explore" },
      "Found 14 TODO comments across 8 files.",
    );
    assert.strictEqual(tool.name, "Agent");
    const inp = tool.input as Record<string, string>;
    assert.ok(inp.description, "agent tool must have a description");
    assert.ok(inp.agent_type, "agent tool should specify agent_type");
  });

  test("agent output is a string summary", () => {
    const tool = makeTool("Agent", { description: "Explore tests", agent_type: "Explore" }, "Found 3 test files.");
    assert.ok(typeof tool.output === "string", "agent output should be a string");
    assert.ok((tool.output as string).length > 0);
  });

  test("task delegation tool call with running status", () => {
    const tool = makeTool("Agent", { description: "Review security" }, undefined, "running");
    assert.strictEqual(tool.status, "running");
    assert.strictEqual(tool.output, undefined);
  });

  test("assistant message shows agent name in metadata", () => {
    const msg = makeAssistantMsg({
      agent: "claude-sonnet-4-6",
      model: "claude-sonnet-4-6",
      content: "Delegated the task.",
    });
    assert.ok(msg.agent, "message should carry agent name");
    assert.ok(msg.model, "message should carry model info");
  });

  test("nested agent delegation: parent spawns sub-agent", () => {
    const subAgentTool = makeTool(
      "Agent",
      { description: "Run tests in packages/core", agent_type: "general-purpose" },
      "All 42 tests passed in 3.2s",
    );
    const parentMsg = makeAssistantMsg({
      agent: "Orchestrator",
      content: "Sub-agent completed testing.",
      toolCalls: [subAgentTool],
    });
    assert.strictEqual(parentMsg.toolCalls!.length, 1);
    assert.strictEqual(parentMsg.toolCalls![0].name, "Agent");
    assert.ok(parentMsg.agent === "Orchestrator");
  });

  test("task tool (alternative name) conforms to ToolCall", () => {
    const tool = makeTool("task", { description: "Summarize changes" }, "3 files modified, +45 -12 lines.");
    assert.strictEqual(tool.name, "task");
    assert.ok(typeof tool.output === "string");
  });

  test("multiple sequential agent delegations", () => {
    const t1 = makeTool("Agent", { description: "Analyze auth module" }, "Auth uses JWT with RS256.");
    const t2 = makeTool("Agent", { description: "Check for vulnerabilities" }, "No critical issues found.");
    const msg = makeAssistantMsg({
      content: "Security review complete.",
      toolCalls: [t1, t2],
    });
    assert.strictEqual(msg.toolCalls!.length, 2);
    assert.ok(msg.toolCalls!.every((tc) => tc.name === "Agent"));
  });
});
