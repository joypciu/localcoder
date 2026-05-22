import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as cp from "child_process";
import * as os from "os";
import { ChatPanelProvider, ChatSidebarProvider, chatProviderRef } from "./chat-panel";



async function resolveLocalcoderExe(): Promise<string | undefined> {
  const cfg = vscode.workspace.getConfiguration("localcoder");
  const configured = cfg.get<string>("packagePath");
  const candidates: string[] = [];
  if (configured) {
    candidates.push(path.join(path.resolve(configured), "dist", "localcoder-windows-x64", "bin", "localcoder.exe"));
  }
  candidates.push(path.resolve(__dirname, "..", "..", "packages", "localcoder", "dist", "localcoder-windows-x64", "bin", "localcoder.exe"));
  for (const c of candidates) {
    if (fs.existsSync(c)) { return c; }
  }
  return undefined;
}

async function configureLlamaCpp(ctx: vscode.ExtensionContext): Promise<boolean> {
  const defaultDir = process.platform === "win32"
    ? "P:\\llama cpp\\llama-b9284-bin-win-cuda-13.1-x64"
    : path.join(os.homedir(), "llama.cpp");
  const defaultModel = process.platform === "win32"
    ? "P:\\gguf models\\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf"
    : "";

  const dirUri = await vscode.window.showOpenDialog({
    title: "Select llama.cpp folder (contains llama-server)",
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri: fs.existsSync(defaultDir) ? vscode.Uri.file(defaultDir) : undefined,
  });
  if (!dirUri?.[0]) { return false; }

  const modelUri = await vscode.window.showOpenDialog({
    title: "Select GGUF model file",
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { "GGUF models": ["gguf"] },
    defaultUri: defaultModel && fs.existsSync(defaultModel)
      ? vscode.Uri.file(defaultModel)
      : dirUri[0],
  });
  if (!modelUri?.[0]) { return false; }

  const llamaDir = dirUri[0].fsPath;
  const modelPath = modelUri[0].fsPath;
  const exe = await resolveLocalcoderExe();
  if (!exe) {
    void vscode.window.showErrorMessage(
      "LocalCoder CLI not found. Run bun run build:win in packages/localcoder or set localcoder.packagePath.",
    );
    return false;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Configuring llama.cpp (first load may take a few minutes)…",
        cancellable: false,
      },
      () => new Promise<void>((resolve, reject) => {
        const proc = cp.spawn(exe, ["llamacpp", "setup", "--dir", llamaDir, "--model", modelPath], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        proc.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
        proc.stderr?.on("data", (d: Buffer) => { out += d.toString(); });
        proc.on("error", reject);
        proc.on("close", (code: number | null) => {
          if (code === 0) { resolve(); return; }
          reject(new Error(out.trim() || `llamacpp setup exited ${code}`));
        });
      }),
    );
  } catch (err) {
    void vscode.window.showErrorMessage(`llama.cpp setup failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }

  await ctx.globalState.update("chatBackendConfig", { type: "localcoder" });
  await ctx.globalState.update("localcoder.hasSetup", true);
  void vscode.window.showInformationMessage(
    "LocalCoder: llama.cpp is ready. Open the LocalCoder icon in the Activity Bar to chat.",
  );
  return true;
}

const TERMINAL_NAME = "localcoder";

export function activate(context: vscode.ExtensionContext) {
  const localcoderDir = path.resolve(context.extensionPath, "..", "..", "packages", "localcoder");
  const cmd = `bun run --cwd "${localcoderDir}" --conditions=browser src/index.ts`;

  // Sidebar chat (Activity Bar icon) — primary entry point
  const sidebarProvider = new ChatSidebarProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatSidebarProvider.viewType,
      sidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // Panel chat — Ctrl+Shift+L or editor title button
  const chatProvider = new ChatPanelProvider(context);
  context.subscriptions.push(
    vscode.commands.registerCommand("localcoder.openChat", async () => {
      await chatProvider.openChat();
    }),
    vscode.commands.registerCommand("localcoder.openNewTerminal", async () => {
      await openTerminal();
    }),
    vscode.commands.registerCommand("localcoder.openTerminal", async () => {
      const existingTerminal = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
      if (existingTerminal) { existingTerminal.show(); return; }
      await openTerminal();
    }),
    vscode.commands.registerCommand("localcoder.undoLastTurn", async () => {
      await chatProviderRef?.commandUndo();
    }),
    vscode.commands.registerCommand("localcoder.addSelectionToChat", async () => {
      const ref = getActiveFile();
      if (ref) { await chatProviderRef?.commandInsertText(ref + " "); }
    }),
    vscode.commands.registerCommand("localcoder.explainSelection", async () => {
      const ref = getActiveFile();
      if (ref) { await chatProviderRef?.commandSendText(`Explain ${ref}`); }
    }),
    vscode.commands.registerCommand("localcoder.fixSelection", async () => {
      const ref = getActiveFile();
      if (ref) { await chatProviderRef?.commandSendText(`Fix issues in ${ref}`); }
    }),
    vscode.commands.registerCommand("localcoder.addFilepathToTerminal", async () => {
      const fileRef = getActiveFile();
      if (!fileRef) { return; }
      const terminal = vscode.window.activeTerminal;
      if (!terminal) { return; }
      if (terminal.name === TERMINAL_NAME) {
        // @ts-ignore
        const port = terminal.creationOptions.env?.["_EXTENSION_LOCALCODER_PORT"];
        const directory = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        port ? await appendPrompt(parseInt(port), fileRef, directory) : terminal.sendText(fileRef, false);
        terminal.show();
      }
    }),
  );

  // First-run provider setup wizard
  const hasSetup = context.globalState.get<boolean>("localcoder.hasSetup");
  if (!hasSetup) {
    void showFirstRunSetup(context);
  }

  // -------------------------------------------------------------------------

  async function showFirstRunSetup(ctx: vscode.ExtensionContext) {
    const FREE_PROVIDERS: vscode.QuickPickItem[] = [
      {
        label: "$(close) Skip for now",
        description: "No provider yet — configure later in the chat panel",
      },
      {
        label: "$(sparkle) Free — Google Gemini (Flash)",
        description: "Free tier · No credit card required",
        detail: "Endpoint: https://generativelanguage.googleapis.com/v1beta/openai · Get key at aistudio.google.com",
      },
      {
        label: "$(sparkle) Free — Groq (Llama / Mixtral)",
        description: "Free tier · Fast inference",
        detail: "Endpoint: https://api.groq.com/openai/v1 · Get key at console.groq.com",
      },
      {
        label: "$(database) Local — Ollama (no API key needed)",
        description: "Runs entirely on your machine",
        detail: "Endpoint: http://localhost:11434/v1 · Install Ollama from ollama.com",
      },
      {
        label: "$(key) OpenAI / Anthropic / Other",
        description: "Configure any OpenAI-compatible endpoint",
        detail: "Enter your own endpoint URL and API key",
      },
      {
        label: "$(tools) LocalCoder Backend",
        description: "Use the bundled localcoder server (requires Bun)",
        detail: "Full agent with tools — reads, writes, runs commands in your project",
      },
    ];

    const pick = await vscode.window.showQuickPick(FREE_PROVIDERS, {
      title: "Welcome to LocalCoder — Choose your AI provider",
      placeHolder: "Free options are highlighted. You can change this later.",
      ignoreFocusOut: true,
    });

    if (!pick || pick.label.includes("Skip")) {
      await ctx.globalState.update("localcoder.hasSetup", true);
      await ctx.globalState.update("chatBackendConfig", { type: "localcoder" });
      return;
    }

    if (pick.label.includes("llama.cpp")) {
      await configureLlamaCpp(ctx);
      return;
    }

    if (pick.label.includes("LocalCoder Backend")) {
      await ctx.globalState.update("chatBackendConfig", { type: "localcoder" });
      await ctx.globalState.update("localcoder.hasSetup", true);
      vscode.window.showInformationMessage(
        "LocalCoder: using the bundled backend. Click the LocalCoder icon in the Activity Bar to start.",
      );
      return;
    }

    // For all other choices, switch to OpenAI-compatible backend
    type EndpointPreset = { endpoint: string; model: string };
    const presets: Record<string, EndpointPreset> = {
      "Gemini": { endpoint: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash" },
      "Groq":   { endpoint: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
      "Ollama": { endpoint: "http://localhost:11434/v1", model: "llama3" },
    };

    let endpoint = "";
    let model = "";
    let apiKey = "";

    const presetKey = Object.keys(presets).find((k) => pick.label.includes(k));
    if (presetKey) {
      endpoint = presets[presetKey].endpoint;
      model = presets[presetKey].model;
    }

    if (!endpoint) {
      const ep = await vscode.window.showInputBox({
        title: "LocalCoder — API Endpoint",
        prompt: "OpenAI-compatible base URL",
        placeHolder: "https://api.openai.com/v1",
        ignoreFocusOut: true,
      });
      if (!ep) { return; }
      endpoint = ep;
    }

    if (!model) {
      const m = await vscode.window.showInputBox({
        title: "LocalCoder — Model Name",
        prompt: "Model ID to use",
        placeHolder: "gpt-4o",
        ignoreFocusOut: true,
      });
      if (!m) { return; }
      model = m;
    }

    // Ollama doesn't need an API key
    if (!pick.label.includes("Ollama")) {
      const key = await vscode.window.showInputBox({
        title: "LocalCoder — API Key",
        prompt: pick.label.includes("Gemini")
          ? "Gemini API key (from aistudio.google.com)"
          : pick.label.includes("Groq")
          ? "Groq API key (from console.groq.com)"
          : "API key for your provider",
        password: true,
        ignoreFocusOut: true,
      });
      if (!key) { return; }
      apiKey = key;
    }

    // Persist the chosen config to globalState so the chat provider picks it up
    const config = {
      type: "openai" as const,
      openaiEndpoint: endpoint,
      openaiModel: model,
      openaiKey: apiKey || "ollama",
    };
    await ctx.globalState.update("chatBackendConfig", config);
    await ctx.globalState.update("localcoder.hasSetup", true);

    vscode.window.showInformationMessage(
      `LocalCoder: configured to use ${model} via ${endpoint}. Click the LocalCoder icon in the Activity Bar to start.`,
    );
  }

  // -------------------------------------------------------------------------

  async function openTerminal() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384;
    const terminal = vscode.window.createTerminal({
      name: TERMINAL_NAME,
      iconPath: {
        light: vscode.Uri.file(context.asAbsolutePath("images/button-dark.svg")),
        dark: vscode.Uri.file(context.asAbsolutePath("images/button-light.svg")),
      },
      location: { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      env: {
        _EXTENSION_LOCALCODER_PORT: port.toString(),
        LOCALCODER_CALLER: "vscode",
      },
    });

    terminal.show();
    const projectArg = workspaceFolder ? ` "${workspaceFolder}"` : "";
    terminal.sendText(`${cmd}${projectArg} --port ${port}`);

    const fileRef = getActiveFile();
    if (!fileRef) { return; }

    let tries = 10;
    let connected = false;
    do {
      await new Promise((resolve) => setTimeout(resolve, 200));
      try { await fetch(`http://localhost:${port}/app`); connected = true; break; } catch {}
      tries--;
    } while (tries > 0);

    if (connected) {
      await appendPrompt(port, `In ${fileRef}`, workspaceFolder);
      terminal.show();
    }
  }

  async function appendPrompt(port: number, text: string, directory?: string) {
    const url = new URL(`http://localhost:${port}/tui/append-prompt`);
    if (directory) { url.searchParams.set("directory", directory); }
    await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }

  function getActiveFile() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) { return; }
    const document = activeEditor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) { return; }
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    let filepathWithAt = `@${relativePath}`;
    const selection = activeEditor.selection;
    if (!selection.isEmpty) {
      const startLine = selection.start.line + 1;
      const endLine = selection.end.line + 1;
      filepathWithAt += startLine === endLine ? `#L${startLine}` : `#L${startLine}-${endLine}`;
    }
    return filepathWithAt;
  }
}

export function deactivate() {}
