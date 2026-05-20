#!/usr/bin/env bun
/**
 * LocalCoder + Qwopus live capability E2E (real tools, verified outcomes).
 *
 *   bun run scripts/agent-tool-real-e2e.ts
 *   LLAMACPP_SKIP_SERVER=1 bun run scripts/agent-tool-real-e2e.ts
 *   REAL_E2E_TASKS=4,5,7 bun run scripts/agent-tool-real-e2e.ts
 */
import { spawn, type ChildProcess } from "child_process"
import fs from "fs"
import path from "path"
import os from "os"

const ROOT = path.join(import.meta.dir, "..", "packages", "localcoder")
const LLAMA_DIR = process.env.LOCALCODER_LLAMACPP_DIR ?? "P:\\llama cpp\\llama-b9222-bin-win-cuda-13.1-x64"
const MODEL_PATH =
  process.env.LOCALCODER_LLAMACPP_MODEL ?? "P:\\gguf models\\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf"
const SERVER_EXE = path.join(LLAMA_DIR, "llama-server.exe")
const API_URL = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"
const PORT = Number(new URL(API_URL).port || 8080)
const CTX = Number(process.env.LLAMACPP_CTX ?? 16384)
const SKIP_SERVER = process.env.LLAMACPP_SKIP_SERVER === "1"
const LOAD_TIMEOUT_MS = Number(process.env.LLAMA_LOAD_TIMEOUT_MS ?? 300_000)
const TASK_TIMEOUT_MS = Number(process.env.AGENT_TASK_TIMEOUT_MS ?? 300_000)
const TASK_FILTER = process.env.REAL_E2E_TASKS?.split(",").map((s) => s.trim()).filter(Boolean)

const LLAMA_ARGS = [
  "-m", MODEL_PATH, "--host", "127.0.0.1", "--port", String(PORT), "-c", String(CTX),
  "--jinja", "--spec-type", "draft-mtp", "--spec-draft-n-max", "2",
]

type ToolEvent = { tool: string; status: string; output: string; error?: string }
type TaskCtx = { workdir: string; model: string }
type TaskDef = { id: string; name: string; run: (ctx: TaskCtx) => Promise<void> }

function log(msg: string) {
  console.log(`[real-e2e] ${new Date().toISOString().slice(11, 19)} ${msg}`)
}

async function probe(): Promise<string | undefined> {
  try {
    const res = await fetch(`${API_URL}/models`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return undefined
    const data = (await res.json()) as { data?: Array<{ id: string }> }
    return data.data?.[0]?.id
  } catch {
    return undefined
  }
}

async function waitForServer(timeoutMs = LOAD_TIMEOUT_MS) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const id = await probe()
    if (id) return id
    await Bun.sleep(2000)
  }
  throw new Error("llama-server not ready in time")
}

function parseToolEvents(stdout: string): ToolEvent[] {
  const out: ToolEvent[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const evt = JSON.parse(line) as {
        type?: string
        part?: { tool?: string; state?: { status?: string; output?: string; error?: string } }
      }
      if (evt.type !== "tool_use" || !evt.part?.tool || !evt.part.state) continue
      const s = evt.part.state
      out.push({
        tool: evt.part.tool,
        status: s.status ?? "unknown",
        output: typeof s.output === "string" ? s.output : "",
        error: s.error,
      })
    } catch {}
  }
  return out
}

function assertTool(events: ToolEvent[], name: string, check?: (e: ToolEvent) => void) {
  const hit = events.filter((e) => e.tool === name && e.status === "completed")
  if (hit.length === 0) {
    const tried = events.filter((e) => e.tool === name)
    throw new Error(
      `expected completed ${name}; got: ${tried.map((e) => `${e.status}${e.error ? ":" + e.error : ""}`).join(", ") || "none"}`,
    )
  }
  if (check) for (const e of hit) check(e)
}

