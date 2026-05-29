export * as ConfigKeybinds from "./keybinds"

import { Effect, Schema } from "effect"
import type z from "zod"
import { zod } from "@/util/effect-zod"
import { isLegacyWindowsConsole } from "@/util/windows-terminal"

// Every keybind field has the same shape: an optional string with a default
// binding and a human description.  `keybind()` keeps the declaration list
// below dense and readable.
const keybind = (value: string, description: string) =>
  Schema.String.pipe(Schema.optional, Schema.withDecodingDefault(Effect.succeed(value))).annotate({ description })

function windowsLegacyInputKeybinds() {
  if (process.platform !== "win32") return false
  if (process.env.LOCALCODER_LEGACY_TERMINAL === "1") return true
  return isLegacyWindowsConsole()
}

// Windows CMD/conhost: plain Enter is unreliable for submit; Ctrl+Enter sends.
// Modern terminals (Windows Terminal, Cursor, VS Code, PowerShell in WT): match macOS/Linux.
const inputSubmitDefault = windowsLegacyInputKeybinds() ? "ctrl+return,ctrl+enter" : "return"
const inputNewlineDefault = windowsLegacyInputKeybinds()
  ? "return,enter,shift+return,shift+enter,ctrl+j,alt+return"
  : "shift+return,shift+enter,ctrl+return,ctrl+enter,alt+return,ctrl+j"
const inputUndoDefault = process.platform === "win32" ? "ctrl+z,ctrl+-,super+z" : "ctrl+-,super+z"

