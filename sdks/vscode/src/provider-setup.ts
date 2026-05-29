import * as vscode from "vscode";
import * as cp from "child_process";
import { resolveLocalcoderExe } from "./llama-setup";

export type CloudProviderPreset = {
  id: string;
  label: string;
  description: string;
  envVar?: string;
  defaultModel?: string;
};

export const CLOUD_PROVIDER_PRESETS: CloudProviderPreset[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "200+ models via one API key",
    envVar: "OPENROUTER_API_KEY",
    defaultModel: "openrouter/anthropic/claude-sonnet-4",
  },
  {
    id: "opencode-go",
    label: "OpenCode Go",
    description: "Fast cloud coding models",
    envVar: "OPENCODE_API_KEY",
    defaultModel: "opencode-go/deepseek-v4-flash",
  },
  {
    id: "fireworks-ai",
    label: "Fireworks AI",
    description: "Fast inference for open models",
    envVar: "FIREWORKS_API_KEY",
    defaultModel: "fireworks-ai/deepseek-v4-flash",
  },
  {
    id: "groq",
    label: "Groq",
    description: "Free tier · very fast",
    envVar: "GROQ_API_KEY",
    defaultModel: "groq/llama-3.3-70b-versatile",
  },
];

function spawnCli(exe: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = cp.spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) { resolve(); return; }
      reject(new Error(out.trim() || `localcoder exited ${code}`));
    });
  });
}

/** Save a provider API key via CLI — no manual config editing. */
export async function saveProviderApiKey(providerId: string, apiKey: string): Promise<void> {
  const exe = await resolveLocalcoderExe();
  if (!exe) {
    throw new Error("LocalCoder CLI not found. Build packages/localcoder first.");
  }
  await spawnCli(exe, ["auth", "set-api", "--provider", providerId, "--key", apiKey]);
}

export async function configureCloudProvider(preset: CloudProviderPreset): Promise<boolean> {
  const key = await vscode.window.showInputBox({
    title: `LocalCoder — ${preset.label} API Key`,
    prompt: preset.envVar
      ? `Your key is stored locally (~/.localcoder/auth.json). Env: ${preset.envVar}`
      : "Your key is stored locally (~/.localcoder/auth.json)",
    password: true,
    ignoreFocusOut: true,
    validateInput: (v) => (v?.trim() ? undefined : "API key is required"),
  });
  if (!key?.trim()) { return false; }

  try {
    await saveProviderApiKey(preset.id, key.trim());
  } catch (err) {
    void vscode.window.showErrorMessage(
      `Failed to save ${preset.label} key: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }

  void vscode.window.showInformationMessage(
    `${preset.label} configured. Use the LocalCoder backend and pick a ${preset.label} model in chat.`,
  );
  return true;
}

export async function pickAndConfigureCloudProvider(): Promise<boolean> {
  const pick = await vscode.window.showQuickPick(
    CLOUD_PROVIDER_PRESETS.map((p) => ({
      label: p.label,
      description: p.description,
      preset: p,
    })),
    {
      title: "Connect a cloud provider",
      placeHolder: "OpenRouter, OpenCode Go, Fireworks, Groq…",
    },
  );
  if (!pick) { return false; }
  return configureCloudProvider(pick.preset);
}
