import { UI } from "@/cli/ui"
import type { localcoderClient } from "@localcoder-ai/sdk/v2"
import { Locale } from "@/util/locale"
import { searchSessions, type SessionSearchHit } from "@/session/search"
import type { ReplContext } from "./context"
import { shortSession } from "./context"
import { previewText } from "./display"
import { applySessionMeterToContext } from "./session-meter"

export type SessionRow = {
  id: string
  title: string
  timeUpdated: number
}

export async function fetchSessionRows(
  sdk: localcoderClient,
  directory: string,
  limit = 30,
): Promise<SessionRow[]> {
  const list = await sdk.session.list({ directory })
  const rows = list.data ?? []
  return rows
    .map((s) => ({
      id: s.id,
      title: s.title ?? "(untitled)",
      timeUpdated: s.time.updated,
    }))
    .sort((a, b) => b.timeUpdated - a.timeUpdated)
    .slice(0, limit)
}

export function resolveSessionRef(ref: string, rows: SessionRow[]): SessionRow | undefined {
  const q = ref.trim()
  if (!q) return undefined
  const exact = rows.find((s) => s.id === q)
  if (exact) return exact
  const matches = rows.filter((s) => s.id.startsWith(q) || s.id.includes(q))
  if (matches.length === 1) return matches[0]
  return undefined
}

export function printSessionTable(rows: SessionRow[], activeID?: string, numbered = false) {
  if (rows.length === 0) {
    UI.println(UI.Style.TEXT_DIM + "  (no sessions in this project)" + UI.Style.TEXT_NORMAL)
    return
  }
  UI.println(
    UI.Style.TEXT_DIM +
      (numbered ? "  #  " : "     ") +
      "Session".padEnd(28) +
      "  Updated".padEnd(14) +
      "  Title" +
      UI.Style.TEXT_NORMAL,
  )
  rows.forEach((s, i) => {
    const active = s.id === activeID
    const mark = active ? UI.Style.TEXT_SUCCESS + "*" + UI.Style.TEXT_NORMAL : " "
    const num = numbered ? UI.Style.TEXT_DIM + `${String(i + 1).padStart(2)}.` + UI.Style.TEXT_NORMAL + " " : "    "
    const id = UI.Style.TEXT_HIGHLIGHT + shortSession(s.id) + UI.Style.TEXT_NORMAL
    const when = UI.Style.TEXT_DIM + Locale.todayTimeOrDateTime(s.timeUpdated) + UI.Style.TEXT_NORMAL
    const title = previewText(s.title, 36)
    UI.println(`  ${mark}${num}${id}  ${when}  ${title}`)
  })
  if (activeID) {
    UI.println(UI.Style.TEXT_DIM + `  * = active (${shortSession(activeID)})` + UI.Style.TEXT_NORMAL)
  }
}

export async function showCurrentSession(sdk: localcoderClient, ctx: ReplContext) {
  if (!ctx.sessionID) {
    UI.println(UI.Style.TEXT_WARNING + "No active session — use /new or /session to pick one." + UI.Style.TEXT_NORMAL)
    return
  }
  const got = await sdk.session.get({ sessionID: ctx.sessionID, directory: ctx.directory }).catch(() => undefined)
  const info = got?.data
  UI.println(UI.Style.TEXT_INFO_BOLD + "Active session" + UI.Style.TEXT_NORMAL)
  UI.println(`  id:     ${ctx.sessionID}`)
  UI.println(`  title:  ${info?.title ?? "(unknown)"}`)
  if (info?.time?.updated) {
    UI.println(`  updated: ${Locale.datetime(info.time.updated)}`)
  }
  if (ctx.meterShort) UI.println(`  context: ${ctx.meterShort}`)
  UI.empty()
}

export async function activateSession(sdk: localcoderClient, ctx: ReplContext, sessionID: string) {
  ctx.sessionID = sessionID
  ctx.continueSession = true
  await applySessionMeterToContext(sdk, ctx)
}

