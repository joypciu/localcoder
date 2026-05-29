/**
 * Real E2E inside the VS Code extension host:
 * extension activate → openChat → LocalcoderBackend → llama.cpp (local GGUF) → tools → disk
 *
 * Run with:
 *   $env:VSCODE_LLAMA_E2E="1"; $env:LLAMACPP_API_URL="http://127.0.0.1:8080/v1"
 *   cd sdks/vscode && bun run test:llama-vscode
 */
import * as assert from "assert";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { ChatBackend } from "../../backends/types";
import {
  HAS_EXE,
  LIVE,
  LLAMA_API,
  hasCompletedTool,
  pollCompletedTools,
  probeLlamaServer,
  writeProjectConfig,
} from "../llamacpp-e2e-helpers";

const EXT_ID = "joypciu.localcoder";
const FIXTURE_WORKDIR = path.resolve(__dirname, "../../../test-fixtures/llama-e2e-workspace");

async function waitForBackend(api: ExtensionApi, timeoutMs = 60_000): Promise<ChatBackend> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const backend = api.getBackend();
    if (backend?.type === "localcoder") {
      return backend;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("LocalcoderBackend did not start via extension");
}

type ExtensionApi = {
  getBackend: () => ChatBackend | undefined;
  sendChat: (text: string) => Promise<void>;
  restartBackend: () => Promise<void>;
};

async function prepareWorkspace(modelId: string): Promise<string> {
  fs.mkdirSync(FIXTURE_WORKDIR, { recursive: true });
  const hello = path.join(FIXTURE_WORKDIR, "hello.py");
  if (fs.existsSync(hello)) {
    fs.unlinkSync(hello);
  }
  writeProjectConfig(FIXTURE_WORKDIR, modelId);
  try {
    cp.execSync("git init", { cwd: FIXTURE_WORKDIR, stdio: "ignore" });
    cp.execSync("git commit --allow-empty -m init", { cwd: FIXTURE_WORKDIR, stdio: "ignore" });
  } catch {
    /* optional */
  }
  return FIXTURE_WORKDIR;
}

async function ensureWorkspaceFolder(workDir: string): Promise<void> {
  const uri = vscode.Uri.file(workDir);
  const folders = vscode.workspace.workspaceFolders;
  const normalized = path.normalize(workDir).toLowerCase();
  if (
    folders?.length === 1 &&
    path.normalize(folders[0].uri.fsPath).toLowerCase() === normalized
  ) {
    return;
  }
  const ok = folders?.length
    ? vscode.workspace.updateWorkspaceFolders(0, folders.length, { uri, name: "llama-e2e" })
    : vscode.workspace.updateWorkspaceFolders(0, null, { uri, name: "llama-e2e" });
  assert.ok(ok, `failed to set workspace folder to ${workDir}`);
  await new Promise((r) => setTimeout(r, 1000));
}