async function runAgent(prompt: string, workdir: string, model: string) {
  const configPath = path.join(workdir, "localcoder.json")
  await Bun.write(
    configPath,
    JSON.stringify(
      {
        $schema: "https://localcoder.ai/config.json",
        model: `llamacpp/${model}`,
        provider: {
          llamacpp: {
            npm: "@ai-sdk/openai-compatible",
            options: { baseURL: API_URL, apiKey: "not-needed" },
            models: {
              [model]: {
                id: model,
                name: model,
                tool_call: true,
                temperature: true,
                limit: { context: CTX, output: 4096 },
              },
            },
          },
        },
        permission: {
          webfetch: "allow",
          edit: "allow",
          bash: "allow",
          grep: "allow",
          glob: "allow",
          read: "allow",
          list: "allow",
        },
      },
      null,
      2,
    ),
  )

  const args = [
    "./src/index.ts", "run", "--dir", workdir, "--model", `llamacpp/${model}`,
    "--agent", "build", "--format", "json", "--dangerously-skip-permissions", prompt,
  ]

  log(`prompt: ${prompt.slice(0, 140).replace(/\s+/g, " ")}...`)
  const proc = Bun.spawn([process.execPath, "run", "--conditions=browser", ...args], {
    cwd: ROOT,
    env: { ...process.env, LLAMACPP_API_URL: API_URL },
    stdout: "pipe",
    stderr: "pipe",
  })

  const timer = setTimeout(() => {
    try { proc.kill() } catch {}
  }, TASK_TIMEOUT_MS)

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  clearTimeout(timer)
  const code = await proc.exited
  if (code !== 0) {
    console.error(stderr.slice(-4000))
    throw new Error(`localcoder run exited ${code}`)
  }
  return { stdout, stderr, events: parseToolEvents(stdout) }
}

async function seedWorkdir(workdir: string) {
  await Bun.write(path.join(workdir, "broken_sum.py"), "def add(a, b):\n    return a - b\n\nif __name__ == '__main__':\n    print(add(2, 3))\n")
  await Bun.write(path.join(workdir, "notes.txt"), "project=e2e-capability-test\nsecret_token=E2E_SECRET_99\n")
  await Bun.write(path.join(workdir, "e2e_marker.py"), 'print("REAL_E2E_MARKER_42")\n')
}

