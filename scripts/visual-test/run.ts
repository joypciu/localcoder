#!/usr/bin/env bun
/**
 * Unified visual testing runner for LocalCoder UI surfaces.
 */
import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"
import { ARTIFACTS, DESKTOP_EXE, PKG, ROOT } from "./lib/paths"
import { writeReport, type VisualStep } from "./lib/report"

type Suite = "tui" | "vscode" | "app" | "desktop" | "all"

function parseArgs() {
  const update = process.argv.includes("--update") || process.env.VISUAL_UPDATE === "1"
  const suiteArg = process.argv.find((arg) => arg.startsWith("--suite="))
  const raw = suiteArg?.split("=")[1] ?? process.env.VISUAL_SUITE ?? "all"
  const suites =
    raw === "all"
      ? (["tui", "vscode", "app", "desktop"] as const)
      : (raw.split(",").map((s) => s.trim()).filter(Boolean) as Suite[])
  return { update, suites }
}

function resolveBun(): string {
  const exe = process.execPath
  if (/bun(\.exe)?$/i.test(exe)) return exe
  return "bun"
}

function runCommand(input: {
  suite: string
  name: string
  cwd: string
  cmd: string[]
  env?: Record<string, string>
}): VisualStep {
  const start = Date.now()
  const result = spawnSync(input.cmd[0], input.cmd.slice(1), {
    cwd: input.cwd,
    env: { ...process.env, ...input.env },
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  })

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()
  return {
    suite: input.suite,
    name: input.name,
    ok: result.status === 0,
    durationMs: Date.now() - start,
    message: result.status === 0 ? "passed" : output.slice(-4000) || `exit ${result.status}`,
  }
}

function stepTui(update: boolean): VisualStep {
  return runCommand({
    suite: "tui",
    name: "cli dialog char-frame snapshots",
    cwd: PKG,
    cmd: [resolveBun(), "test", "test/visual", "--timeout", "60000"],
    env: {
      VISUAL_UPDATE: update ? "1" : "0",
      LOCALCODER_EXPERIMENTAL_EVENT_SYSTEM: "1",
    },
  })
}

function stepPlaywright(input: { suite: string; name: string; config: string; update: boolean }): VisualStep {
  const config = path.join(ROOT, input.config)
  const appDir = path.join(ROOT, "packages", "app")
  return runCommand({
    suite: input.suite,
    name: input.name,
    cwd: appDir,
    cmd: ["bunx", "playwright", "test", "--config", config, ...(input.update ? ["--update-snapshots"] : [])],
    env: {
      CI: process.env.CI ?? "",
    },
  })
}

function stepDesktop(update: boolean): VisualStep {
  if (!fs.existsSync(DESKTOP_EXE)) {
    return {
      suite: "desktop",
      name: "electron cdp screenshot",
      ok: true,
      durationMs: 0,
      message: `skipped — missing ${DESKTOP_EXE}`,
    }
  }

  const result = runCommand({
    suite: "desktop",
    name: "electron cdp screenshot",
    cwd: ROOT,
    cmd: [resolveBun(), "run", "scripts/visual-test/suites/desktop/desktop.visual.ts", ...(update ? ["--update"] : [])],
  })

  if (!result.ok && result.message?.includes("skipped — desktop exe did not expose CDP")) {
    return { ...result, ok: true, message: result.message.split("\n")[0] }
  }

  return result
}

async function main() {
  const { update, suites } = parseArgs()
  const steps: VisualStep[] = []
  const selected = new Set(suites)

  if (selected.has("tui")) steps.push(stepTui(update))
  if (selected.has("vscode")) {
    steps.push(
      stepPlaywright({
        suite: "vscode",
        name: "chat webview screenshots",
        config: "packages/app/e2e/visual/playwright.vscode.config.ts",
        update,
      }),
    )
  }
  if (selected.has("app")) {
    steps.push(
      stepPlaywright({
        suite: "app",
        name: "web app screenshots",
        config: "packages/app/e2e/visual/playwright.app.config.ts",
        update,
      }),
    )
  }
  if (selected.has("desktop")) steps.push(stepDesktop(update))

  fs.mkdirSync(ARTIFACTS, { recursive: true })
  writeReport(steps, ARTIFACTS)

  const failed = steps.filter((s) => !s.ok)
  console.log(`\nVisual test report: ${path.join(ARTIFACTS, "report.html")}`)
  for (const step of steps) {
    console.log(`${step.ok ? "PASS" : "FAIL"} [${step.suite}] ${step.name} (${step.durationMs}ms)`)
    if (!step.ok && step.message) console.log(step.message)
  }

  if (failed.length > 0) {
    process.exitCode = 1
    console.error(`\n${failed.length} visual test step(s) failed`)
  } else {
    console.log(`\nAll ${steps.length} visual test step(s) passed`)
  }
}

await main()
