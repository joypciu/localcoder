#!/usr/bin/env bun
/** Bump workspaces.catalog entries to latest npm versions (skips git URL pins). */
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const pkgPath = path.join(root, "package.json")
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
  workspaces: { catalog: Record<string, string> }
}

/** Packages that must stay on a prerelease line (npm "latest" is an older major). */
const PRERELEASE: Record<string, string> = {
  effect: "4.0.0-beta",
  "@effect/opentelemetry": "4.0.0-beta",
  "@effect/platform-node": "4.0.0-beta",
  "drizzle-orm": "1.0.0-beta",
  "drizzle-kit": "1.0.0-beta",
}

function latest(name: string): string | undefined {
  const tag = PRERELEASE[name]
  // `npm view pkg@tag version` — not `npm view pkg version --json tag` (that ignores the tag).
  const args = tag ? ["view", `${name}@${tag}`, "version"] : ["view", name, "version"]
  const r = spawnSync("npm", args, {
    encoding: "utf8",
    cwd: root,
    shell: process.platform === "win32",
  })
  if (r.status !== 0) {
    console.warn(`skip ${name}: ${(r.stderr || r.stdout || "").trim()}`)
    return undefined
  }
  const out = (r.stdout || "").trim()
  try {
    const parsed = JSON.parse(out) as string | string[]
    return Array.isArray(parsed) ? parsed.at(-1) : parsed
  } catch {
    return out.split(/\r?\n/).filter(Boolean).at(-1)
  }
}

const catalog = pkg.workspaces.catalog
let bumped = 0
for (const [name, version] of Object.entries(catalog)) {
  if (/^https?:\/\//.test(version)) {
    console.log(`keep ${name} @ ${version}`)
    continue
  }
  const next = latest(name)
  if (!next || next === version) continue
  console.log(`${name}: ${version} -> ${next}`)
  catalog[name] = next
  bumped++
}

writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + "\n", "utf8")
console.log(`\nUpdated ${bumped} catalog entries in package.json`)
