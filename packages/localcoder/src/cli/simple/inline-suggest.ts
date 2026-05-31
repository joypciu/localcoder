/**
 * Fish-shell style inline history suggestions.
 * Returns the suffix to show as ghost text, or null if no match.
 */
export function findSuggestion(text: string, history: string[]): string | null {
  if (!text || text.includes("\n")) return null
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i]!
    if (entry.startsWith(text) && entry !== text) return entry.slice(text.length)
  }
  return null
}
