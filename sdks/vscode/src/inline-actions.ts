import * as vscode from "vscode";

import { chatProviderRef } from "./chat-panel";

/** Cursor / Codex-style inline CodeLens above the active line. */
export function registerInlineActions(context: vscode.ExtensionContext) {
  const selector: vscode.DocumentSelector = { pattern: "**" };

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, {
      provideCodeLenses(document) {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
          return [];
        }

        const line = editor.selection.active.line;
        const range = new vscode.Range(line, 0, line, 0);

        return [
          new vscode.CodeLens(range, { title: "$(sparkle) Explain", command: "localcoder.explainSelection" }),
          new vscode.CodeLens(range, { title: "$(wrench) Fix", command: "localcoder.fixSelection" }),
          new vscode.CodeLens(range, { title: "$(comment) Ask", command: "localcoder.addSelectionToChat" }),
          new vscode.CodeLens(range, { title: "$(edit) Edit", command: "localcoder.editSelection" }),
        ];
      },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("localcoder.editSelection", async () => {
      const ref = getSelectionRef();
      if (!ref) {
        void vscode.window.showWarningMessage("Open a workspace file and select code first.");
        return;
      }
      const instruction = await vscode.window.showInputBox({
        title: "LocalCoder — Edit selection",
        prompt: "Describe the change you want",
        placeHolder: "e.g. Add null checks and improve naming",
      });
      if (!instruction) { return; }
      await vscode.commands.executeCommand("localcoder.openChat");
      await chatProviderRef?.commandSendText(`Edit ${ref}: ${instruction}`);
    }),
  );
}

function getSelectionRef(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return undefined; }
  const wf = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!wf) { return undefined; }
  let ref = `@${vscode.workspace.asRelativePath(editor.document.uri)}`;
  const sel = editor.selection;
  if (!sel.isEmpty) {
    const s = sel.start.line + 1;
    const e = sel.end.line + 1;
    ref += s === e ? `#L${s}` : `#L${s}-${e}`;
  }
  return ref;
}
