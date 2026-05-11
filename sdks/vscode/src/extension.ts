import * as vscode from "vscode";
import * as path from "path";
import { ChatPanelProvider } from "./chat-panel";

const TERMINAL_NAME = "localcoder";

export function activate(context: vscode.ExtensionContext) {
  const localcoderDir = path.resolve(context.extensionPath, "..", "..", "packages", "localcoder");
  const cmd = `bun run --cwd "${localcoderDir}" --conditions=browser src/index.ts`;

  // Chat panel provider
  const chatProvider = new ChatPanelProvider(context);
  const openChatDisposable = vscode.commands.registerCommand("localcoder.openChat", async () => {
    await chatProvider.openChat();
  });
  context.subscriptions.push(openChatDisposable);

  // Terminal-based TUI commands
  const openNewTerminalDisposable = vscode.commands.registerCommand("localcoder.openNewTerminal", async () => {
    await openTerminal();
  });

  const openTerminalDisposable = vscode.commands.registerCommand("localcoder.openTerminal", async () => {
    const existingTerminal = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
    if (existingTerminal) {
      existingTerminal.show();
      return;
    }

    await openTerminal();
  });

  let addFilepathDisposable = vscode.commands.registerCommand("localcoder.addFilepathToTerminal", async () => {
    const fileRef = getActiveFile();
    if (!fileRef) {
      return;
    }

    const terminal = vscode.window.activeTerminal;
    if (!terminal) {
      return;
    }

    if (terminal.name === TERMINAL_NAME) {
      // @ts-ignore
      const port = terminal.creationOptions.env?.["_EXTENSION_LOCALCODER_PORT"];
      const directory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      port ? await appendPrompt(parseInt(port), fileRef, directory) : terminal.sendText(fileRef, false);
      terminal.show();
    }
  });

  context.subscriptions.push(openNewTerminalDisposable, openTerminalDisposable, addFilepathDisposable);

  async function openTerminal() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384;
    const terminal = vscode.window.createTerminal({
      name: TERMINAL_NAME,
      iconPath: {
        light: vscode.Uri.file(context.asAbsolutePath("images/button-dark.svg")),
        dark: vscode.Uri.file(context.asAbsolutePath("images/button-light.svg")),
      },
      location: {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
      },
      env: {
        _EXTENSION_LOCALCODER_PORT: port.toString(),
        LOCALCODER_CALLER: "vscode",
      },
    });

    terminal.show();

    const projectArg = workspaceFolder ? ` "${workspaceFolder}"` : "";
    terminal.sendText(`${cmd}${projectArg} --port ${port}`);

    const fileRef = getActiveFile();
    if (!fileRef) {
      return;
    }

    let tries = 10;
    let connected = false;
    do {
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        await fetch(`http://localhost:${port}/app`);
        connected = true;
        break;
      } catch {}

      tries--;
    } while (tries > 0);

    if (connected) {
      await appendPrompt(port, `In ${fileRef}`, workspaceFolder);
      terminal.show();
    }
  }

  async function appendPrompt(port: number, text: string, directory?: string) {
    const url = new URL(`http://localhost:${port}/tui/append-prompt`);
    if (directory) {url.searchParams.set("directory", directory);}
    await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
  }

  function getActiveFile() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return;
    }

    const document = activeEditor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return;
    }

    const relativePath = vscode.workspace.asRelativePath(document.uri);
    let filepathWithAt = `@${relativePath}`;

    const selection = activeEditor.selection;
    if (!selection.isEmpty) {
      const startLine = selection.start.line + 1;
      const endLine = selection.end.line + 1;

      if (startLine === endLine) {
        filepathWithAt += `#L${startLine}`;
      } else {
        filepathWithAt += `#L${startLine}-${endLine}`;
      }
    }

    return filepathWithAt;
  }
}

export function deactivate() {}
