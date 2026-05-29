import { spawn } from "child_process"

export type E2eTier = "smoke" | "standard" | "full"

export type StepStatus = "pass" | "fail" | "skip"

export type StepResult = {
  id: string
  name: string
  status: StepStatus
  durationMs: number
  detail?: string
  error?: string
}

export type RunStep = () => Promise<string | void>

const started = Date.now()

export function elapsedSec(): string {
  return ((Date.now() - started) / 1000).toFixed(1)
}

export function log(prefix: string, msg: string) {
  console.log(`[e2e][${prefix}][${elapsedSec()}s] ${msg}`)
}

export function fail(prefix: string, msg: string): never {
  console.error(`[e2e][${prefix}][${elapsedSec()}s] FAIL: ${msg}`)
  process.exit(1)
}

export async function runCmd(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const useShell = process.platform === "win32" && /.(cmd|bat|ps1)$/i.test(cmd)
    const proc = spawn(cmd, args, {
      cwd: opts?.cwd,
      env: { ...process.env, ...opts?.env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: useShell,
    })
    let stdout = ""
    let stderr = ""
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString() })
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString() })
    let timer: ReturnType<typeof setTimeout> | undefined
    if (opts?.timeoutMs) {
      timer = setTimeout(() => {
        try { proc.kill() } catch {}
      }, opts.timeoutMs)
    }
    proc.on("error", reject)
    proc.on("close", (code) => {
      if (timer) clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

export async function runCmdInherit(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string> },
): Promise<number> {
  return new Promise((resolve, reject) => {
    const useShell = process.platform === "win32" && /.(cmd|bat|ps1)$/i.test(cmd)
    const proc = spawn(cmd, args, {
      cwd: opts?.cwd,
      env: { ...process.env, ...opts?.env },
      stdio: "inherit",
      shell: useShell,
    })
    proc.on("error", reject)
    proc.on("close", (code) => resolve(code ?? 1))
  })
}

export async function runStep(id: string, name: string, fn: RunStep, results: StepResult[]): Promise<void> {
  const t0 = Date.now()
  log(id, `START ${name}`)
  try {
    const detail = await fn()
    const result: StepResult = {
      id,
      name,
      status: "pass",
      durationMs: Date.now() - t0,
      detail: detail ?? undefined,
    }
    results.push(result)
    log(id, `PASS ${name}${detail ? ` — ${detail}` : ""} (${result.durationMs}ms)`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    results.push({
      id,
      name,
      status: "fail",
      durationMs: Date.now() - t0,
      error: message,
    })
    log(id, `FAIL ${name}: ${message}`)
    throw err
  }
}

export function skipStep(id: string, name: string, reason: string, results: StepResult[]) {
  results.push({ id, name, status: "skip", durationMs: 0, detail: reason })
  log(id, `SKIP ${name} — ${reason}`)
}

export function printReport(tier: E2eTier, results: StepResult[]) {
  const passed = results.filter((r) => r.status === "pass").length
  const failed = results.filter((r) => r.status === "fail").length
  const skipped = results.filter((r) => r.status === "skip").length
  console.log("\n" + "=".repeat(60))
  console.log(`E2E REPORT — tier=${tier}  pass=${passed}  fail=${failed}  skip=${skipped}  time=${elapsedSec()}s`)
  console.log("=".repeat(60))
  for (const r of results) {
    const mark = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "○"
    const extra = r.detail ?? r.error ?? ""
    console.log(`  ${mark} [${r.id}] ${r.name} (${r.durationMs}ms)${extra ? ` — ${extra}` : ""}`)
  }
  console.log("=".repeat(60))
}
