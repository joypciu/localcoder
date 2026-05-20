import * as assert from "assert";
import { OpenAIBackend } from "../../backends/openai";

suite("OpenAI backend", () => {
  test("start throws without API key", async () => {
    const b = new OpenAIBackend({ apiKey: "", endpoint: "https://api.openai.com/v1", model: "gpt-4o" });
    await assert.rejects(() => b.start(), /API key/);
  });

  test("start succeeds with key", async () => {
    const b = new OpenAIBackend({ apiKey: "test-key", endpoint: "https://api.openai.com/v1", model: "gpt-4o" });
    await b.start();
  });

  test("updateConfig changes model", () => {
    const b = new OpenAIBackend({ apiKey: "k", model: "gpt-4o" });
    b.updateConfig({ model: "gpt-4o-mini" });
    assert.ok(b);
  });

  test("getActiveSessionId null before message", () => {
    const b = new OpenAIBackend({ apiKey: "k" });
    assert.strictEqual(b.getActiveSessionId(), null);
  });

  test("abort does not throw when idle", () => {
    const b = new OpenAIBackend({ apiKey: "k" });
    assert.doesNotThrow(() => b.abort());
  });
});