suite("Extension host — llama.cpp provider E2E", function () {
  this.timeout(300_000);

  let workDir: string;
  let modelId: string;
  let pyFile: string;
  let backend: ChatBackend;
  let api: ExtensionApi;

  suiteSetup(async function () {
    if (!LIVE) {
      this.skip();
      return;
    }
    if (!HAS_EXE) {
      console.log("[ext-llamacpp] localcoder.exe not found — skipping");
      this.skip();
      return;
    }

    const llama = await probeLlamaServer();
    if (!llama) {
      console.log("[ext-llamacpp] llama-server not reachable — skipping");
      this.skip();
      return;
    }
    modelId = llama;
    console.log(`[ext-llamacpp] model: ${modelId}`);

    workDir = await prepareWorkspace(modelId);
    process.env.LLAMACPP_API_URL = LLAMA_API;
    await ensureWorkspaceFolder(workDir);

    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws) {
      console.log("[ext-llamacpp] no workspace folder — skipping (use test:llama-vscode label)");
      this.skip();
      return;
    }
    assert.strictEqual(
      path.normalize(ws).toLowerCase(),
      path.normalize(workDir).toLowerCase(),
      `workspace mismatch: ${ws} vs ${workDir}`,
    );

    const ext = vscode.extensions.getExtension(EXT_ID);
    assert.ok(ext, `extension ${EXT_ID} not found`);
    api = (await ext.activate()) as ExtensionApi;
    assert.ok(ext.isActive, "extension did not activate");
    assert.ok(typeof api.getBackend === "function", "extension API missing getBackend");

    const cmds = await vscode.commands.getCommands(true);
    assert.ok(cmds.includes("localcoder.openChat"), "localcoder.openChat not registered");

    await vscode.commands.executeCommand("localcoder.openChat");
    await new Promise((r) => setTimeout(r, 1500));
    backend = await waitForBackend(api);
    console.log(`[ext-llamacpp] extension backend=${backend.type}, workDir=${workDir}`);
  });

  suiteTeardown(() => {
    api?.getBackend()?.dispose();
  });

  test("extension activates with localcoder backend using llamacpp provider", async function () {
    if (!LIVE || !HAS_EXE || !backend) {
      this.skip();
      return;
    }

    assert.strictEqual(backend.type, "localcoder");

    const sessions = await backend.listSessions();
    assert.ok(Array.isArray(sessions), "listSessions should return an array");
    console.log("[ext-llamacpp] ✓ extension uses LocalcoderBackend with llama.cpp config");
  });

  test("chat via extension creates a Python file via write tool", async function () {
    if (!LIVE || !HAS_EXE || !backend || !api) {
      this.skip();
      return;
    }

    pyFile = path.join(workDir, "hello.py");
    const prompt =
      `IMPORTANT: You MUST call a tool. Do not describe what you will do — call the write tool immediately with these exact inputs:\n` +
      `filePath="${pyFile}"\n` +
      `content=\n` +
      `def greet(name: str) -> str:\n` +
      `    return f"Hello, {name}!"\n\n` +
      `Call the write tool RIGHT NOW. No explanation needed.`;

    await api.sendChat(prompt);

    const tools = await pollCompletedTools(backend, ["write"]);
    console.log(
      `[ext-llamacpp] write tools: ${tools.map((t) => `${t.name}:${t.status}`).join(",") || "(none)"}`,
    );

    assert.ok(fs.existsSync(pyFile), `${pyFile} not created on disk`);
    assert.ok(
      hasCompletedTool(tools, "write"),
      `expected write tool; got: ${tools.map((t) => `${t.name}:${t.status}`).join(",") || "none"}`,
    );

    const content = fs.readFileSync(pyFile, "utf-8");
    assert.ok(content.includes("def greet"), `greet function missing:\n${content}`);
    console.log("[ext-llamacpp] ✓ hello.py created via extension chat + write tool");
  });

  test("chat via extension edits the file via edit tool", async function () {
    if (!LIVE || !HAS_EXE || !backend || !api) {
      this.skip();
      return;
    }
    if (!pyFile || !fs.existsSync(pyFile)) {
      this.skip();
      return;
    }

    const before = fs.readFileSync(pyFile, "utf-8");
    const fnMatch = before.match(/def greet\([\s\S]*?return[^\n]+/);
    const oldString = fnMatch ? fnMatch[0] : before.trim();
    const newString = oldString.replace(
      /(def greet\([^\n]*\n)/,
      '$1    """Return a personalised greeting."""\n',
    );

    writeProjectConfig(workDir, modelId, {
      "*": "allow",
      write: "deny",
      session_search: "deny",
      list: "deny",
      grep: "deny",
      glob: "deny",
    });
    await api.restartBackend();
    backend = await waitForBackend(api);

    const editPrompt =
      `IMPORTANT: You MUST call tools. Do not describe what you will do.\n` +
      `The file "${pyFile}" contains:\n\n${before}\n\n` +
      `1. Call read on filePath="${pyFile}"\n` +
      `2. Call edit with filePath="${pyFile}", oldString=${JSON.stringify(oldString)}, newString=${JSON.stringify(newString)}\n` +
      `Call edit RIGHT NOW after read. No explanation.`;

    await api.sendChat(editPrompt);

    let tools = await pollCompletedTools(backend, ["edit"], 60_000);
    if (!hasCompletedTool(tools, "edit")) {
      console.log(
        `[ext-llamacpp] edit retry — first attempt: ${tools.map((t) => `${t.name}:${t.status}`).join(",") || "none"}`,
      );
      await api.sendChat(
        `Call edit NOW: filePath="${pyFile}", oldString=${JSON.stringify(oldString)}, newString=${JSON.stringify(newString)}. ONLY edit.`,
      );
      tools = await pollCompletedTools(backend, ["edit"], 60_000);
    }

    console.log(
      `[ext-llamacpp] edit tools: ${tools.map((t) => `${t.name}:${t.status}`).join(",") || "(none)"}`,
    );

    const after = fs.readFileSync(pyFile, "utf-8");
    const fileEdited =
      after.includes('"""') || after.includes("'''") || after.includes("Return a personalised");

    assert.ok(
      hasCompletedTool(tools, "edit") || fileEdited,
      `expected edit tool or file change; tools=${tools.map((t) => `${t.name}:${t.status}`).join(",") || "none"}`,
    );
    assert.ok(fileEdited, `docstring not found in:\n${after}`);
    assert.notStrictEqual(after, before, "file content unchanged after edit");
    console.log("[ext-llamacpp] ✓ docstring added via extension chat + edit tool");
  });

  test("extension session retains message history", async function () {
    if (!LIVE || !HAS_EXE || !backend) {
      this.skip();
      return;
    }

    const sessionId = backend.getActiveSessionId();
    assert.ok(sessionId, "active session id missing");

    const messages = await backend.loadMessages(sessionId);
    assert.ok(messages.length >= 2, `expected ≥2 messages, got ${messages.length}`);
    console.log(`[ext-llamacpp] ✓ session has ${messages.length} messages`);
  });
});
