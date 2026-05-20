import * as assert from "assert";
import * as cp from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as net from "net";
import * as os from "os";
import * as path from "path";

const SKIP = process.env.VSCODE_E2E_SKIP_LIVE === "1";
const PKG = path.resolve(__dirname, "../../../../../packages/localcoder");
const WIN_EXE = path.join(PKG, "dist", "localcoder-windows-x64", "bin", "localcoder.exe");
const HAS_EXE = process.platform === "win32" && fs.existsSync(WIN_EXE);
const HAS_PKG = fs.existsSync(path.join(PKG, "src", "index.ts"));
const HAS_BACKEND = HAS_EXE || HAS_PKG;

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
    s.on("error", reject);
  });
}

function resolveBun(): string {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const c = [
    path.join(process.env.APPDATA || "", "npm", "node_modules", "bun", "bin", "bun.exe"),
    path.join(home, ".bun", "bin", "bun.exe"),
    "bun",
  ];
  for (const p of c) { if (p && (p === "bun" || fs.existsSync(p))) { return p; } }
  return "bun";
}

suite("Localcoder backend live (HTTP)", function () {
  this.timeout(120_000);

  let port: number;
  let password: string;
  let proc: cp.ChildProcess | undefined;

  suiteSetup(async function () {
    if (SKIP || !HAS_BACKEND) { this.skip(); return; }
    port = await findFreePort();
    password = crypto.randomBytes(16).toString("hex");
    const serveArgs = ["serve", "--port", String(port), "--hostname", "127.0.0.1", "--cors"];
    if (HAS_EXE) {
      proc = cp.spawn(WIN_EXE, serveArgs, {
        env: { ...process.env, LOCALCODER_SERVER_PASSWORD: password, LOCALCODER_CALLER: "vscode-e2e" },
        stdio: "ignore",
      });
    } else {
      const bun = resolveBun();
      proc = cp.spawn(bun, ["run", "--cwd", PKG, "--conditions=browser", "src/index.ts", ...serveArgs], {
        cwd: PKG,
        env: { ...process.env, LOCALCODER_SERVER_PASSWORD: password, LOCALCODER_CALLER: "vscode-e2e" },
        stdio: "ignore",
      });
    }
    const auth = Buffer.from(`localcoder:${password}`).toString("base64");
    const headers = { Authorization: `Basic ${auth}` };
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/global/health`, { headers });
        if (r.ok) { return; }
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("server not ready");
  });

  suiteTeardown(() => {
    proc?.kill();
  });

  test("health endpoint returns healthy", async function () {
    if (SKIP || !HAS_BACKEND) { this.skip(); return; }
    const auth = Buffer.from(`localcoder:${password}`).toString("base64");
    const r = await fetch(`http://127.0.0.1:${port}/global/health`, { headers: { Authorization: `Basic ${auth}` } });
    const j = (await r.json()) as { healthy?: boolean };
    assert.strictEqual(j.healthy, true);
  });

  test("create session and list sessions", async function () {
    if (SKIP || !HAS_BACKEND) { this.skip(); return; }
    const auth = Buffer.from(`localcoder:${password}`).toString("base64");
    const headers = { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };
    const tmpDir = path.join(os.tmpdir(), "lc-vscode-e2e");
    fs.mkdirSync(tmpDir, { recursive: true });
    const dirHdr = { ...headers, "x-localcoder-directory": tmpDir };
    const cr = await fetch(`http://127.0.0.1:${port}/session?directory=${encodeURIComponent(tmpDir)}`, { method: "POST", headers: dirHdr, body: JSON.stringify({ title: "e2e test" }) });
    assert.ok(cr.ok);
    const created = (await cr.json()) as { id?: string; sessionID?: string };
    const sid = created.id || created.sessionID;
    assert.ok(sid);
    const lr = await fetch(`http://127.0.0.1:${port}/api/session?directory=${encodeURIComponent(tmpDir)}`, { headers: dirHdr });
    assert.ok(lr.ok);
  });

  test("SSE global/event connects", async function () {
    if (SKIP || !HAS_BACKEND) { this.skip(); return; }
    const auth = Buffer.from(`localcoder:${password}`).toString("base64");
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 3000);
    const r = await fetch(`http://127.0.0.1:${port}/global/event`, {
      headers: { Authorization: `Basic ${auth}`, Accept: "text/event-stream" },
      signal: ac.signal,
    });
    assert.ok(r.ok);
    const reader = r.body?.getReader();
    if (reader) {
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value || new Uint8Array());
      assert.ok(text.includes("data:"));
      reader.cancel();
    }
  });
});



