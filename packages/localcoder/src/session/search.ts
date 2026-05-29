import { Database } from "@/storage/db"
import { SessionTable, PartTable } from "@/session/session.sql"
import { and, desc, eq, inArray, isNull, like, sql } from "drizzle-orm"

export type SessionSearchScope = "title" | "content" | "all"

export type SessionSearchHit = {
  sessionID: string
  title: string
  directory: string
  timeUpdated: number
  snippet: string
  matchSource: "title" | "content"
}

export function searchSessions(input: {
  query: string
  limit?: number
  scope?: SessionSearchScope
}): SessionSearchHit[] {
  const q = input.query.trim()
  if (!q) return []

  const limit = Math.min(input.limit ?? 10, 50)
  const scope = input.scope ?? "all"
  const pattern = `%${q}%`
  const seen = new Set<string>()
  const hits: SessionSearchHit[] = []

  if (scope === "title" || scope === "all") {
    const rows = Database.use((db) =>
      db
        .select({
          id: SessionTable.id,
          title: SessionTable.title,
          directory: SessionTable.directory,
          time_updated: SessionTable.time_updated,
        })
        .from(SessionTable)
        .where(
          and(isNull(SessionTable.parent_id), isNull(SessionTable.time_archived), like(SessionTable.title, pattern)),
        )
        .orderBy(desc(SessionTable.time_updated))
        .limit(limit)
        .all(),
    )

    for (const row of rows) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      hits.push({
        sessionID: row.id,
        title: row.title,
        directory: row.directory,
        timeUpdated: row.time_updated,
        snippet: row.title,
        matchSource: "title",
      })
    }
  }

  if ((scope === "content" || scope === "all") && hits.length < limit) {
    const remaining = limit - hits.length
    const alreadySeen = [...seen]

    const contentRows = Database.use((db) => {
      const seenFilter =
        alreadySeen.length > 0
          ? sql`${PartTable.session_id} NOT IN (${sql.join(
              alreadySeen.map((id) => sql`${id}`),
              sql`, `,
            )})`
          : undefined

      return db
        .selectDistinct({
          session_id: PartTable.session_id,
          snippet: sql<string>`substr(json_extract(${PartTable.data}, '$.text'), 1, 200)`,
        })
        .from(PartTable)
        .innerJoin(SessionTable, eq(SessionTable.id, PartTable.session_id))
        .where(
          and(
            sql`json_extract(${PartTable.data}, '$.type') = 'text'`,
            sql`json_extract(${PartTable.data}, '$.synthetic') IS NOT TRUE`,
            like(sql`json_extract(${PartTable.data}, '$.text')`, pattern),
            isNull(SessionTable.time_archived),
            isNull(SessionTable.parent_id),
            seenFilter,
          ),
        )
        .orderBy(desc(PartTable.time_updated))
        .limit(remaining)
        .all()
    })

    if (contentRows.length > 0) {
      const sessionIDs = contentRows.map((r) => r.session_id)
      const sessionRows = Database.use((db) =>
        db
          .select({
            id: SessionTable.id,
            title: SessionTable.title,
            directory: SessionTable.directory,
            time_updated: SessionTable.time_updated,
          })
          .from(SessionTable)
          .where(inArray(SessionTable.id, sessionIDs))
          .all(),
      )
      const sessionMap = new Map(sessionRows.map((r) => [r.id, r]))

      for (const row of contentRows) {
        if (seen.has(row.session_id)) continue
        const session = sessionMap.get(row.session_id)
        if (!session) continue
        seen.add(row.session_id)
        hits.push({
          sessionID: row.session_id,
          title: session.title,
          directory: session.directory,
          timeUpdated: session.time_updated,
          snippet: row.snippet ?? "",
          matchSource: "content",
        })
      }
    }
  }

  hits.sort((a, b) => b.timeUpdated - a.timeUpdated)
  return hits
}
