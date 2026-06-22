import { cmd } from "@/cli/cmd/cmd"
import { UI } from "@/cli/ui"
import { ConfigKeybinds } from "@/config/keybinds"

const SHORTCUTS: Array<[string, string]> = [
  ["<leader>", "Ctrl+X (leader key)"],
  ["<leader> q / Ctrl+C / Ctrl+D", "Exit"],
  ["<leader> e", "Open external editor"],
  ["<leader> t", "List themes"],
  ["<leader> b", "Toggle sidebar"],
  ["<leader> s", "View status"],
  ["<leader> x", "Export session"],
  ["<leader> n", "New session"],
  ["<leader> l", "List sessions"],
  ["<leader> g", "Session timeline"],
  ["<leader> c", "Compact session"],
  ["<leader> m", "List models"],
  ["<leader> a", "List agents"],
  ["<leader> u", "Undo message"],
  ["<leader> r", "Redo message"],
  ["<leader> y", "Copy message"],
  ["<leader> h", "Toggle tips / code concealment"],
  ["Ctrl+P", "Command list"],
  ["Tab / Shift+Tab", "Cycle agents"],
  ["F2 / Shift+F2", "Cycle recent models"],
  ["Enter", "Submit input"],
  ["Shift+Enter", "Newline"],
  ["Ctrl+Enter", "Submit (legacy console)"],
  ["PageUp / PageDown", "Scroll messages"],
  ["Ctrl+Alt+Y / Ctrl+Alt+E", "Scroll messages by line"],
]

export const ShortcutsCommand = cmd({
  command: "shortcuts",
  describe: "show default TUI keyboard shortcuts",
  handler: async () => {
    UI.println(UI.Style.TEXT_INFO_BOLD + "LocalCoder TUI Shortcuts" + UI.Style.TEXT_NORMAL)
    UI.println("")
    const keybinds = ConfigKeybinds.Keybinds.parse({})
    for (const [keys, desc] of SHORTCUTS) {
      UI.println(`  ${UI.Style.TEXT_HIGHLIGHT_BOLD}${keys.padEnd(32)}${UI.Style.TEXT_NORMAL}  ${desc}`)
    }
    UI.println("")
    UI.println(UI.Style.TEXT_DIM + "  Keybindings can be customized in ~/.localcoder/tui.json" + UI.Style.TEXT_NORMAL)
  },
})
