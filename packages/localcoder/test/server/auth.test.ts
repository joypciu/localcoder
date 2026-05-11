import { afterEach, describe, expect, test } from "bun:test"
import { Option, Redacted } from "effect"
import { Flag } from "@localcoder-ai/core/flag/flag"
import { ServerAuth } from "../../src/server/auth"

const original = {
  LOCALCODER_SERVER_PASSWORD: Flag.LOCALCODER_SERVER_PASSWORD,
  LOCALCODER_SERVER_USERNAME: Flag.LOCALCODER_SERVER_USERNAME,
}

afterEach(() => {
  Flag.LOCALCODER_SERVER_PASSWORD = original.LOCALCODER_SERVER_PASSWORD
  Flag.LOCALCODER_SERVER_USERNAME = original.LOCALCODER_SERVER_USERNAME
})

describe("ServerAuth", () => {
  test("does not emit auth headers without a password", () => {
    Flag.LOCALCODER_SERVER_PASSWORD = undefined
    Flag.LOCALCODER_SERVER_USERNAME = "alice"

    expect(ServerAuth.header()).toBeUndefined()
    expect(ServerAuth.headers()).toBeUndefined()
  })

  test("defaults to the localcoder username", () => {
    Flag.LOCALCODER_SERVER_PASSWORD = "secret"
    Flag.LOCALCODER_SERVER_USERNAME = undefined

    expect(ServerAuth.headers()).toEqual({
      Authorization: `Basic ${Buffer.from("localcoder:secret").toString("base64")}`,
    })
  })

  test("uses the configured username", () => {
    Flag.LOCALCODER_SERVER_PASSWORD = "secret"
    Flag.LOCALCODER_SERVER_USERNAME = "alice"

    expect(ServerAuth.headers()).toEqual({
      Authorization: `Basic ${Buffer.from("alice:secret").toString("base64")}`,
    })
  })

  test("prefers explicit credentials", () => {
    Flag.LOCALCODER_SERVER_PASSWORD = "secret"
    Flag.LOCALCODER_SERVER_USERNAME = "alice"

    expect(ServerAuth.headers({ password: "cli-secret", username: "bob" })).toEqual({
      Authorization: `Basic ${Buffer.from("bob:cli-secret").toString("base64")}`,
    })
  })

  test("validates decoded credentials against effect config", () => {
    const config = { password: Option.some("secret"), username: "alice" }

    expect(ServerAuth.required(config)).toBe(true)
    expect(ServerAuth.authorized({ username: "alice", password: Redacted.make("secret") }, config)).toBe(true)
    expect(ServerAuth.authorized({ username: "localcoder", password: Redacted.make("secret") }, config)).toBe(false)
  })
})
