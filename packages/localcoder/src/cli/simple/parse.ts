import path from "path"
import { pathToFileURL } from "url"
import { Filesystem } from "@/util/filesystem"
import type { localcoderClient } from "@localcoder-ai/sdk/v2"

export type ParsedInput =
  | { kind: "empty" }
  | { kind: "slash"; command: string; args: string }
  | { kind: "shell"; command: string }
  | { kind: "prompt"; text: string; files: FilePart[] }

export type FilePart = { type: "file"; url: string; filename: string; mime: string }

const AT_REF = /@([^\s@]+)/g

export function parseLine(line: string): Omit<ParsedInput, "files"> & { raw: string } {
  const trimmed = line.trim()
  if (!trimmed) return { kind: "empty", raw: line }
  if (trimmed.startsWith("/")) {
    const body = trimmed.slice(1)
    const space = body.indexOf(" ")
    const command = (space === -1 ? body : body.slice(0, space)).toLowerCase()
    const args = space === -1 ? "" : body.slice(space + 1).trim()
    return { kind: "slash", command, args, raw: line }
  }
  if (trimmed.startsWith("!")) {
    return { kind: "shell", command: trimmed.slice(1).trim(), raw: line }
  }
  return { kind: "prompt", text: trimmed, raw: line }
}

export async function resolveFileParts(sdk: localcoderClient, text: string): Promise<FilePart[]> {
  const parts: FilePart[] = []
  const seen = new Set<string>()
  const matches = [...text.matchAll(AT_REF)]

  for (const match of matches) {
    const query = match[1]
    if (!query || seen.has(query)) continue

    let resolved: string | undefined
    const direct = path.resolve(process.cwd(), query)
    if (await Filesystem.exists(direct)) {
      resolved = direct
    } else {
      const found = await sdk.find.files({ query })
      const hit = found.data?.[0]
      if (hit) resolved = path.resolve(process.cwd(), hit.replace(/\/$/, ""))
    }

    if (!resolved || seen.has(resolved)) continue
    seen.add(resolved)
    seen.add(query)

    const mime = (await Filesystem.isDir(resolved)) ? "application/x-directory" : "text/plain"
    parts.push({
      type: "file",
      url: pathToFileURL(resolved).href,
      filename: path.basename(resolved),
      mime,
    })
  }

  return parts
}

export function stripAtRefs(text: string): string {
  return text.replace(AT_REF, " ").replace(/\s+/g, " ").trim()
}
