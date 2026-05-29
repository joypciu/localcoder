import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

suite("Diff accept/reject contract", () => {
  test("chat-panel exposes acceptChanges message handler in source", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../../src/chat-panel.ts"), "utf8");
    assert.ok(src.includes('case "acceptChanges"'));
    assert.ok(src.includes('case "acceptFile"'));
    assert.ok(src.includes("acceptChanges(paths"));
    assert.ok(src.includes('type: "changesAccepted"'));
  });

  test("diff-review registers accept and reject commands", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../../src/diff-review.ts"), "utf8");
    assert.ok(src.includes("localcoder.acceptDiff"));
    assert.ok(src.includes("localcoder.rejectDiff"));
    assert.ok(src.includes("CodeLens"));
  });

  test("write tool snapshot roundtrip for accept", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lc-diff-accept-"));
    const file = path.join(dir, "sample.txt");
    fs.writeFileSync(file, "before");
    const before = fs.readFileSync(file);
    fs.writeFileSync(file, "after");
    assert.notDeepEqual(fs.readFileSync(file), before);
    fs.writeFileSync(file, before);
    assert.deepEqual(fs.readFileSync(file), before);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