export async function pickSessionInteractive(
  sdk: localcoderClient,
  ctx: ReplContext,
  ask: (prompt: string) => Promise<string>,
  opts?: { message?: string; includeNew?: boolean },
): Promise<string | undefined> {
  const rows = await fetchSessionRows(sdk, ctx.directory, 25)
  UI.empty()
  UI.println(UI.Style.TEXT_INFO_BOLD + (opts?.message ?? "Switch session") + UI.Style.TEXT_NORMAL)
  printSessionTable(rows, ctx.sessionID, true)
  UI.empty()
  UI.println(UI.Style.TEXT_DIM + "  Enter #, session id, or id prefix · empty = cancel" + UI.Style.TEXT_NORMAL)
  if (opts?.includeNew) {
    UI.println(UI.Style.TEXT_DIM + "  Type new to start a fresh session" + UI.Style.TEXT_NORMAL)
  }
  const raw = (await ask(UI.Style.TEXT_HIGHLIGHT + "  › " + UI.Style.TEXT_NORMAL)).trim()
  if (!raw) return undefined
  if (opts?.includeNew && /^new$/i.test(raw)) return "__new__"

  const num = Number.parseInt(raw, 10)
  if (!Number.isNaN(num) && num >= 1 && num <= rows.length) {
    return rows[num - 1]!.id
  }

  const resolved = resolveSessionRef(raw, rows)
  if (resolved) return resolved.id

  UI.println(UI.Style.TEXT_WARNING + "No matching session." + UI.Style.TEXT_NORMAL)
  return undefined
}

export async function confirmYes(
  ask: (prompt: string) => Promise<string>,
  prompt: string,
): Promise<boolean> {
  const a = (await ask(prompt)).trim().toLowerCase()
  return a === "y" || a === "yes"
}

export async function deleteSessionById(
  sdk: localcoderClient,
  ctx: ReplContext,
  sessionID: string,
): Promise<boolean> {
  const result = await sdk.session.delete({ sessionID, directory: ctx.directory })
  if (result.error) {
    UI.println(UI.Style.TEXT_DANGER + `Delete failed: ${String(result.error)}` + UI.Style.TEXT_NORMAL)
    return false
  }
  if (ctx.sessionID === sessionID) {
    ctx.sessionID = undefined
    ctx.continueSession = false
    ctx.meterShort = undefined
  }
  UI.println(UI.Style.TEXT_SUCCESS + `Deleted session ${shortSession(sessionID)}.` + UI.Style.TEXT_NORMAL)
  return true
}

type HistoryRow = {
  index: number
  id: string
  role: string
  preview: string
  time?: number
}

export async function fetchHistoryRows(
  sdk: localcoderClient,
  ctx: ReplContext,
  limit = 40,
): Promise<HistoryRow[]> {
  if (!ctx.sessionID) return []
  const messages = await sdk.session.messages({
    sessionID: ctx.sessionID,
    directory: ctx.directory,
  })
  const rows = messages.data ?? []
  const out: HistoryRow[] = []
  let index = 0
  for (const row of rows) {
    const role = row.info.role
    if (role !== "user" && role !== "assistant") continue
    index++
    let preview = ""
    for (const part of row.parts) {
      if (part.type === "text" && "text" in part && typeof part.text === "string") {
        preview += part.text
      }
    }
    preview = preview.replace(/\s+/g, " ").trim()
    const time =
      "time" in row.info && row.info.time && "created" in row.info.time
        ? row.info.time.created
        : undefined
    out.push({
      index,
      id: row.info.id,
      role,
      preview: previewText(preview || "(empty)", 56),
      time,
    })
    if (out.length >= limit) break
  }
  return out
}

