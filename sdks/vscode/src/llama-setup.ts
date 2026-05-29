import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as cp from "child_process";
import * as os from "os";

export type LlamaSetupOptions = {
  ctx?: number;
  thinking?: boolean;
};

export type LlamaStatus = {
  llamaDir?: string;
  modelPath?: string;
  ctx?: number;
  thinking?: boolean;
  thinkingSupported?: boolean;
  discoveredModels?: string[];
};

const CONTEXT_PRESETS = [4096, 8192, 16384, 32768, 65536, 131072];

function modelSupportsThinking(modelPath: string) {
  const base = path.basename(modelPath).toLowerCase();
  return /qwopus|qwen3(?:\.5|-)/i.test(base);
}

export async function resolveLocalcoderExe(): Promise<string | undefined> {
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

async function readLlamaStatus(exe: string): Promise<LlamaStatus | undefined> {
  return new Promise((resolve) => {
    const proc = cp.spawn(exe, ["llamacpp", "status"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", () => {
      try {
        resolve(JSON.parse(out) as LlamaStatus);
      } catch {
        resolve(undefined);
      }
    });
    proc.on("error", () => resolve(undefined));
  });
}

function spawnSetup(
  exe: string,
  args: string[],
  title: string,
): Promise<void> {
  return Promise.resolve(vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: false },
    () => new Promise<void>((resolve, reject) => {
      const proc = cp.spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      proc.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
      proc.stderr?.on("data", (d: Buffer) => { out += d.toString(); });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) { resolve(); return; }
        reject(new Error(out.trim() || `llamacpp setup exited ${code}`));
      });
    }),
  ));
}

async function pickContext(defaultCtx = 16384): Promise<number | undefined> {
  const items: vscode.QuickPickItem[] = CONTEXT_PRESETS.map((n) => ({
    label: String(n),
    description: n === defaultCtx ? "saved default" : undefined,
  }));
  items.push({ label: "Custom…", description: "Enter a custom context size" });
  const pick = await vscode.window.showQuickPick(items, {
    title: "Context size (tokens)",
    placeHolder: `Default: ${defaultCtx}`,
  });
  if (!pick) { return undefined; }
  if (pick.label === "Custom…") {
    const custom = await vscode.window.showInputBox({
      title: "Custom context size",
      prompt: "Number of context tokens (e.g. 16384)",
      value: String(defaultCtx),
      validateInput: (v) => {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 512) { return "Enter an integer ≥ 512"; }
        return undefined;
      },
    });
    return custom ? Number(custom) : undefined;
  }
  return Number(pick.label);
}

async function pickModel(initialDir?: vscode.Uri, discovered: string[] = []): Promise<string | undefined> {
  if (discovered.length > 0) {
    const items: vscode.QuickPickItem[] = discovered.map((p) => ({
      label: path.basename(p),
      description: p,
    }));
    items.push({ label: "$(folder-opened) Browse for another GGUF…", alwaysShow: true });
    const pick = await vscode.window.showQuickPick(items, {
      title: "Select GGUF model",
      placeHolder: "Any .gguf file on your machine",
    });
    if (!pick) { return undefined; }
    if (!pick.description || pick.label.startsWith("$(folder")) {
      // fall through to file picker
    } else {
      return pick.description;
    }
  }

  const modelUri = await vscode.window.showOpenDialog({
    title: "Select GGUF model file",
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { "GGUF models": ["gguf"] },
    defaultUri: initialDir,
  });
  return modelUri?.[0]?.fsPath;
}

/** Guided llama.cpp setup — user picks folder + GGUF + context; LocalCoder handles the rest. */
export async function runLlamaSetupWizard(): Promise<boolean> {
  const exe = await resolveLocalcoderExe();
  if (!exe) {
    void vscode.window.showErrorMessage(
      "LocalCoder CLI not found. Build packages/localcoder or set localcoder.packagePath.",
    );
    return false;
  }

  const status = await readLlamaStatus(exe);
  const savedDir = status?.llamaDir;
  const defaultDir = savedDir && fs.existsSync(savedDir) ? savedDir : os.homedir();

  const dirUri = await vscode.window.showOpenDialog({
    title: "Select llama.cpp folder (contains llama-server)",
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Select folder",
    defaultUri: vscode.Uri.file(defaultDir),
  });
  if (!dirUri?.[0]) { return false; }

  const llamaDir = dirUri[0].fsPath;
  const serverExe = path.join(llamaDir, process.platform === "win32" ? "llama-server.exe" : "llama-server");
  if (!fs.existsSync(serverExe)) {
    void vscode.window.showErrorMessage(`llama-server not found in ${llamaDir}`);
    return false;
  }

  const modelPath = await pickModel(dirUri[0], status?.discoveredModels ?? []);
  if (!modelPath) { return false; }

  const ctx = await pickContext(status?.ctx ?? 16384);
  if (!ctx) { return false; }

  let thinking: boolean | undefined;
  if (modelSupportsThinking(modelPath)) {
    const mode = await vscode.window.showQuickPick(
      [
        { label: "Thinking enabled", description: "Recommended for Qwen / Qwopus coder models", picked: true },
        { label: "Thinking disabled", description: "Faster, no reasoning blocks" },
      ],
      { title: "Reasoning / thinking mode", placeHolder: "Choose thinking mode" },
    );
    if (!mode) { return false; }
    thinking = mode.label.includes("enabled");
  }

  const args = ["llamacpp", "setup", "--dir", llamaDir, "--model", modelPath, "--ctx", String(ctx)];
  if (thinking !== undefined) { args.push("--thinking", thinking ? "true" : "false"); }

  try {
    await spawnSetup(exe, args, "Setting up llama.cpp (first load may take a few minutes)…");
  } catch (err) {
    void vscode.window.showErrorMessage(`llama.cpp setup failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }

  void vscode.window.showInformationMessage(
    `LocalCoder: llama.cpp is ready (${path.basename(modelPath)}, ctx ${ctx}).`,
  );
  return true;
}
