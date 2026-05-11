import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { resolveLocalcoderExe } from "./llama-setup";

export type LocalcoderCliLaunch = {
  /** Full line to send to the terminal (quoted paths on Windows). */
  line: string;
  /** Human-readable mode for logs. */
  mode: "exe" | "bun-dev";
};

function quote(arg: string) {
  if (!/[\s"]/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function resolveBun(): string {
  const cfg = vscode.workspace.getConfiguration("localcoder");
  const configured = cfg.get<string>("bunPath");
  if (configured && fs.existsSync(configured)) {
    return configured;
  }
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const candidates = [
    path.join(process.env.APPDATA || "", "npm", "node_modules", "bun", "bin", "bun.exe"),
    path.join(home, ".bun", "bin", "bun.exe"),
    "bun.exe",
    "bun",
  ];
  for (const c of candidates) {
    if (c && (c === "bun" || fs.existsSync(c))) {
      return c;
    }
  }
  return "bun";
}

/** Default interactive CLI (not TUI) for VS Code terminal and docs. */
export async function resolveLocalcoderCliLaunch(
  extensionPath: string,
  projectDir?: string,
): Promise<LocalcoderCliLaunch> {
  const exe = await resolveLocalcoderExe();
  const project = projectDir ? ` ${quote(projectDir)}` : "";
  if (exe) {
    return { line: `${quote(exe)}${project}`, mode: "exe" };
  }

  const cfg = vscode.workspace.getConfiguration("localcoder");
  const configured = cfg.get<string>("packagePath");
  const localcoderDir = configured
    ? path.resolve(configured)
    : path.resolve(extensionPath, "..", "..", "packages", "localcoder");
  const src = path.join(localcoderDir, "src", "index.ts");
  if (!fs.existsSync(src)) {
    throw new Error(
      "LocalCoder CLI not found. Install with npm install -g localcoder, set localcoder.packagePath, or build packages/localcoder (bun run build:win).",
    );
  }
  const bun = resolveBun();
  return {
    line: `${quote(bun)} run --cwd ${quote(localcoderDir)} --conditions=browser ${quote("src/index.ts")}${project}`,
    mode: "bun-dev",
  };
}
