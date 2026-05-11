import { createlocalcoderClient, type localcoderClient } from "@localcoder-ai/sdk/v2"
import { Server } from "@/server/server"

export function createInProcessClient(directory?: string): localcoderClient {
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    return Server.Default().app.fetch(request)
  }) as typeof globalThis.fetch

  return createlocalcoderClient({
    baseUrl: "http://localcoder.internal",
    fetch: fetchFn,
    directory,
  })
}
