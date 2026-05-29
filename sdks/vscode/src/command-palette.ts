import * as vscode from "vscode";
import { chatProviderRef } from "./chat-panel";
import { LocalcoderBackend } from "./backends/localcoder";

export async function showLocalcoderCommandPalette(): Promise<void> {
  const provider = chatProviderRef;
  if (!provider) {
    await vscode.window.showInformationMessage("Open LocalCoder chat first (Activity Bar icon).");
    return;
  }

  type Item = vscode.QuickPickItem & { id: string };
  const items: Item[] = [
    { label: "$(add) New Session", description: "Clear chat and start fresh", id: "newSession" },
    { label: "$(fold) Compact Context", description: "Summarize a long session", id: "compact" },
    { label: "$(symbol-event) Switch Model", description: "Change the active model", id: "switchModel" },
    { label: "$(settings-gear) Settings", description: "Provider and backend settings", id: "settings" },
    { label: "$(discard) Undo Last Turn", description: "Revert agent file edits", id: "undo" },
    { label: "$(debug-stop) Stop Generation", description: "Abort the current request", id: "abort" },
  ];

  const pick = await vscode.window.showQuickPick(items, {
    title: "LocalCoder Command Palette",
    placeHolder: "Type a command…",
    matchOnDescription: true,
  });
  if (!pick) { return; }

  switch (pick.id) {
    case "newSession":
      await provider.commandNewSession();
      break;
    case "compact":
      await provider.commandCompactSession();
      break;
    case "switchModel":
      await pickAndSwitchModel(provider);
      break;
    case "settings":
      await provider.commandOpenSettings();
      break;
    case "undo":
      await provider.commandUndo();
      break;
    case "abort":
      await provider.commandAbort();
      break;
  }
}

async function pickAndSwitchModel(provider: NonNullable<typeof chatProviderRef>): Promise<void> {
  const backend = provider.getBackend();
  if (!backend || backend.type !== "localcoder") {
    await vscode.window.showWarningMessage("Switch model is only available with the LocalCoder backend.");
    return;
  }
  const models = await (backend as LocalcoderBackend).listModels();
  if (!models.length) {
    await vscode.window.showWarningMessage("No models available. Connect a provider in Settings.");
    return;
  }
  const pick = await vscode.window.showQuickPick(
    models.map((m) => ({ label: m.name || m.id, description: m.id, modelId: m.id })),
    { title: "Switch Model", placeHolder: "Select a model…" },
  );
  if (!pick) { return; }
  await provider.commandSwitchModel(pick.modelId);
}