const KeybindsSchema = Schema.Struct({
  leader: keybind("ctrl+x", "Leader key for keybind combinations"),
  app_exit: keybind("ctrl+c,ctrl+d,<leader>q", "Exit the application"),
  editor_open: keybind("<leader>e", "Open external editor"),
  theme_list: keybind("<leader>t", "List available themes"),
  sidebar_toggle: keybind("<leader>b", "Toggle sidebar"),
  scrollbar_toggle: keybind("none", "Toggle session scrollbar"),
  username_toggle: keybind("none", "Toggle username visibility"),
  status_view: keybind("<leader>s", "View status"),
  session_export: keybind("<leader>x", "Export session to editor"),
  session_new: keybind("<leader>n", "Create a new session"),
  session_list: keybind("<leader>l", "List all sessions"),
  session_timeline: keybind("<leader>g", "Show session timeline"),
  session_fork: keybind("none", "Fork session from message"),
  session_rename: keybind("ctrl+r", "Rename session"),
  session_delete: keybind("ctrl+d", "Delete session"),
  stash_delete: keybind("ctrl+d", "Delete stash entry"),
  model_provider_list: keybind("ctrl+a", "Open provider list from model dialog"),
  model_favorite_toggle: keybind("ctrl+f", "Toggle model favorite status"),
  session_share: keybind("none", "Share current session"),
  session_unshare: keybind("none", "Unshare current session"),
  session_interrupt: keybind("escape", "Interrupt current session"),
  session_compact: keybind("<leader>c", "Compact the session"),
  messages_page_up: keybind("pageup,ctrl+alt+b", "Scroll messages up by one page"),
  messages_page_down: keybind("pagedown,ctrl+alt+f", "Scroll messages down by one page"),
  messages_line_up: keybind("ctrl+alt+y", "Scroll messages up by one line"),
  messages_line_down: keybind("ctrl+alt+e", "Scroll messages down by one line"),
  messages_half_page_up: keybind("ctrl+alt+u", "Scroll messages up by half page"),
  messages_half_page_down: keybind("ctrl+alt+d", "Scroll messages down by half page"),
  messages_first: keybind("ctrl+g,home", "Navigate to first message"),
  messages_last: keybind("ctrl+alt+g,end", "Navigate to last message"),
  messages_next: keybind("none", "Navigate to next message"),
  messages_previous: keybind("none", "Navigate to previous message"),
  messages_last_user: keybind("none", "Navigate to last user message"),
  messages_copy: keybind("<leader>y", "Copy message"),
  messages_undo: keybind("<leader>u", "Undo message"),
  messages_redo: keybind("<leader>r", "Redo message"),
  messages_toggle_conceal: keybind("<leader>h", "Toggle code block concealment in messages"),
  tool_details: keybind("none", "Toggle tool details visibility"),
  model_list: keybind("<leader>m", "List available models"),
  model_cycle_recent: keybind("f2", "Next recently used model"),
  model_cycle_recent_reverse: keybind("shift+f2", "Previous recently used model"),
  model_cycle_favorite: keybind("none", "Next favorite model"),
  model_cycle_favorite_reverse: keybind("none", "Previous favorite model"),
  command_list: keybind("ctrl+p", "List available commands"),
  agent_list: keybind("<leader>a", "List agents"),
  agent_cycle: keybind("tab", "Next agent"),
  agent_cycle_reverse: keybind("shift+tab", "Previous agent"),
  variant_cycle: keybind("ctrl+t", "Cycle model variants"),
  variant_list: keybind("none", "List model variants"),
  input_clear: keybind("ctrl+c", "Clear input field"),
  input_paste: keybind("ctrl+v", "Paste from clipboard"),
  input_submit: keybind(inputSubmitDefault, "Submit input"),
  input_newline: keybind(inputNewlineDefault, "Insert newline in input"),
  input_move_left: keybind("left,ctrl+b", "Move cursor left in input"),
  input_move_right: keybind("right,ctrl+f", "Move cursor right in input"),
  input_move_up: keybind("up", "Move cursor up in input"),
  input_move_down: keybind("down", "Move cursor down in input"),
  input_select_left: keybind("shift+left", "Select left in input"),
  input_select_right: keybind("shift+right", "Select right in input"),
  input_select_up: keybind("shift+up", "Select up in input"),
  input_select_down: keybind("shift+down", "Select down in input"),
  input_line_home: keybind("ctrl+a", "Move to start of line in input"),
  input_line_end: keybind("ctrl+e", "Move to end of line in input"),
  input_select_line_home: keybind("ctrl+shift+a", "Select to start of line in input"),
  input_select_line_end: keybind("ctrl+shift+e", "Select to end of line in input"),
  input_visual_line_home: keybind("alt+a", "Move to start of visual line in input"),
  input_visual_line_end: keybind("alt+e", "Move to end of visual line in input"),
  input_select_visual_line_home: keybind("alt+shift+a", "Select to start of visual line in input"),
  input_select_visual_line_end: keybind("alt+shift+e", "Select to end of visual line in input"),
  input_buffer_home: keybind("home", "Move to start of buffer in input"),
  input_buffer_end: keybind("end", "Move to end of buffer in input"),
  input_select_buffer_home: keybind("shift+home", "Select to start of buffer in input"),
  input_select_buffer_end: keybind("shift+end", "Select to end of buffer in input"),
  input_delete_line: keybind("ctrl+shift+d", "Delete line in input"),
  input_delete_to_line_end: keybind("ctrl+k", "Delete to end of line in input"),
  input_delete_to_line_start: keybind("ctrl+u", "Delete to start of line in input"),
  input_backspace: keybind("backspace,shift+backspace", "Backspace in input"),
  input_delete: keybind("ctrl+d,delete,shift+delete", "Delete character in input"),
  input_undo: keybind(inputUndoDefault, "Undo in input"),
  input_redo: keybind("ctrl+.,super+shift+z", "Redo in input"),
  input_word_forward: keybind("alt+f,alt+right,ctrl+right", "Move word forward in input"),
  input_word_backward: keybind("alt+b,alt+left,ctrl+left", "Move word backward in input"),
  input_select_word_forward: keybind("alt+shift+f,alt+shift+right", "Select word forward in input"),
  input_select_word_backward: keybind("alt+shift+b,alt+shift+left", "Select word backward in input"),
  input_delete_word_forward: keybind("alt+d,alt+delete,ctrl+delete", "Delete word forward in input"),
  input_delete_word_backward: keybind("ctrl+w,ctrl+backspace,alt+backspace", "Delete word backward in input"),
  history_previous: keybind("up", "Previous history item"),
  history_next: keybind("down", "Next history item"),
  input_select_all: keybind("meta+a", "Select all text in input"),
  input_duplicate_line: keybind("alt+shift+d", "Duplicate current line"),
  input_move_line_up: keybind("alt+up", "Move current line up"),
  input_move_line_down: keybind("alt+down", "Move current line down"),
  input_toggle_case: keybind("alt+u", "Toggle case of selection"),
  messages_copy_all: keybind("ctrl+shift+c", "Copy all visible message content"),
  quick_model_1: keybind("none", "Quick switch to model slot 1"),
  quick_model_2: keybind("none", "Quick switch to model slot 2"),
  quick_model_3: keybind("none", "Quick switch to model slot 3"),
  quick_model_4: keybind("none", "Quick switch to model slot 4"),
  quick_model_5: keybind("none", "Quick switch to model slot 5"),
  toggle_word_wrap: keybind("alt+z", "Toggle word wrap in messages"),
  session_child_first: keybind("<leader>down", "Go to first child session"),
  session_child_cycle: keybind("right", "Go to next child session"),
  session_child_cycle_reverse: keybind("left", "Go to previous child session"),
  session_parent: keybind("up", "Go to parent session"),
  // `terminal_suspend` was formerly `.default("ctrl+z").transform((v) => win32 ? "none" : v)`,
  // but `tui.ts` already forces the binding to "none" on win32 before calling
  // `Keybinds.parse(...)`, so the schema-level transform was redundant.
  terminal_suspend: keybind("ctrl+z", "Suspend terminal"),
  terminal_title_toggle: keybind("none", "Toggle terminal title"),
  tips_toggle: keybind("<leader>h", "Toggle tips on home screen"),
  plugin_manager: keybind("none", "Open plugin manager dialog"),
  display_thinking: keybind("none", "Toggle thinking blocks visibility"),
}).annotate({ identifier: "KeybindsConfig" })

export type Keybinds = Schema.Schema.Type<typeof KeybindsSchema>

// Consumers access `Keybinds.shape` and `Keybinds.shape.X.parse(undefined)`,
// which requires the runtime type to be a ZodObject, not just ZodType.  Every
// field is `string().optional().default(...)` at runtime, so widen to that.
export const Keybinds = zod(KeybindsSchema) as unknown as z.ZodObject<
  Record<keyof Keybinds, z.ZodDefault<z.ZodOptional<z.ZodString>>>
>
