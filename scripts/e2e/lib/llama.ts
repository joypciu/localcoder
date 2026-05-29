import type { LlamaPaths } from "./env"

export async function probeLlamaApi(paths: LlamaPaths): Promise<string | undefined> {
  try {
    const res = await fetch(`${paths.apiUrl}/models`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return undefined
    const data = (await res.json()) as { data?: Array<{ id: string }> }
    return data.data?.[0]?.id
  } catch {
    return undefined
  }
}

export async function waitForLlamaApi(paths: LlamaPaths, timeoutMs = 600_000): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const id = await probeLlamaApi(paths)
    if (id) return id
    await Bun.sleep(2000)
  }
  throw new Error(`llama-server API not ready at ${paths.apiUrl} after ${timeoutMs / 1000}s`)
}
