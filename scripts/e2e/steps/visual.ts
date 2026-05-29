import path from "path"
import { ROOT } from "../lib/paths"
import { runCmdInherit } from "../lib/runner"

const BUN = process.execPath.match(/bun(\.exe)?$/i) ? process.execPath : "bun"

export async function stepVisualSmoke(): Promise<string> {
  if (process.env.E2E_SKIP_VISUAL === "1") {
    return "skipped (E2E_SKIP_VISUAL=1)"
  }
  const code = await runCmdInherit(BUN, ["run", "scripts/visual-test/run.ts", "--suite=tui,vscode"], {
    cwd: ROOT,
    env: {
      LOCALCODER_EXPERIMENTAL_EVENT_SYSTEM: "1",
    },
  })
  if (code !== 0) throw new Error(`visual-test smoke exited ${code}`)
  return "visual regression smoke passed (tui + vscode webview)"
}

export async function stepVisualStandard(): Promise<string> {
  if (process.env.E2E_SKIP_VISUAL === "1") {
    return "skipped (E2E_SKIP_VISUAL=1)"
  }
  const code = await runCmdInherit(BUN, ["run", "scripts/visual-test/run.ts", "--suite=tui,vscode,app"], {
    cwd: ROOT,
    env: {
      LOCALCODER_EXPERIMENTAL_EVENT_SYSTEM: "1",
    },
  })
  if (code !== 0) throw new Error(`visual-test standard exited ${code}`)
  return "visual regression passed (tui + vscode + app)"
}
