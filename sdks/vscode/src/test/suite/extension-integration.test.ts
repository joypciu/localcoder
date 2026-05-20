import * as assert from "assert";
import * as vscode from "vscode";

const EXT_ID = "joypciu.localcoder";

suite("Extension integration (VS Code host)", () => {
  test("extension is present", () => {
    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, `Extension ${EXT_ID} not found`);
  });

  test("extension activates", async () => {
    const ext = vscode.extensions.getExtension(EXT_ID);
    await ext?.activate();
    assert.ok(ext?.isActive);
  });

  test("commands are registered", async () => {
    const cmds = await vscode.commands.getCommands(true);
    const required = [
      "localcoder.openChat",
      "localcoder.openTerminal",
      "localcoder.undoLastTurn",
      "localcoder.addSelectionToChat",
      "localcoder.explainSelection",
      "localcoder.fixSelection",
    ];
    for (const c of required) {
      assert.ok(cmds.includes(c), `Command missing: ${c}`);
    }
  });

  test("configuration keys readable", () => {
    const cfg = vscode.workspace.getConfiguration("localcoder");
    assert.ok(["build", "plan"].includes(cfg.get<string>("defaultAgent") || "build"));
    assert.strictEqual(typeof cfg.get<boolean>("openDiffOnEdit"), "boolean");
  });

  test("chat.html media file resolvable from extension", () => {
    const ext = vscode.extensions.getExtension(EXT_ID);
    const uri = vscode.Uri.joinPath(ext!.extensionUri, "media", "chat.html");
    assert.ok(uri.fsPath.endsWith("chat.html"));
  });
});
