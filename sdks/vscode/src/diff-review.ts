import * as vscode from "vscode";
import { chatProviderRef } from "./chat-panel";

export function activeDiffModifiedPath(): string | undefined {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (!tab?.input || !(tab.input instanceof vscode.TabInputTextDiff)) {
    return undefined;
  }
  if (tab.input.modified.scheme !== "file") {
    return undefined;
  }
  return tab.input.modified.fsPath;
}

export function registerDiffReview(context: vscode.ExtensionContext) {
  const refresh = new vscode.EventEmitter<void>();
  context.subscriptions.push(refresh);

  const lensProvider: vscode.CodeLensProvider = {
    onDidChangeCodeLenses: refresh.event,
    provideCodeLenses(document) {
      const pending = chatProviderRef?.getPendingReviewPaths() ?? [];
      const abs = document.uri.fsPath;
      if (!pending.includes(abs)) {
        return [];
      }
      const top = new vscode.Range(0, 0, 0, 0);
      return [
        new vscode.CodeLens(top, {
          title: "$(check) Accept",
          command: "localcoder.acceptDiff",
          arguments: [abs],
        }),
        new vscode.CodeLens(top, {
          title: "$(discard) Reject",
          command: "localcoder.rejectDiff",
          arguments: [abs],
        }),
      ];
    },
  };

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ scheme: "file" }, lensProvider),
    vscode.commands.registerCommand("localcoder.acceptDiff", async (filePath?: string) => {
      const target = filePath ?? activeDiffModifiedPath();
      if (target) {
        await chatProviderRef?.commandAcceptFile(target);
      } else {
        await chatProviderRef?.commandAcceptChanges();
      }
      refresh.fire();
    }),
    vscode.commands.registerCommand("localcoder.rejectDiff", async (filePath?: string) => {
      const target = filePath ?? activeDiffModifiedPath();
      if (target) {
        await chatProviderRef?.commandRejectFile(target);
      } else {
        await chatProviderRef?.commandUndo();
      }
      refresh.fire();
    }),
    vscode.commands.registerCommand("localcoder.acceptAllChanges", async () => {
      await chatProviderRef?.commandAcceptChanges();
      refresh.fire();
    }),
  );

  return refresh;
}
