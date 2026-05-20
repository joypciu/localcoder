import * as assert from "assert";
import * as path from "path";
import { directoryMatches, parseGlobalEvent, parseSseBlocks } from "../../backends/sse-events";

const WS = "C:\\workspace\\proj";
const SID = "ses_test_001";

suite("SSE events parser", () => {
  test("directoryMatches accepts global and exact workspace path", () => {
    assert.strictEqual(directoryMatches(WS, "global"), true);
    assert.strictEqual(directoryMatches(WS, WS), true);
    assert.strictEqual(directoryMatches(WS, "C:/other"), false);
    assert.strictEqual(directoryMatches("", "global"), true);
  });

  test("parseGlobalEvent ignores invalid JSON", () => {
    assert.deepStrictEqual(parseGlobalEvent("not-json", WS, SID), []);
  });

  test("parseGlobalEvent ignores wrong session", () => {
    const raw = JSON.stringify({
      directory: WS,
      payload: {
        type: "message.part.delta",
        properties: { sessionID: "ses_other", delta: "hi", field: "text" },
      },
    });
    assert.deepStrictEqual(parseGlobalEvent(raw, WS, SID), []);
  });

  test("parseGlobalEvent emits text delta", () => {
    const raw = JSON.stringify({
      directory: WS,
      payload: {
        type: "message.part.delta",
        properties: { sessionID: SID, delta: "Hello", field: "text" },
      },
    });
    const actions = parseGlobalEvent(raw, WS, SID);
    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].kind, "delta");
    if (actions[0].kind === "delta") { assert.strictEqual(actions[0].delta, "Hello"); }
  });

  test("parseGlobalEvent ignores non-text delta fields", () => {
    const raw = JSON.stringify({
      directory: WS,
      payload: {
        type: "message.part.delta",
        properties: { sessionID: SID, delta: "x", field: "reasoning" },
      },
    });
    assert.deepStrictEqual(parseGlobalEvent(raw, WS, SID), []);
  });

  test("parseGlobalEvent tool pending then completed", () => {
    const pending = JSON.stringify({
      directory: WS,
      payload: {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool", sessionID: SID, callID: "call1", tool: "Read",
            state: { status: "running", input: { file_path: "a.ts" } },
          },
        },
      },
    });
    const a1 = parseGlobalEvent(pending, WS, SID);
    assert.strictEqual(a1.length, 1);
    assert.strictEqual(a1[0].kind, "tool_call");

    const done = JSON.stringify({
      directory: WS,
      payload: {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool", sessionID: SID, callID: "call1", tool: "Read",
            state: { status: "completed", output: "file contents" },
          },
        },
      },
    });
    const a2 = parseGlobalEvent(done, WS, SID);
    assert.strictEqual(a2.length, 1);
    assert.strictEqual(a2[0].kind, "tool_result");
  });

  test("parseGlobalEvent tool error status", () => {
    const raw = JSON.stringify({
      directory: WS,
      payload: {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool", sessionID: SID, callID: "e1", tool: "Bash",
            state: { status: "error", error: "command failed" },
          },
        },
      },
    });
    const actions = parseGlobalEvent(raw, WS, SID);
    assert.strictEqual(actions[0].kind, "tool_result");
    if (actions[0].kind === "tool_result") {
      assert.strictEqual(actions[0].status, "error");
    }
  });

  test("parseSseBlocks splits multiple SSE data lines", () => {
    const chunk = "data: {\"a\":1}\n\ndata: {\"b\":2}\n\npartial";
    const { events, remainder } = parseSseBlocks(chunk);
    assert.strictEqual(events.length, 2);
    assert.strictEqual(remainder, "partial");
  });

  test("parseSseBlocks skips [DONE]", () => {
    const chunk = "data: [DONE]\n\n";
    const { events } = parseSseBlocks(chunk);
    assert.strictEqual(events.length, 0);
  });
});
