import fs from "fs"
import path from "path"

export type SnapshotResult = {
  name: string
  ok: boolean
  updated: boolean
  message?: string
  diffPath?: string
}

function normalizeText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .trimEnd()
}

function diffLines(expected: string, actual: string): string {
  const exp = expected.split("\n")
  const act = actual.split("\n")
  const max = Math.max(exp.length, act.length)
  const lines: string[] = []

  for (let i = 0; i < max; i++) {
    const e = exp[i] ?? "<missing>"
    const a = act[i] ?? "<missing>"
    if (e !== a) lines.push(`L${i + 1}:\n  - ${e}\n  + ${a}`)
  }

  return lines.join("\n")
}

export function assertTextSnapshot(input: {
  name: string
  actual: string
  dir: string
  update?: boolean
}): SnapshotResult {
  const file = path.join(input.dir, `${input.name}.txt`)
  const actual = normalizeText(input.actual)

  fs.mkdirSync(input.dir, { recursive: true })

  if (input.update || !fs.existsSync(file)) {
    fs.writeFileSync(file, `${actual}\n`, "utf8")
    return { name: input.name, ok: true, updated: true, message: input.update ? "updated baseline" : "created baseline" }
  }

  const expected = normalizeText(fs.readFileSync(file, "utf8"))
  if (expected === actual) {
    return { name: input.name, ok: true, updated: false }
  }

  const diffPath = path.join(input.dir, `${input.name}.diff.txt`)
  fs.writeFileSync(diffPath, diffLines(expected, actual), "utf8")
  return {
    name: input.name,
    ok: false,
    updated: false,
    message: "text snapshot mismatch",
    diffPath,
  }
}

export async function assertPngSnapshot(input: {
  name: string
  actual: Buffer
  dir: string
  update?: boolean
}): Promise<SnapshotResult> {
  const file = path.join(input.dir, `${input.name}.png`)
  fs.mkdirSync(input.dir, { recursive: true })

  if (input.update || !fs.existsSync(file)) {
    fs.writeFileSync(file, input.actual)
    return { name: input.name, ok: true, updated: true, message: input.update ? "updated baseline" : "created baseline" }
  }

  const expected = fs.readFileSync(file)
  if (expected.equals(input.actual)) {
    return { name: input.name, ok: true, updated: false }
  }

  const actualPath = path.join(input.dir, `${input.name}.actual.png`)
  fs.writeFileSync(actualPath, input.actual)
  return {
    name: input.name,
    ok: false,
    updated: false,
    message: "png snapshot mismatch",
    diffPath: actualPath,
  }
}
