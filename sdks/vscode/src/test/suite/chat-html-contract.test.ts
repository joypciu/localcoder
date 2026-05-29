import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

const htmlPath = path.resolve(__dirname, "../../../media/chat.html");
const html = fs.readFileSync(htmlPath, "utf8");

suite("Chat webview contract", () => {
  test("chat.html exists and has CSP", () => {
    assert.ok(html.includes("Content-Security-Policy"));
    assert.ok(html.includes("default-src 'none'"));
  });

  test("required DOM ids present", () => {
    for (const id of ["hdr", "msgs", "inp", "snd", "conn-dot", "agent-sel", "mention-box", "cfg-overlay", "ses-overlay", "usage-bar", "usage-ctx-bar", "status-bar", "attach-row", "todo-panel", "model-badge", "queue-badge", "cfg-model", "mcp-info", "mcp-list"]) {
      assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
    }
  });

  test("message types handled in webview", () => {
    for (const t of ["streamDelta", "streamReasoningDelta", "streamStart", "toolCall", "toolResult", "streamDone", "undone", "fileSuggestions", "insertText", "fileUndone", "usage", "agentStatus", "compactDone", "workspaceMeta", "todos", "sessionStatus"]) {
      assert.ok(html.includes(`'${t}'`) || html.includes(`"${t}"`), `missing handler ${t}`);
    }
  });

  test("undo UI: revert all and per-file", () => {
    assert.ok(html.includes("doRevert"));
    assert.ok(html.includes("doRevertFile"));
    assert.ok(html.includes("doAcceptFile"));
    assert.ok(html.includes("undoLastTurn"));
    assert.ok(html.includes("undoFile"));
    assert.ok(html.includes("acceptChanges"));
    assert.ok(html.includes("acceptFile"));
  });

  test("agent mode selector", () => {
    assert.ok(html.includes('id="agent-sel"'));
    assert.ok(html.includes('value="build"'));
    assert.ok(html.includes('value="plan"'));
  });

  test("@ mention triggers listFiles", () => {
    assert.ok(html.includes("listFiles"));
    assert.ok(html.includes("insertMention"));
  });

  test("slash commands and message queue", () => {
    assert.ok(html.includes("handleSlashCommand"));
    assert.ok(html.includes("msgQueue"));
    assert.ok(html.includes("/compact"));
  });
  test("regenerate and open file actions", () => {
    assert.ok(html.includes("regenerateTurn"));
    assert.ok(html.includes("openToolFile"));
    assert.ok(html.includes("compactSession"));
    assert.ok(html.includes("keepChanges"));
  });

  test("sendMessage includes agent and files", () => {
    assert.ok(html.includes("agent: agent"));
    assert.ok(html.includes("files: files"));
  });

  test("zero-config wizard UI in settings overlay", () => {
    for (const id of ["cfg-llama", "cfg-cloud", "mcp-info", "mcp-list"]) {
      assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
    }
    assert.ok(html.includes("setupLlamaCpp"));
    assert.ok(html.includes("connectProvider"));
    assert.ok(html.includes("mcpServers"));
  });
});
