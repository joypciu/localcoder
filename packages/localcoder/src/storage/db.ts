import { type SQLiteBunDatabase } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { type SQLiteTransaction } from "drizzle-orm/sqlite-core"
export * from "drizzle-orm"
import { LocalContext } from "@/util/local-context"
import { lazy } from "../util/lazy"
import { Global } from "@localcoder-ai/core/global"
import * as Log from "@localcoder-ai/core/util/log"
import { NamedError } from "@localcoder-ai/core/util/error"
import z from "zod"
import path from "path"
import { createHash } from "crypto"
import { Flag } from "@localcoder-ai/core/flag/flag"
import { InstallationChannel } from "@localcoder-ai/core/installation/version"
import { InstanceState } from "@/effect/instance-state"
import { iife } from "@/util/iife"
import { init } from "#db"

declare const LOCALCODER_MIGRATIONS: { sql: string; timestamp: number; name: string }[] | undefined

export const NotFoundError = NamedError.create(
  "NotFoundError",
  z.object({
    message: z.string(),
  }),
)

const log = Log.create({ service: "db" })

export function getChannelPath() {
  if (["latest", "beta", "prod"].includes(InstallationChannel) || Flag.LOCALCODER_DISABLE_CHANNEL_DB)
    return path.join(Global.Path.data, "localcoder.db")
  const safe = InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")
  return path.join(Global.Path.data, `localcoder-${safe}.db`)
}

export const Path = iife(() => {
  if (Flag.LOCALCODER_DB) {
    if (Flag.LOCALCODER_DB === ":memory:" || path.isAbsolute(Flag.LOCALCODER_DB)) return Flag.LOCALCODER_DB
    return path.join(Global.Path.data, Flag.LOCALCODER_DB)
  }
  return getChannelPath()
})

export type Transaction = SQLiteTransaction<"sync", void>

type Client = SQLiteBunDatabase

type Journal = { sql: string; timestamp: number; name: string }[]

const MIGRATIONS_FOLDER = path.join(import.meta.dirname, "../../migration")

/** Bundled builds inject SQL journals; Drizzle 1.x migrate() only accepts { migrationsFolder }. */
function applyBundledMigrations(db: SQLiteBunDatabase, entries: Journal) {
  db.run(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at numeric
  )`)

  const last = db.$client
    .query("SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1")
    .get() as { created_at: number } | null
  const lastMillis = last?.created_at ?? 0

  db.run("BEGIN")
  try {
    for (const item of entries) {
      if (item.timestamp <= lastMillis) continue
      const stmts = item.sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean)
      for (const stmt of stmts) db.run(stmt)
      const hash = createHash("sha256").update(item.sql).digest("hex")
      db.run(
        `INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES('${hash}', ${item.timestamp})`,
      )
    }
    db.run("COMMIT")
  } catch (e) {
    db.run("ROLLBACK")
    throw e
  }
}

export const Client = lazy(() => {
  log.info("opening database", { path: Path })

  const db = init(Path)

  db.run("PRAGMA journal_mode = WAL")
  db.run("PRAGMA synchronous = NORMAL")
  db.run("PRAGMA busy_timeout = 5000")
  db.run("PRAGMA cache_size = -64000")
  db.run("PRAGMA foreign_keys = ON")
  db.run("PRAGMA wal_checkpoint(PASSIVE)")

  if (!Flag.LOCALCODER_SKIP_MIGRATIONS) {
    if (typeof LOCALCODER_MIGRATIONS !== "undefined") {
      log.info("applying migrations", { count: LOCALCODER_MIGRATIONS.length, mode: "bundled" })
      if (LOCALCODER_MIGRATIONS.length > 0) applyBundledMigrations(db, LOCALCODER_MIGRATIONS)
    } else {
      log.info("applying migrations", { mode: "dev", folder: MIGRATIONS_FOLDER })
      migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
    }
  }

  return db
})

export function close() {
  if (!Client.loaded()) return
  Client().$client.close()
  Client.reset()
}

export type TxOrDb = Transaction | Client

const ctx = LocalContext.create<{
  tx: TxOrDb
  effects: (() => void | Promise<void>)[]
}>("database")

export function use<T>(callback: (trx: TxOrDb) => T): T {
  try {
    return callback(ctx.use().tx)
  } catch (err) {
    if (err instanceof LocalContext.NotFound) {
      const effects: (() => void | Promise<void>)[] = []
      const result = ctx.provide({ effects, tx: Client() }, () => callback(Client()))
      for (const effect of effects) effect()
      return result
    }
    throw err
  }
}

export function effect(fn: () => any | Promise<any>) {
  const bound = InstanceState.bind(fn)
  try {
    ctx.use().effects.push(bound)
  } catch {
    bound()
  }
}

type NotPromise<T> = T extends Promise<any> ? never : T

export function transaction<T>(
  callback: (tx: TxOrDb) => NotPromise<T>,
  options?: {
    behavior?: "deferred" | "immediate" | "exclusive"
  },
): NotPromise<T> {
  try {
    return callback(ctx.use().tx)
  } catch (err) {
    if (err instanceof LocalContext.NotFound) {
      const effects: (() => void | Promise<void>)[] = []
      const txCallback = InstanceState.bind((tx: TxOrDb) => ctx.provide({ tx, effects }, () => callback(tx)))
      const result = Client().transaction(txCallback, { behavior: options?.behavior })
      for (const effect of effects) effect()
      return result as NotPromise<T>
    }
    throw err
  }
}

export * as Database from "./db"
