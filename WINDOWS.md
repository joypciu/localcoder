# LocalCoder on Windows

A complete Windows-specific guide for running and building LocalCoder from source.

## Quick start (source)

### 1. Install Bun

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Restart your terminal after installation.

### 2. Install dependencies

```powershell
cd /d <LOCALCODER_REPO_PATH>
bun install
```

### 3. Run LocalCoder

From the `packages/localcoder` folder, use the included Windows launcher:

```powershell
cd /d <LOCALCODER_REPO_PATH>\packages\localcoder
.\localcoder.bat
```

Or use Bun directly:

```powershell
bun --conditions=browser ./src/index.ts --simple
```

## Available CLI surfaces

| Command | What it does |
|---------|--------------|
| `localcoder.bat` | Starts the simple text REPL (works in any terminal) |
| `localcoder.bat tui` | Full-screen TUI (requires a modern terminal) |
| `localcoder.bat --help` | Show all commands |
| `localcoder.bat llamacpp setup` | Interactive wizard to configure local llama.cpp |
| `localcoder.bat run "your prompt"` | Run a one-shot prompt |

## Configure a local model (llama.cpp)

You do not need to start `llama-server` manually.

```powershell
.\localcoder.bat llamacpp setup
```

The wizard asks for:
- Path to your `llama.cpp` folder (the one containing `llama-server.exe`)
- Path to your `.gguf` model
- Context size

LocalCoder saves this to `~/.localcoder/llamacpp.json` and starts the server automatically.

Common Windows paths (adjust to your system):
- llama.cpp binaries: `C:\tools\llama.cpp\llama-b9534-bin-win-cuda-13.3-x64`
- Models: `C:\models`

## Build a Windows CLI binary

### Fast build (for development)

```powershell
cd /d <LOCALCODER_REPO_PATH>\packages\localcoder
bun run build:win-fast
```

This skips dependency re-installation and reuses the existing `dist/` folder. Output:

```
dist/localcoder-windows-x64/bin/localcoder.exe
dist/localcoder-windows-x64/bin/localcoder.bat
```

Run it directly:

```powershell
.\dist\localcoder-windows-x64\bin\localcoder.bat --version
.\dist\localcoder-windows-x64\bin\localcoder.bat doctor
```

### Full build (for distribution)

```powershell
cd /d <LOCALCODER_REPO_PATH>\packages\localcoder
bun run build:win
```

This produces a standalone Node-based CLI in `dist/npm/localcoder` that can be installed globally:

```powershell
npm install -g .\dist\npm\localcoder
localcoder
```

## Build a Windows portable GUI app

```powershell
cd /d <LOCALCODER_REPO_PATH>
bun run build:win-standalone
```

Output:
- Fast unpack-only build: set `LOCALCODER_FAST_PACK=1` first
- Portable `.exe`: `packages/desktop/dist/LocalCoder-<version>-portable.exe`

## Troubleshooting

### `bun` is not recognized

Restart your terminal, or install Bun from an elevated PowerShell:

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

### TUI does not render correctly in Windows Terminal

Use the simple REPL instead:

```powershell
.\localcoder.bat --simple
```

### node-pty build errors

Run the fix script:

```powershell
cd /d <LOCALCODER_REPO_PATH>\packages\localcoder
bun run fix-node-pty
```

### Warnings about `LF will be replaced by CRLF`

These are harmless Git warnings on Windows and can be ignored.

## Development tips

- Always run `bun typecheck` from `packages/localcoder`, never from the repo root.
- Run `bun run dev` from `packages/localcoder` for hot-reload CLI development.
- Use `LOCALCODER_LLAMACPP_DIR` and `LOCALCODER_LLAMACPP_MODEL` environment variables to skip the wizard.
