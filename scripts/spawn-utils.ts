import type { Subprocess } from "bun"

/** Drain stdout/stderr while waiting — avoids pipe deadlock when child writes heavily. */
export async function waitForProcess(proc: Subprocess, timeoutMs: number) {
  const stdoutPromise = proc.stdout ? new Response(proc.stdout).text() : Promise.resolve("")
  const stderrPromise = proc.stderr ? new Response(proc.stderr).text() : Promise.resolve("")
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    try {
      proc.kill()
    } catch {}
  }, timeoutMs)
  const code = await proc.exited
  clearTimeout(timer)
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])
  return { stdout, stderr, code, timedOut }
}