const TASKS: TaskDef[] = [
  {
    id: "1",
    name: "webfetch httpbin JSON",
    async run({ workdir, model }) {
      const url = "https://httpbin.org/json"
      const run = await runAgent(
        `Use webfetch format text on ${url}. Must call webfetch. Reply TASK1_OK.`,
        workdir,
        model,
      )
      assertTool(run.events, "webfetch", (e) => {
        if (!/slideshow|httpbin/i.test(e.output)) throw new Error(`missing slideshow: ${e.output.slice(0, 200)}`)
      })
      log("PASS [1] webfetch")
    },
  },
  {
    id: "2",
    name: "write + bash run script",
    async run({ workdir, model }) {
      const scriptPath = path.join(workdir, "e2e_marker.py")
      const run = await runAgent(
        `write ${scriptPath} with: print("REAL_E2E_MARKER_42")\n` +
          `bash: python ${scriptPath}\nMust use write and bash. TASK2_OK.`,
        workdir,
        model,
      )
      assertTool(run.events, "write")
      assertTool(run.events, "bash", (e) => {
        if (!/REAL_E2E_MARKER_42/.test(e.output)) throw new Error(`bash missing marker: ${e.output.slice(0, 200)}`)
      })
      const content = await Bun.file(scriptPath).text()
      if (!content.includes("REAL_E2E_MARKER_42")) throw new Error("file content wrong")
      log("PASS [2] write+bash")
    },
  },
  {
    id: "3",
    name: "list directory",
    async run({ workdir, model }) {
      const run = await runAgent(
        `list tool on ${workdir} non-recursive. Confirm e2e_marker.py listed. TASK3_OK.`,
        workdir,
        model,
      )
      assertTool(run.events, "list", (e) => {
        if (!/e2e_marker\.py/i.test(e.output)) throw new Error(`list missing file: ${e.output.slice(0, 300)}`)
      })
      log("PASS [3] list")
    },
  },
  {
    id: "4",
    name: "read file contents",
    async run({ workdir, model }) {
      const fp = path.join(workdir, "e2e_marker.py")
      const run = await runAgent(
        `Use read on ${fp}. Confirm output contains REAL_E2E_MARKER_42. Must use read tool. TASK4_OK.`,
        workdir,
        model,
      )
      assertTool(run.events, "read", (e) => {
        if (!/REAL_E2E_MARKER_42/.test(e.output)) throw new Error(`read missing marker: ${e.output.slice(0, 300)}`)
      })
      log("PASS [4] read")
    },
  },
  {
    id: "5",
    name: "grep search pattern",
    async run({ workdir, model }) {
      const run = await runAgent(
        `Use the grep tool (not bash): pattern REAL_E2E_MARKER_42, path ${workdir}, include "*.py". ` +
          `Do not use read or bash. TASK5_OK.`,
        workdir,
        model,
      )
      assertTool(run.events, "grep", (e) => {
        if (!/REAL_E2E_MARKER_42|e2e_marker/i.test(e.output)) {
          throw new Error(`grep miss: ${e.output.slice(0, 300)}`)
        }
      })
      log("PASS [5] grep")
    },
  },
  {
    id: "6",
    name: "glob find py files",
    async run({ workdir, model }) {
      const run = await runAgent(
        `Use glob pattern *.py in ${workdir}. Must find e2e_marker.py. Use glob tool. TASK6_OK.`,
        workdir,
        model,
      )
      assertTool(run.events, "glob", (e) => {
        if (!/e2e_marker\.py/i.test(e.output)) throw new Error(`glob miss: ${e.output.slice(0, 300)}`)
      })
      log("PASS [6] glob")
    },
  },
  {
    id: "7",
    name: "edit fix bug + verify",
    async run({ workdir, model }) {
      const fp = path.join(workdir, "broken_sum.py")
      const run = await runAgent(
        `File ${fp} has bug: add(2,3) prints -1. Use edit to fix so add returns a+b. ` +
          `Then bash: python ${fp} — must print 5. Use edit and bash. TASK7_OK.`,
        workdir,
        model,
      )
      assertTool(run.events, "edit")
      assertTool(run.events, "bash", (e) => {
        if (!/\b5\b/.test(e.output)) throw new Error(`expected 5: ${e.output.slice(0, 200)}`)
      })
      const out = await Bun.spawn(["python", fp], { cwd: workdir, stdout: "pipe" }).stdout.text()
      if (!out.trim().includes("5")) throw new Error(`direct run got: ${out}`)
      log("PASS [7] edit+bash fix bug")
    },
  },
  {
    id: "8",
    name: "grep secret in notes.txt",
    async run({ workdir, model }) {
      const run = await runAgent(
        `grep E2E_SECRET_99 in ${workdir} notes.txt. Must use grep. TASK8_OK.`,
        workdir,
        model,
      )
      assertTool(run.events, "grep", (e) => {
        if (!/E2E_SECRET_99/.test(e.output)) throw new Error(`secret not found: ${e.output.slice(0, 200)}`)
      })
      log("PASS [8] grep secret")
    },
  },
  {
    id: "9",
    name: "multi-step fibonacci script",
    async run({ workdir, model }) {
      const fp = path.join(workdir, "fib_e2e.py")
      const run = await runAgent(
        `Create ${fp} with a function fib(n) returning nth fibonacci (fib(10)=55). ` +
          `Use write, then bash: python ${fp} to print fib(10). Must print 55. TASK9_OK.`,
        workdir,
        model,
      )
      assertTool(run.events, "write")
      assertTool(run.events, "bash", (e) => {
        if (!/\b55\b/.test(e.output)) throw new Error(`fib output: ${e.output.slice(0, 200)}`)
      })
      if (await Bun.file(fp).exists()) {
        const direct = await Bun.spawn(["python", fp], { cwd: workdir, stdout: "pipe" }).stdout.text()
        if (!/\b55\b/.test(direct)) throw new Error(`direct fib: ${direct}`)
      }
      log("PASS [9] multi-step fib")
    },
  },
  {
    id: "10",
    name: "webfetch uuid endpoint",
    async run({ workdir, model }) {
      const url = "https://httpbin.org/uuid"
      const run = await runAgent(
        `webfetch format text ${url}. Extract uuid from response. Reply with uuid only prefix TASK10_OK.`,
        workdir,
        model,
      )
      assertTool(run.events, "webfetch", (e) => {
        if (!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(e.output)) {
          throw new Error(`no uuid in output: ${e.output.slice(0, 250)}`)
        }
      })
      log("PASS [10] webfetch uuid")
    },
  },
]

