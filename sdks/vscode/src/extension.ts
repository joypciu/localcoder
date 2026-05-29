import * as vscode from "vscode";
import * as path from "path";
import { ChatPanelProvider, ChatSidebarProvider, chatProviderRef } from "./chat-panel";
import { registerInlineActions } from "./inline-actions";
import { runLlamaSetupWizard } from "./llama-setup";
import { configureCloudProvider, pickAndConfigureCloudProvider, CLOUD_PROVIDER_PRESETS } from "./provider-setup";

async function configureLlamaCpp(ctx: vscode.ExtensionContext): Promise<boolean> {
  const ok = await runLlamaSetupWizard();
  if (!ok) { return false; }
  await ctx.globalState.update("chatBackendConfig", { type: "localcoder" });
  await ctx.globalState.update("localcoder.hasSetup", true);
  return true;
}

const TERMINAL_NAME = "localcoder";

export async function activate(context: vscode.ExtensionContext) {
  const localcoderDir = path.resolve(context.extensionPath, "..", "..", "packages", "localcoder");
  const cmd = `bun run --cwd "${localcoderDir}" --conditions=browser src/index.ts`;

  // Sidebar chat (Activity Bar icon) — primary entry point
  registerInlineActions(context);
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
    vscode.commands.registerCommand("localcoder.setupLlamaCpp", async () => {
      await configureLlamaCpp(context);
      await chatProviderRef?.restartBackend();
    }),
    vscode.commands.registerCommand("localcoder.connectProvider", async () => {
      const ok = await pickAndConfigureCloudProvider();
      if (ok) {
        await context.globalState.update("chatBackendConfig", { type: "localcoder" });
        await context.globalState.update("localcoder.hasSetup", true);
        await chatProviderRef?.restartBackend();
      }
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
    if (process.env.VSCODE_LLAMA_E2E === "1") {
      await context.globalState.update("localcoder.hasSetup", true);
      await context.globalState.update("chatBackendConfig", { type: "localcoder" });
    } else {
      void showFirstRunSetup(context);
    }
  }

  // -------------------------------------------------------------------------

  async function showFirstRunSetup(ctx: vscode.ExtensionContext) {
    const FREE_PROVIDERS: vscode.QuickPickItem[] = [
      {
        label: "$(close) Skip for now",
        description: "No provider yet — configure later in Settings (gear icon)",
      },
      {
        label: "$(server) Local — llama.cpp (GGUF on your GPU)",
        description: "Pick any llama.cpp folder + any .gguf model — we start the server for you",
        detail: "No terminal commands or config files needed",
      },
      {
        label: "$(cloud) Cloud — OpenRouter",
        description: "200+ models · one API key",
        detail: "openrouter.ai/keys",
      },
      {
        label: "$(cloud) Cloud — OpenCode Go",
        description: "Fast coding models",
        detail: "Uses OPENCODE_API_KEY",
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
        label: "$(tools) LocalCoder Backend (all providers)",
        description: "Full agent with tools — use CLI models after connecting keys",
        detail: "Connect OpenRouter, OpenCode Go, llama.cpp, etc. from Settings",
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

    if (pick.label.includes("OpenRouter")) {
      const preset = CLOUD_PROVIDER_PRESETS.find((p) => p.id === "openrouter")!;
      if (await configureCloudProvider(preset)) {
        await ctx.globalState.update("chatBackendConfig", { type: "localcoder" });
        await ctx.globalState.update("localcoder.hasSetup", true);
      }
      return;
    }

    if (pick.label.includes("OpenCode Go")) {
      const preset = CLOUD_PROVIDER_PRESETS.find((p) => p.id === "opencode-go")!;
      if (await configureCloudProvider(preset)) {
        await ctx.globalState.update("chatBackendConfig", { type: "localcoder" });
        await ctx.globalState.update("localcoder.hasSetup", true);
      }
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
      openaiKey: apiKey ? "***" : undefined,
    };
    await ctx.globalState.update("chatBackendConfig", config);
    await ctx.globalState.update("localcoder.hasSetup", true);
    if (apiKey && apiKey !== "ollama") {
      await ctx.secrets.store("localcoder.openaiKey", apiKey);
    }

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

  return {
    getBackend: () => chatProviderRef?.getBackend(),
    sendChat: (text: string) => chatProviderRef?.commandSendText(text) ?? Promise.resolve(),
    restartBackend: () => chatProviderRef?.restartBackend() ?? Promise.resolve(),
  };
}

export function deactivate() {}
