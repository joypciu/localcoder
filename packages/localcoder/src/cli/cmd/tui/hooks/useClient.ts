import { createlocalcoderClient, type localcoderClient } from "@localcoder-ai/sdk/v2"

export function createTuiClient(input: {
  url: string
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
}): localcoderClient {
  return createlocalcoderClient({
    baseUrl: input.url,
    directory: input.directory,
    fetch: input.fetch,
    headers: input.headers,
  })
}