function tasksToRun(): TaskDef[] {
  if (!TASK_FILTER?.length) return TASKS
  const set = new Set(TASK_FILTER)
  const picked = TASKS.filter((t) => set.has(t.id) || set.has(t.name))
  if (picked.length === 0) throw new Error(`no tasks match REAL_E2E_TASKS=${process.env.REAL_E2E_TASKS}`)
  return picked
}

async function main() {
  const t0 = Date.now()
  if (!fs.existsSync(SERVER_EXE)) throw new Error(`missing ${SERVER_EXE}`)
  if (!fs.existsSync(MODEL_PATH)) throw new Error(`missing ${MODEL_PATH}`)

  const selected = tasksToRun()
  log(`model: ${path.basename(MODEL_PATH)} tasks=${selected.map((t) => t.id).join(",")} ctx=${CTX}`)

  let server: ChildProcess | undefined
  let started = false
  const existing = await probe()
  if (existing) {
    log(`reuse server model=${existing}`)
  } else if (SKIP_SERVER) {
    throw new Error("LLAMACPP_SKIP_SERVER=1 but server not reachable")
  } else {
    log("starting llama-server...")
    server = spawn(SERVER_EXE, LLAMA_ARGS, { cwd: LLAMA_DIR, stdio: ["ignore", "pipe", "pipe"] })
    started = true
    server.stderr?.on("data", (d) => {
      const s = d.toString()
      if (/listening on|error|fail|cuda|load/i.test(s)) process.stderr.write(d)
    })
  }

  const cleanup = () => {
    if (started && server) {
      try { spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore" }) } catch {}
    }
  }
  process.on("exit", cleanup)
  process.on("SIGINT", () => { cleanup(); process.exit(130) })

  const workdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "localcoder-real-e2e-"))
  log(`workdir: ${workdir}`)
  const passed: string[] = []
  const failed: { id: string; name: string; error: string }[] = []

  try {
    const modelId = existing ?? (await waitForServer())
    log(`server ready in ${((Date.now() - t0) / 1000).toFixed(1)}s model=${modelId}`)
    await seedWorkdir(workdir)
    const ctx: TaskCtx = { workdir, model: modelId }

    for (const task of selected) {
      const t1 = Date.now()
      log(`--- task ${task.id}: ${task.name} ---`)
      try {
        await task.run(ctx)
        passed.push(task.id)
        log(`task ${task.id} done in ${((Date.now() - t1) / 1000).toFixed(1)}s`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        failed.push({ id: task.id, name: task.name, error: msg })
        log(`FAIL task ${task.id}: ${msg}`)
        if (process.env.REAL_E2E_FAIL_FAST === "1") break
      }
    }

    log("")
    log(`SUMMARY: ${passed.length}/${selected.length} passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    for (const id of passed) log(`  OK  [${id}]`)
    for (const f of failed) log(`  FAIL [${f.id}] ${f.name}: ${f.error}`)

    if (failed.length > 0) {
      throw new Error(`${failed.length} task(s) failed: ${failed.map((f) => f.id).join(", ")}`)
    }
  } finally {
    cleanup()
  }
}

main().catch((err) => {
  console.error("[real-e2e] FAILED:", err)
  process.exit(1)
})
