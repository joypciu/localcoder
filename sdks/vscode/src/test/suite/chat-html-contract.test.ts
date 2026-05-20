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
    for (const id of ["hdr", "msgs", "inp", "snd", "conn-dot", "agent-sel", "mention-box", "cfg-overlay", "ses-overlay"]) {
      assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
    }
  });

  test("message types handled in webview", () => {
    for (const t of ["streamDelta", "toolCall", "toolResult", "streamDone", "undone", "fileSuggestions", "insertText", "fileUndone"]) {
      assert.ok(html.includes(`'${t}'`) || html.includes(`"${t}"`), `missing handler ${t}`);
    }
  });

  test("undo UI: revert all and per-file", () => {
    assert.ok(html.includes("doRevert"));
    assert.ok(html.includes("doRevertFile"));
    assert.ok(html.includes("undoLastTurn"));
    assert.ok(html.includes("undoFile"));
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

  test("sendMessage includes agent and files", () => {
    assert.ok(html.includes("agent: agent"));
    assert.ok(html.includes("files: files"));
  });
});
