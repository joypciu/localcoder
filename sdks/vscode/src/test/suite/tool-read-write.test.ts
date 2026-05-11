/**
 * Test 1: Basic tool call (read file, glob search)
 * Test 2: Write/edit tool (create file, modify content)
 */
import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
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
    content: "Done.",
    id: `msg-${Date.now()}`,
    toolCalls: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1 — Read file & Glob search
// ---------------------------------------------------------------------------

suite("Test 1: Basic tool call — read file and glob search", () => {
  test("ToolCall type shape is correct for Read", () => {
    const tool = makeTool("Read", { file_path: "/workspace/src/index.ts" }, "const x = 1;\n");
    assert.strictEqual(tool.name, "Read");
    assert.strictEqual(tool.status, "completed");
    assert.ok(tool.input.file_path, "input must contain file_path");
    assert.ok(typeof tool.output === "string", "output must be a string");
  });

  test("ToolCall type shape is correct for Glob", () => {
    const tool = makeTool("Glob", { pattern: "**/*.ts" }, ["src/index.ts", "src/utils.ts"]);
    assert.strictEqual(tool.name, "Glob");
    assert.ok(Array.isArray(tool.output), "glob output should be an array");
    assert.ok((tool.output as string[]).length > 0, "glob output should have results");
  });

  test("assistant message with read + glob tool calls conforms to ChatMessage", () => {
    const read = makeTool("Read", { file_path: "README.md" }, "# LocalCoder\nAI coding agent.");
    const glob = makeTool("Glob", { pattern: "**/*.md" }, ["README.md", "CONTRIBUTING.md"]);
    const msg = makeAssistantMsg({ content: "Here are the files.", toolCalls: [read, glob] });

    assert.strictEqual(msg.role, "assistant");
    assert.ok(msg.toolCalls);
    assert.strictEqual(msg.toolCalls!.length, 2);
    assert.strictEqual(msg.toolCalls![0].name, "Read");
    assert.strictEqual(msg.toolCalls![1].name, "Glob");
  });

  test("running tool call has status=running", () => {
    const tool = makeTool("Read", { file_path: "big-file.ts" }, undefined, "running");
    assert.strictEqual(tool.status, "running");
    assert.strictEqual(tool.output, undefined);
  });

  test("tool call with error status is properly typed", () => {
    const tool = makeTool("Read", { file_path: "nonexistent.ts" }, "File not found", "error");
    assert.strictEqual(tool.status, "error");
    assert.ok(tool.output, "error output should be present");
  });

  test("Read tool input roundtrips through JSON", () => {
    const original = { file_path: "/home/user/project/src/chat-panel.ts", limit: 100, offset: 50 };
    const tool = makeTool("Read", original, "file contents...");
    const json = JSON.stringify(tool.input);
    const parsed = JSON.parse(json);
    assert.deepStrictEqual(parsed, original);
  });

  test("Glob supports multiple file matches", () => {
    const files = ["src/a.ts", "src/b.ts", "test/c.test.ts"];
    const tool = makeTool("Glob", { pattern: "**/*.ts" }, files);
    assert.deepStrictEqual(tool.output, files);
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Write / Edit tool
// ---------------------------------------------------------------------------

suite("Test 2: Write/edit tool — create and modify files", () => {
  let tmpDir: string;
  let tmpFile: string;

  suiteSetup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "localcoder-test-"));
    tmpFile = path.join(tmpDir, "sample.ts");
  });

  suiteTeardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("Write tool call has correct shape", () => {
    const content = 'export function hello() {\n  return "world";\n}\n';
    const tool = makeTool("Write", { file_path: tmpFile, content }, null);
    assert.strictEqual(tool.name, "Write");
    assert.strictEqual((tool.input as Record<string, string>).file_path, tmpFile);
    assert.ok((tool.input as Record<string, string>).content.includes("hello"));
  });

  test("Write tool actually creates a file in temp dir", () => {
    const content = 'export const VERSION = "1.0.0";\n';
    fs.writeFileSync(tmpFile, content, "utf8");
    assert.ok(fs.existsSync(tmpFile), "file should exist after write");
    const read = fs.readFileSync(tmpFile, "utf8");
    assert.strictEqual(read, content);
  });

  test("Edit tool call diff output is a string", () => {
    const diff = [
      "--- a/sample.ts",
      "+++ b/sample.ts",
      "@@ -1,1 +1,2 @@",
      "-export const VERSION = \"1.0.0\";",
      "+export const VERSION = \"2.0.0\";",
      "+export const NAME = \"localcoder\";",
    ].join("\n");
    const tool = makeTool("Edit", { file_path: tmpFile, old_string: "1.0.0", new_string: "2.0.0" }, diff);
    assert.strictEqual(tool.name, "Edit");
    assert.ok(typeof tool.output === "string");
    assert.ok((tool.output as string).includes("@@"));
  });

  test("Edit tool input has old_string and new_string", () => {
    const tool = makeTool("Edit", {
      file_path: "src/extension.ts",
      old_string: "const x = 1;",
      new_string: "const x = 2;",
    }, null);
    const inp = tool.input as Record<string, string>;
    assert.ok(inp.old_string, "must have old_string");
    assert.ok(inp.new_string, "must have new_string");
  });

  test("assistant message with write tool conforms to ChatMessage", () => {
    const write = makeTool("Write", { file_path: "output.ts", content: "// generated" }, null);
    const msg = makeAssistantMsg({
      content: "I created the file.",
      toolCalls: [write],
    });
    assert.strictEqual(msg.toolCalls!.length, 1);
    assert.strictEqual(msg.toolCalls![0].name, "Write");
  });

  test("Write then Edit produces two sequential tool calls", () => {
    const write = makeTool("Write", { file_path: "foo.ts", content: "const x = 1;\n" }, null);
    const edit  = makeTool("Edit",  { file_path: "foo.ts", old_string: "1", new_string: "42" }, "diff output");
    const msg   = makeAssistantMsg({ toolCalls: [write, edit] });
    assert.strictEqual(msg.toolCalls!.length, 2);
    assert.strictEqual(msg.toolCalls![0].name, "Write");
    assert.strictEqual(msg.toolCalls![1].name, "Edit");
  });
});
