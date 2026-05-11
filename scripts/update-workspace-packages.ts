#!/usr/bin/env bun
/** Run `bun update --latest` in each workspace package (fast, per-package). */
import { spawnSync } from "node:child_process"
import { readdirSync, statSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const dirs = new Set<string>()

function addDir(dir: string) {
  try {
    if (statSync(path.join(dir, "package.json")).isFile()) dirs.add(dir)
  } catch {
    /* no package.json */
  }
}

for (const name of readdirSync(path.join(root, "packages"))) {
  const p = path.join(root, "packages", name)
  if (!statSync(p).isDirectory()) continue
  if (name === "console") {
    for (const sub of readdirSync(p)) {
      const sp = path.join(p, sub)
      if (statSync(sp).isDirectory()) addDir(sp)
    }
    continue
  }
  addDir(p)
}
addDir(path.join(root, "packages", "sdk", "js"))
addDir(path.join(root, "sdks", "vscode"))

for (const dir of [...dirs].sort()) {
  const rel = path.relative(root, dir)
  const r = spawnSync("bun", ["update", "--latest"], { cwd: dir, encoding: "utf8", shell: true })
  const ok = r.status === 0 ? "ok" : "fail"
  console.log(`${ok} ${rel}`)
  if (r.status !== 0 && r.stderr) console.error(r.stderr.slice(0, 200))
}

console.log("done")
