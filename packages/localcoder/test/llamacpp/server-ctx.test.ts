import { describe, expect, test } from "bun:test"
import { parseCtxFromArgv, parseCtxFromCommandLine } from "@/llamacpp/server"

describe("llamacpp/server ctx parsing", () => {
  test("parseCtxFromArgv reads -c and --ctx-size", () => {
    expect(parseCtxFromArgv(["llama-server", "-m", "a.gguf", "-c", "131072"])).toBe(131072)
    expect(parseCtxFromArgv(["llama-server", "--ctx-size", "32768"])).toBe(32768)
    expect(parseCtxFromArgv(["llama-server", "-c=65536"])).toBe(65536)
  })

  test("parseCtxFromCommandLine handles quoted Windows paths", () => {
    const cmd =
      '"P:\\llama cpp\\llama-server.exe" -m "P:\\models\\a.gguf" --host 127.0.0.1 --port 8080 -c 16384 --jinja'
    expect(parseCtxFromCommandLine(cmd)).toBe(16384)
  })

  test("returns undefined when no context flag", () => {
    expect(parseCtxFromArgv(["llama-server", "-m", "a.gguf"])).toBeUndefined()
  })
})
