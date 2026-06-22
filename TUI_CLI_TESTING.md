# LocalCoder TUI & CLI Testing Notes

## Environment

- OS: Windows 11
- Terminal: Windows Terminal / PowerShell
- LocalCoder source: this repo (`packages/localcoder`)

## TUI

### How to launch

```powershell
cd packages\localcoder
.\localcoder.bat tui
```

Best experience: run inside **Windows Terminal** (wt.exe). The TUI uses Ink (React for terminals) and needs raw stdin mode.

### Known limitations

- **Non-TTY stdin** (pipes, CI, subprocesses): Ink throws `Raw mode is not supported on the current process.stdin`. LocalCoder now auto-fallbacks to the text REPL in this case.
- **Legacy CMD/conhost**: localcoder tries to relaunch in Windows Terminal; if WT is unavailable it falls back to the text REPL.

### Default shortcuts (from `src/config/keybinds.ts`)

| Shortcut | Action |
|----------|--------|
| `Ctrl+X` | Leader key |
| `<leader> q` / `Ctrl+C` / `Ctrl+D` | Exit |
| `<leader> e` | Open external editor |
| `<leader> t` | List themes |
| `<leader> b` | Toggle sidebar |
| `<leader> s` | View status |
| `<leader> x` | Export session to editor |
| `<leader> n` | New session |
| `<leader> l` | List sessions |
| `<leader> g` | Session timeline |
| `<leader> c` | Compact session |
| `<leader> m` | List models |
| `<leader> a` | List agents |
| `<leader> u` | Undo message |
| `<leader> r` | Redo message |
| `<leader> y` | Copy message |
| `<leader> h` | Toggle code concealment / tips |
| `Ctrl+P` | Command list |
| `Tab` / `Shift+Tab` | Cycle agents |
| `F2` / `Shift+F2` | Cycle recent models |
| `Enter` | Submit input (modern terminals) |
| `Shift+Enter` | Newline (modern terminals) |
| `Ctrl+Enter` | Submit input (legacy console) |
| `Ctrl+Z` | Suspend terminal (not on Windows) |

### Fallback

If the TUI cannot start, LocalCoder now prints a warning and runs `localcoder repl` instead. Use `--no-fallback` to disable.

## Simple REPL (fallback CLI)

### How to launch

```powershell
.\localcoder.bat repl
.\localcoder.bat --simple
```

### Slash commands

| Command | Action |
|---------|--------|
| `/help` | Show help |
| `/exit` / `/quit` | Exit |
| `/new` | Fresh session |
| `/session` | Switch session (picker) |
| `/sessions` | List sessions |
| `/resume <id>` | Resume session |
| `/search <query>` | Search sessions |
| `/history` | Show history |
| `/clear-history` | Clear history |
| `/delete-session` | Delete session |
| `/rename-session` | Rename session |
| `/revert` | Revert |
| `/fork` | Fork session |
| `/compact` | Compact session |
| `/connect` | Connect provider |
| `/llama` | llama.cpp setup |
| `/providers` | Manage providers |
| `/model [id]` | Pick model |
| `/agent [name]` | Pick agent |
| `/status` | Show status |
| `/thinking` | Toggle reasoning panel |
| `/timing` | Toggle duration footer |
| `/tips` | Toggle tips |
| `/permissions` | Cycle permission mode |
| `/copy` | Copy last response |
| `/markdown` | Toggle markdown rendering |
| `/shortcuts` | Quick reference |
| `/commands` | List commands |
| `/editor` | Open system editor |
| `/multiline` | Toggle multiline |
| `/input` | Toggle input mode |
| `!cmd` | Run local shell command |
| `@path` | Attach file |

### Input shortcuts

- `Shift+Enter` or `F2` — newline
- `Enter` — submit
- `Ctrl+J` — newline
- `/editor` — multiline editor

## Doctor command

```powershell
.\localcoder.bat doctor
```

Checks: platform, Bun, Node.js, Python, PowerShell, config directory, llama.cpp binary, GGUF model.
