export * from "./client.js"
export * from "./server.js"

import { createlocalcoderClient } from "./client.js"
import { createlocalcoderServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export async function createlocalcoder(options?: ServerOptions) {
  const server = await createlocalcoderServer({
    ...options,
  })

  const client = createlocalcoderClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
