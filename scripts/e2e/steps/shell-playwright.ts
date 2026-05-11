import path from "path"
import { ROOT, resolveBun } from "../lib/paths"
import { runCmdInherit } from "../lib/runner"

const BUN = resolveBun()
const SHELL = path.join(ROOT, "packages", "desktop-shell")

export async function stepPlaywrightShell(): Promise<string> {
  if (process.env.E2E_SKIP_SHELL_PLAYWRIGHT === "1") {
    return "skipped (E2E_SKIP_SHELL_PLAYWRIGHT=1)"
  }
  await runCmdInherit(BUN, ["run", "test:e2e:install"], { cwd: SHELL }).catch(() => 0)
  const code = await runCmdInherit(BUN, ["run", "test:e2e"], { cwd: SHELL })
  if (code !== 0) throw new Error(`desktop-shell playwright exited ${code}`)
  return "shell UI playwright passed"
}
