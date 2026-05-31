import { UI } from "@/cli/ui"

/**
 * Simple pager for long assistant responses.
 * Shows the first N lines, then prompts to continue.
 * Press Enter/Space for next page, q to quit, g to go to end.
 */
export async function pageOutput(
  text: string,
  options: { pageSize?: number; ask: (prompt: string) => Promise<string> } = { pageSize: 40, ask: async () => "" },
): Promise<void> {
  const lines = text.split(/\r?\n/)
  const pageSize = options.pageSize ?? 40
  let pos = 0

  while (pos < lines.length) {
    const chunk = lines.slice(pos, pos + pageSize).join("\n")
    process.stdout.write(chunk)
    if (pos + pageSize < lines.length) {
      process.stdout.write("\n")
    }
    pos += pageSize

    if (pos >= lines.length) break

    const prompt = UI.Style.TEXT_DIM + "  ── more ── [Enter/Space=next · q=quit · g=end] " + UI.Style.TEXT_NORMAL
    try {
      const answer = (await options.ask(prompt)).trim().toLowerCase()
      if (answer === "q" || answer === "quit") break
      if (answer === "g" || answer === "end" || answer === "G") {
        // Print remaining lines
        const remaining = lines.slice(pos).join("\n")
        if (remaining) process.stdout.write(remaining + "\n")
        break
      }
      // Enter or space → next page
    } catch {
      break
    }
  }
}
