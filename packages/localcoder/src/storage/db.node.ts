import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"

export function init(path: string) {
  const sqlite = new Database(path)
  return drizzle(sqlite as any)
}
