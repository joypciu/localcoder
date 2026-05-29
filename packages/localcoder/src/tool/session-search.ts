import { Effect, Schema } from "effect"
import { searchSessions } from "@/session/search"
import DESCRIPTION from "./session-search.txt"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  query: Schema.String.annotate({
    description: "Search query — keywords, topic, or phrase to search for in past session titles and messages",
  }),
  limit: Schema.optional(Schema.Number).annotate({
    description: "Maximum number of sessions to return (default: 10, max: 50)",
  }),
  scope: Schema.optional(Schema.Literals(["title", "content", "all"])).annotate({
    description:
      '"title" — search session titles only (fast); "content" — search message text only; "all" — search both (default)',
  }),
})

export const SessionSearchTool = Tool.define(
  "session_search",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,

    execute(params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) {
      return Effect.gen(function* () {
        yield* ctx.ask({
          permission: "session_search",
          patterns: [params.query],
          always: ["*"],
          metadata: { query: params.query },
        })

        const q = params.query.trim()
        if (!q) {
          return {
            title: "Session search",
            metadata: { count: 0, query: "" },
            output: "Empty query — please provide search terms.",
          }
        }

        const hits = searchSessions({
          query: q,
          limit: params.limit,
          scope: params.scope,
        })

        if (hits.length === 0) {
          return {
            title: "Session search",
            metadata: { count: 0, query: q },
            output: `No past sessions found matching "${q}".`,
          }
        }

        const lines: string[] = [
          `Found ${hits.length} session${hits.length === 1 ? "" : "s"} matching "${q}":`,
          "",
        ]

        for (const hit of hits) {
          const date = new Date(hit.timeUpdated).toISOString().slice(0, 10)
          lines.push(`## ${hit.title}`)
          lines.push(`- **ID**: ${hit.sessionID}`)
          lines.push(`- **Directory**: ${hit.directory}`)
          lines.push(`- **Last updated**: ${date}`)
          lines.push(`- **Match**: ${hit.matchSource}`)
          if (hit.matchSource === "content" && hit.snippet && hit.snippet !== hit.title) {
            const excerpt = hit.snippet.replace(/\s+/g, " ").trim()
            lines.push(`- **Snippet**: ${excerpt.length > 150 ? excerpt.slice(0, 147) + "..." : excerpt}`)
          }
          lines.push("")
        }

        return {
          title: `Session search: ${q}`,
          metadata: { count: hits.length, query: q },
          output: lines.join("\n"),
        }
      }).pipe(Effect.orDie)
    },
  }),
)