export function printHistory(rows: HistoryRow[], sessionID: string) {
  UI.println(UI.Style.TEXT_INFO_BOLD + `History · ${shortSession(sessionID)}` + UI.Style.TEXT_NORMAL)
  if (rows.length === 0) {
    UI.println(UI.Style.TEXT_DIM + "  (no messages)" + UI.Style.TEXT_NORMAL)
    return
  }
  for (const r of rows) {
    const role =
      r.role === "user"
        ? UI.Style.TEXT_INFO + "you" + UI.Style.TEXT_NORMAL
        : UI.Style.TEXT_HIGHLIGHT + "assistant" + UI.Style.TEXT_NORMAL
    const when = r.time ? UI.Style.TEXT_DIM + ` · ${Locale.todayTimeOrDateTime(r.time)}` : ""
    UI.println(
      `  ${UI.Style.TEXT_DIM}${String(r.index).padStart(2)}.${UI.Style.TEXT_NORMAL} ${role}${when} ${UI.Style.TEXT_DIM}${shortSession(r.id)}${UI.Style.TEXT_NORMAL}`,
    )
    UI.println(`      ${r.preview}`)
  }
  UI.println(UI.Style.TEXT_DIM + "  /history-delete <#|msg-id|last>" + UI.Style.TEXT_NORMAL)
}

export function resolveHistoryRef(
  ref: string,
  rows: HistoryRow[],
): HistoryRow | undefined {
  const q = ref.trim().toLowerCase()
  if (!q) return undefined
  if (q === "last") return rows[rows.length - 1]
  const num = Number.parseInt(q, 10)
  if (!Number.isNaN(num)) return rows.find((r) => r.index === num)
  const exact = rows.find((r) => r.id === ref.trim())
  if (exact) return exact
  const matches = rows.filter((r) => r.id.startsWith(ref.trim()))
  if (matches.length === 1) return matches[0]
  return undefined
}

export async function deleteHistoryMessage(
  sdk: localcoderClient,
  ctx: ReplContext,
  messageID: string,
): Promise<boolean> {
  if (!ctx.sessionID) return false
  const result = await sdk.session.deleteMessage({
    sessionID: ctx.sessionID,
    messageID,
    directory: ctx.directory,
  })
  if (result.error) {
    UI.println(UI.Style.TEXT_DANGER + `Delete failed: ${String(result.error)}` + UI.Style.TEXT_NORMAL)
    return false
  }
  await applySessionMeterToContext(sdk, ctx)
  UI.println(UI.Style.TEXT_SUCCESS + `Deleted message ${shortSession(messageID)}.` + UI.Style.TEXT_NORMAL)
  return true
}

export async function clearSessionHistory(sdk: localcoderClient, ctx: ReplContext): Promise<number> {
  if (!ctx.sessionID) return 0
  const messages = await sdk.session.messages({
    sessionID: ctx.sessionID,
    directory: ctx.directory,
  })
  const rows = messages.data ?? []
  const ids = rows
    .map((r) => r.info)
    .filter((info) => info.role === "user" || info.role === "assistant")
    .map((info) => info.id)
    .reverse()

  let n = 0
  for (const messageID of ids) {
    const ok = await sdk.session
      .deleteMessage({
        sessionID: ctx.sessionID,
        messageID,
        directory: ctx.directory,
      })
      .then((r) => !r.error)
    if (ok) n++
  }
  await applySessionMeterToContext(sdk, ctx)
  return n
}

export function printSearchHits(hits: SessionSearchHit[], directory: string, activeID?: string) {
  const filtered = hits.filter((h) => h.directory === directory)
  if (filtered.length === 0) {
    UI.println(UI.Style.TEXT_DIM + "  No matches in this project." + UI.Style.TEXT_NORMAL)
    return
  }
  for (const hit of filtered) {
    const mark = hit.sessionID === activeID ? "*" : " "
    UI.println(
      `  ${mark} ${UI.Style.TEXT_HIGHLIGHT}${shortSession(hit.sessionID)}${UI.Style.TEXT_NORMAL}  ${Locale.todayTimeOrDateTime(hit.timeUpdated)}  ${hit.title}`,
    )
    if (hit.matchSource === "content" && hit.snippet) {
      UI.println(UI.Style.TEXT_DIM + `      ${previewText(hit.snippet, 60)}` + UI.Style.TEXT_NORMAL)
    }
  }
}

export function runSessionSearch(query: string, directory: string, limit?: number) {
  return searchSessions({ query, limit: limit ?? 15, scope: "all" }).filter((h) => h.directory === directory)
}
