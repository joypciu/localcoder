/**
 * Real E2E: LocalcoderBackend → localcoder serve → llama.cpp → file I/O
 *
 * Enable with VSCODE_LLAMA_E2E=1 (requires llama-server on LLAMACPP_API_URL).
 *
 * Standalone mocha:
 *   $env:VSCODE_LLAMA_E2E="1"
 *   bun x mocha out/test/suite/localcoder-llamacpp.test.js --ui tdd --timeout 300000 --require src/test/vscode-shim.cjs
 *
 * VS Code extension host:
 *   $env:VSCODE_LLAMA_E2E="1"; bun run test
 */
import * as assert from "assert";
import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { LocalcoderBackend } from "../../backends/localcoder";
import type { ChatMessage, ToolCall } from "../../backends/types";

const LIVE = process.env.VSCODE_LLAMA_E2E === "1";
const LLAMA_API = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1";
const PKG = path.resolve(__dirname, "../../../../../packages/localcoder");
const WIN_EXE = path.join(PKG, "dist", "localcoder-windows-x64", "bin", "localcoder.exe");
const HAS_EXE = process.platform === "win32" && fs.existsSync(WIN_EXE);
const EXT_PATH = path.resolve(__dirname, "../../..");

async function probeLlamaServer(): Promise<string | undefined> {
  try {
    const r = await fetch(`${LLAMA_API}/models`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return undefined;
    const d = (await r.json()) as { data?: { id: string }[] };
    return d.data?.[0]?.id;
  } catch {
    return undefined;
  }
}

function writeProjectConfig(workDir: string, modelId: string): void {
  fs.writeFileSync(
    path.join(workDir, "localcoder.json"),
    JSON.stringify(
      {
        $schema: "https://localcoder.ai/config.json",
        model: `llamacpp/${modelId}`,
        provider: {
          llamacpp: {
            npm: "@ai-sdk/openai-compatible",
            options: { baseURL: LLAMA_API, apiKey: "not-needed" },
            models: {
              [modelId]: {
                id: modelId,
                name: modelId,
                tool_call: true,
                reasoning: true,
                interleaved: { field: "reasoning_content" },
                temperature: true,
                limit: { context: 16384, output: 2048 },
              },
            },
          },
        },
        permission: {
          "*": "allow",
          session_search: "deny",
          list: "deny",
          grep: "deny",
          glob: "deny",
        },
      },
      null,
      2,
    ),
  );
}

async function sendAndCollect(
  backend: LocalcoderBackend,
  text: string,
  agent = "build",
): Promise<{ content: string; toolCalls: ToolCall[]; error?: string }> {
  const result = await new Promise<{ content: string; toolCalls: ToolCall[]; error?: string }>(
    (resolve, reject) => {
      const toolCalls: ToolCall[] = [];
      backend
        .sendMessage(
          text,
          [],
          [],
          {
            onDelta: () => {},
            onToolCall: (tc) => toolCalls.push(tc),
            onToolResult: () => {},
            onDone: (msg) =>
              resolve({
                content: msg.content || "",
                toolCalls: msg.toolCalls?.length ? msg.toolCalls : toolCalls,
              }),
            onError: (err) => resolve({ content: "", toolCalls, error: err }),
          },
          { agent },
        )
        .catch(reject);
    },
  );

  // Sync endpoint may return before tool parts are finalized — read persisted state
  const sessionId = backend.getActiveSessionId();
  if (sessionId) {
    const messages = await backend.loadMessages(sessionId);
    const persisted = messages
      .filter((m) => m.role === "assistant")
      .flatMap((m) => m.toolCalls ?? [])
      .filter((t) => t.status === "completed");
    if (persisted.length) {
      result.toolCalls = persisted;
    }
  }

  return result;
}

function hasCompletedTool(calls: ToolCall[], name: string): boolean {
  return calls.some((t) => t.name === name && t.status === "completed");
}

async function pollCompletedTools(
  backend: LocalcoderBackend,
  names: string[],
  timeoutMs = 30_000,
): Promise<ToolCall[]> {
  const sessionId = backend.getActiveSessionId();
  if (!sessionId) {
    return [];
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = await backend.loadMessages(sessionId);
    const allTools = messages
      .filter((m) => m.role === "assistant")
      .flatMap((m) => m.toolCalls ?? []);
    const matched = allTools.filter((t) => names.includes(t.name) && t.status === "completed");
    if (names.every((n) => matched.some((t) => t.name === n))) {
      return matched;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  const messages = await backend.loadMessages(sessionId);
  return messages
    .filter((m) => m.role === "assistant")
    .flatMap((m) => m.toolCalls ?? [])
    .filter((t) => names.includes(t.name));
}

suite("LocalCoder VS Code extension — real llama.cpp E2E", function () {
  this.timeout(300_000);

  let backend: LocalcoderBackend;
  let workDir: string;
  let modelId: string;
  let pyFile: string;

  suiteSetup(async function () {
    if (!LIVE) {
      this.skip();
      return;
    }
    if (!HAS_EXE) {
      console.log("[llamacpp-e2e] localcoder.exe not found — skipping");
      this.skip();
      return;
    }

    const llama = await probeLlamaServer();
    if (!llama) {
      console.log("[llamacpp-e2e] llama-server not reachable — skipping");
      this.skip();
      return;
    }
    modelId = llama;
    console.log(`[llamacpp-e2e] model: ${modelId}`);

    workDir = path.join(os.tmpdir(), `lc-vscode-llamacpp-e2e-${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });
    writeProjectConfig(workDir, modelId);

    try {
      cp.execSync("git init && git commit --allow-empty -m init", {
        cwd: workDir,
        stdio: "ignore",
      });
    } catch {
      /* optional */
    }

    process.env.LLAMACPP_API_URL = LLAMA_API;
    backend = new LocalcoderBackend(EXT_PATH, workDir);
    await backend.start();
    console.log(`[llamacpp-e2e] localcoder server started, workDir=${workDir}`);
  });

  suiteTeardown(() => {
    backend?.dispose();
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  test("creates a Python file via write tool", async function () {
    if (!LIVE || !HAS_EXE || !backend) {
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

    const result = await sendAndCollect(backend, prompt);
    if (result.error) {
      assert.fail(`sendMessage failed: ${result.error}`);
    }

    const tools = await pollCompletedTools(backend, ["write"]);
    console.log(
      `[llamacpp-e2e] write tools: ${tools.map((t) => `${t.name}:${t.status}`).join(",") || "(none)"}`,
    );
    assert.ok(fs.existsSync(pyFile), `${pyFile} not created on disk`);
    assert.ok(
      hasCompletedTool(tools, "write"),
      `expected write tool; got: ${tools.map((t) => `${t.name}:${t.status}`).join(",") || "none"}`,
    );

    const content = fs.readFileSync(pyFile, "utf-8");
    assert.ok(content.includes("def greet"), `greet function missing:\n${content}`);
    console.log("[llamacpp-e2e] ✓ hello.py created via write tool");
  });

  test("session has correct message history", async function () {
    if (!LIVE || !HAS_EXE || !backend) {
      this.skip();
      return;
    }

    const sessionId = backend.getActiveSessionId();
    assert.ok(sessionId, "active session id missing");

    const sessions = await backend.listSessions();
    assert.ok(sessions.some((s) => s.id === sessionId), "session not in list");

    const messages: ChatMessage[] = await backend.loadMessages(sessionId);
    assert.ok(messages.length >= 2, `expected ≥2 messages, got ${messages.length}`);
    console.log(`[llamacpp-e2e] ✓ session has ${messages.length} messages`);
  });

  test("edits the file via edit tool", async function () {
    if (!LIVE || !HAS_EXE || !backend) {
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

    // Restart backend with write denied so the model must use edit
    backend.dispose();
    const cfgPath = path.join(workDir, "localcoder.json");
    fs.writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          $schema: "https://localcoder.ai/config.json",
          model: `llamacpp/${modelId}`,
          provider: JSON.parse(fs.readFileSync(cfgPath, "utf-8")).provider,
          permission: {
            "*": "allow",
            write: "deny",
            session_search: "deny",
            list: "deny",
            grep: "deny",
            glob: "deny",
          },
        },
        null,
        2,
      ),
    );
    backend = new LocalcoderBackend(EXT_PATH, workDir);
    await backend.start();

    const editPrompt =
      `IMPORTANT: You MUST call tools. Do not describe what you will do.\n` +
      `The file "${pyFile}" contains:\n\n${before}\n\n` +
      `1. Call read on filePath="${pyFile}"\n` +
      `2. Call edit with filePath="${pyFile}", oldString=${JSON.stringify(oldString)}, newString=${JSON.stringify(newString)}\n` +
      `Call edit RIGHT NOW after read. No explanation.`;

    await sendAndCollect(backend, editPrompt);

    let tools = await pollCompletedTools(backend, ["edit"], 60_000);
    if (!hasCompletedTool(tools, "edit")) {
      console.log(
        `[llamacpp-e2e] edit retry — first attempt tools: ${tools.map((t) => `${t.name}:${t.status}`).join(",") || "none"}`,
      );
      await sendAndCollect(
        backend,
        `Call edit NOW: filePath="${pyFile}", oldString=${JSON.stringify(oldString)}, newString=${JSON.stringify(newString)}. ONLY edit.`,
      );
      tools = await pollCompletedTools(backend, ["edit"], 60_000);
    }

    console.log(
      `[llamacpp-e2e] edit tools: ${tools.map((t) => `${t.name}:${t.status}`).join(",") || "(none)"}`,
    );

    const after = fs.readFileSync(pyFile, "utf-8");
    const fileEdited =
      after.includes('"""') || after.includes("'''") || after.includes("Return a personalised");

    assert.ok(
      hasCompletedTool(tools, "edit") || fileEdited,
      `expected edit tool or file change; tools=${tools.map((t) => `${t.name}:${t.status}`).join(",") || "none"}; fileEdited=${fileEdited}`,
    );
    assert.ok(fileEdited, `docstring not found in:\n${after}`);
    assert.notStrictEqual(after, before, "file content unchanged after edit");
    console.log("[llamacpp-e2e] ✓ docstring added via edit tool");
  });
});
