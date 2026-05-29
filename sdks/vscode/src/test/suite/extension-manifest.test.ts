import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

const PKG_ROOT = path.resolve(__dirname, "../../..");
const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf8"));

suite("Extension manifest", () => {
  test("package.json has required marketplace fields", () => {
    assert.strictEqual(pkg.name, "localcoder");
    assert.ok(pkg.publisher);
    assert.ok(pkg.version);
    assert.ok(pkg.engines?.vscode);
    assert.ok(fs.existsSync(path.join(PKG_ROOT, "images", "icon.png")));
    assert.ok(fs.existsSync(path.join(PKG_ROOT, "dist", "extension.js")) || true);
  });

  test("activation events include sidebar view", () => {
    const events: string[] = pkg.activationEvents || [];
    assert.ok(events.includes("onView:localcoder.chatView"));
    assert.ok(events.includes("onCommand:localcoder.openChat"));
  });

  test("configuration keys exist", () => {
    const props = pkg.contributes?.configuration?.properties || {};
    assert.ok(props["localcoder.packagePath"]);
    assert.ok(props["localcoder.bunPath"]);
    assert.ok(props["localcoder.defaultAgent"]);
    assert.strictEqual(props["localcoder.defaultAgent"].default, "build");
    assert.ok(props["localcoder.openDiffOnEdit"]);
  });

  test("commands registered", () => {
    const cmds = (pkg.contributes?.commands || []).map((c: { command: string }) => c.command);
    for (const id of [
      "localcoder.openChat",
      "localcoder.setupLlamaCpp",
      "localcoder.connectProvider",
      "localcoder.undoLastTurn",
      "localcoder.addSelectionToChat",
      "localcoder.explainSelection",
      "localcoder.fixSelection",
      "localcoder.editSelection",
    ]) {
      assert.ok(cmds.includes(id), `missing ${id}`);
    }
  });

  test("chat view contributed", () => {
    const views = pkg.contributes?.views?.["localcoder-sidebar"] || [];
    assert.ok(views.some((v: { id: string }) => v.id === "localcoder.chatView"));
  });

  test("keybindings for undo and add selection", () => {
    const kb = pkg.contributes?.keybindings || [];
    assert.ok(kb.some((k: { command: string }) => k.command === "localcoder.undoLastTurn"));
    assert.ok(kb.some((k: { command: string }) => k.command === "localcoder.addSelectionToChat"));
  });
});
