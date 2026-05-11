#!/usr/bin/env bun
/**
 * Rewrite all commits: joypciu <usmanjoycse@gmail.com>, strip AI Co-authored-by trailers.
 * Usage: bun scripts/git/rewrite-authors.ts [--dry-run]
 */
import { spawnSync } from "node:child_process"

const DRY = process.argv.includes("--dry-run")
const AUTHOR = { name: "joypciu", email: "usmanjoycse@gmail.com" }
/** Strip any Co-Authored-By trailer (Cursor, Claude, Copilot, etc.). */
const CO_AUTHOR = /^Co-Authored-By:\s*/im

function git(...args: string[]) {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || `git ${args.join(" ")} failed`)
  return r.stdout ?? ""
}

function stripCoAuthors(message: string) {
  const normalized = message.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const lines = normalized.split("\n")
  const kept = lines.filter((line) => !CO_AUTHOR.test(line))
  let out = kept.join("\n")
  if (normalized.endsWith("\n") && !out.endsWith("\n")) out += "\n"
  return out
}

function show(sha: string, format: string) {
  return git("show", "-s", `--format=${format}`, sha).trimEnd()
}

function parentsOf(sha: string): string[] {
  const out = git("rev-parse", `${sha}^@`).trim()
  return out ? out.split("\n").filter(Boolean) : []
}

function main() {
  const refs = git("for-each-ref", "--format=%(refname)")
    .trim()
    .split("\n")
    .filter((r) => r.startsWith("refs/heads/") || r.startsWith("refs/tags/"))

  // Main branch only — avoids orphan commits from filter-branch leftovers.
  const shas = git("rev-list", "main").trim().split("\n").filter(Boolean)
  const order = [...shas].reverse()

  const map = new Map<string, string>()
  let changed = 0

  for (const old of order) {
    const tree = git("rev-parse", `${old}^{tree}`).trim()
    const parentShas = parentsOf(old)
    const parents = parentShas.map((p) => {
      const mapped = map.get(p)
      if (!mapped) throw new Error(`parent ${p.slice(0, 7)} not rewritten before ${old.slice(0, 7)}`)
      return mapped
    })
    const parentsChanged = parentShas.some((p, i) => p !== parents[i])
    const message = show(old, "%B")
    const newMessage = stripCoAuthors(message)

    const oldAuthor = { name: show(old, "%an"), email: show(old, "%ae") }
    const oldCommitter = { name: show(old, "%cn"), email: show(old, "%ce") }
    const authorDate = show(old, "%aI")
    const committerDate = show(old, "%cI")

    const authorChanged =
      oldAuthor.name !== AUTHOR.name ||
      oldAuthor.email !== AUTHOR.email ||
      oldCommitter.name !== AUTHOR.name ||
      oldCommitter.email !== AUTHOR.email
    const normalizedMessage = message.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const messageChanged = newMessage !== normalizedMessage

    if (!authorChanged && !messageChanged && !parentsChanged) {
      map.set(old, old)
      continue
    }
    changed++

    if (DRY) {
      console.log(
        `rewrite ${old.slice(0, 7)} author=${authorChanged} msg=${messageChanged} (${oldAuthor.name} -> ${AUTHOR.name})`,
      )
      map.set(old, old)
      continue
    }

    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: AUTHOR.name,
      GIT_AUTHOR_EMAIL: AUTHOR.email,
      GIT_COMMITTER_NAME: AUTHOR.name,
      GIT_COMMITTER_EMAIL: AUTHOR.email,
      GIT_AUTHOR_DATE: authorDate,
      GIT_COMMITTER_DATE: committerDate,
    }

    const args = ["commit-tree", tree, ...parents.flatMap((p) => ["-p", p]), "-F", "-"]
    const r = spawnSync("git", args, {
      encoding: "utf8",
      input: newMessage,
      env: env as NodeJS.ProcessEnv,
    })
    if (r.status !== 0) throw new Error(r.stderr || "commit-tree failed")
    map.set(old, r.stdout.trim())
  }

  if (DRY) {
    console.log(`Would rewrite ${changed} of ${order.length} commits`)
    return
  }

  for (const ref of refs) {
    const old = git("rev-parse", ref).trim()
    const neu = map.get(old)
    if (neu && neu !== old) {
      git("update-ref", ref, neu)
      console.log(`updated ${ref}: ${old.slice(0, 7)} -> ${neu.slice(0, 7)}`)
    }
  }

  console.log(`Rewrote ${changed} commits; ${refs.length} refs checked`)
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
