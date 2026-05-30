import { spawnSync, type SpawnSyncReturns } from "child_process"
import fs from "fs"
import path from "path"
import { Installation } from "@/installation"

export type CliLaunch =
  | { kind: "bun"; bun: string; entry: string; cwd: string }
  | { kind: "exe"; bin: string }

function isBunExec(execPath: string) {
  return /bun(\.exe)?$/i.test(execPath) || execPath.toLowerCase().includes("bun")
}

function packageRootFromEntry(entry: string): string | undefined {
  let dir = path.dirname(path.resolve(entry))
  for (let i = 0; i < 8; i++) {
    const pkg = path.join(dir, "package.json")
    if (fs.existsSync(pkg)) {
      try {
        const raw = JSON.parse(fs.readFileSync(pkg, "utf-8")) as { name?: string }
        if (raw.name === "localcoder") return dir
      } catch {
        // continue
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

function entryFromArgv(): string | undefined {
  for (const arg of process.argv.slice(1)) {
    if (!arg || arg.startsWith("-")) continue
    const resolved = path.resolve(arg)
    if (/index\.ts$/i.test(resolved) && fs.existsSync(resolved)) return resolved
  }
  return undefined
}

function distExeCandidates(): string[] {
  const roots = new Set<string>()
  roots.add(process.cwd())
  const entry = entryFromArgv()
  if (entry) {
    const root = packageRootFromEntry(entry)
    if (root) roots.add(root)
  }
  return [...roots].map((r) =>
    path.join(r, "dist", "localcoder-windows-x64", "bin", process.platform === "win32" ? "localcoder.exe" : "localcoder"),
  )
}

function pathLocalcoderCandidates(): string[] {
  const cmd = process.platform === "win32" ? "where" : "which"
  const found = spawnSync(cmd, ["localcoder"], { encoding: "utf-8", shell: true })
  if (found.status !== 0) return []
  return found.stdout
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

/** True when this path is a working CLI (skip broken global npm stubs). */
function isRunnableCli(bin: string): boolean {
  if (!bin || !fs.existsSync(bin)) return false
  const lower = bin.toLowerCase()
  if (lower.endsWith(".exe")) return true
  if (lower.endsWith(".cjs") || lower.endsWith(".js")) return true
  // npm .cmd on Windows — require target cjs beside package
  if (lower.endsWith(".cmd") || lower.endsWith(".ps1")) {
    const npmRoot = path.join(path.dirname(bin), "..", "node_modules", "localcoder", "bin", "localcoder.cjs")
    return fs.existsSync(path.normalize(npmRoot))
  }
  return true
}

/** Prefer the same CLI the user already started (bun dev), then built exe, then a valid PATH install. */
export function resolveCliLaunch(): CliLaunch {
  const exec = process.execPath

  if (isBunExec(exec) || Installation.isLocal()) {
    const entry = entryFromArgv() ?? path.join(process.cwd(), "src", "index.ts")
    const cwd = packageRootFromEntry(entry) ?? process.cwd()
    const entryRel = fs.existsSync(entry)
      ? path.relative(cwd, entry).split(path.sep).join("/") || "src/index.ts"
      : "src/index.ts"
    return { kind: "bun", bun: exec, entry: entryRel.startsWith(".") ? entryRel : `./${entryRel}`, cwd }
  }

  if (/localcoder/i.test(exec) && isRunnableCli(exec)) {
    return { kind: "exe", bin: exec }
  }

  for (const candidate of distExeCandidates()) {
    if (fs.existsSync(candidate)) return { kind: "exe", bin: candidate }
  }

  for (const candidate of pathLocalcoderCandidates()) {
    if (isRunnableCli(candidate)) return { kind: "exe", bin: candidate }
  }

  const fallbackEntry = path.join(process.cwd(), "src", "index.ts")
  const cwd = packageRootFromEntry(fallbackEntry) ?? process.cwd()
  return {
    kind: "bun",
    bun: isBunExec(exec) ? exec : "bun",
    entry: "./src/index.ts",
    cwd,
  }
}

export function runLocalcoderCli(
  args: string[],
  options?: { stdio?: "inherit" | "pipe"; maxBuffer?: number },
): SpawnSyncReturns<string> {
  const launch = resolveCliLaunch()
  const stdio = options?.stdio ?? "inherit"
  const maxBuffer = options?.maxBuffer

  if (launch.kind === "bun") {
    return spawnSync(launch.bun, ["--conditions=browser", launch.entry, ...args], {
      cwd: launch.cwd,
      encoding: "utf-8",
      stdio,
      shell: false,
      maxBuffer,
    })
  }

  return spawnSync(launch.bin, args, {
    encoding: "utf-8",
    stdio,
    shell: false,
    maxBuffer,
  })
}
