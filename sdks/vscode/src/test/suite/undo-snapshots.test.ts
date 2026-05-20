import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { isWriteTool, WRITE_TOOL_NAMES } from "../helpers";

suite("Undo snapshot logic", () => {
  test("WRITE_TOOLS includes common variants", () => {
    assert.ok(isWriteTool("Write"));
    assert.ok(isWriteTool("edit_file"));
    assert.strictEqual(isWriteTool("Read"), false);
    assert.strictEqual(isWriteTool("Bash"), false);
    assert.strictEqual(WRITE_TOOL_NAMES.length, 6);
  });

  test("snapshot restore simulation: overwrite and restore", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lc-undo-"));
    const file = path.join(dir, "target.txt");
    const original = "original content\n";
    fs.writeFileSync(file, original);
    const snapshot = fs.readFileSync(file);
    fs.writeFileSync(file, "agent modified\n");
    assert.notStrictEqual(fs.readFileSync(file, "utf8"), original);
    fs.writeFileSync(file, snapshot);
    assert.strictEqual(fs.readFileSync(file, "utf8"), original);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("snapshot null means file was created this turn", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lc-new-"));
    const file = path.join(dir, "newfile.txt");
    const existed = fs.existsSync(file);
    assert.strictEqual(existed, false);
    fs.writeFileSync(file, "created by agent");
    assert.ok(fs.existsSync(file));
    fs.unlinkSync(file);
    assert.strictEqual(fs.existsSync(file), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("relative path resolution", () => {
    const wf = "C:\\proj";
    const rel = "src\\app.ts";
    const abs = path.isAbsolute(rel) ? rel : path.join(wf, rel);
    assert.ok(abs.includes("app.ts"));
  });
});
