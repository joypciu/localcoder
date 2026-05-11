# Installing LocalCoder

## npm (recommended)

```bash
npm install -g localcoder
localcoder --version
localcoder
```

The `localcoder` package ships a Node launcher plus a **platform-specific binary** as an optional dependency:

| Platform | npm package |
|----------|-------------|
| Windows x64 | `localcoder-windows-x64` |
| Windows arm64 | `localcoder-windows-arm64` |
| macOS Apple Silicon | `localcoder-darwin-arm64` |
| macOS Intel | `localcoder-darwin-x64` |
| Linux x64 / arm64 | `localcoder-linux-x64`, `localcoder-linux-arm64`, … |

On Windows, `postinstall` copies the native `.exe` next to the launcher.

---

## From source (monorepo)

Requires [Bun](https://bun.sh) **v1.3.14+** (`bun upgrade` if older).

```bash
git clone https://github.com/joypciu/localcoder.git
cd localcoder
bun install
```

### One-command global CLI (Windows)

```powershell
bun run install:cli
```

Runs `build:win` → `prepare:npm` → `npm install -g ./dist/npm/localcoder`.

### Manual steps

```bash
cd packages/localcoder
bun run build:win          # or build:mac on macOS
bun run prepare:npm
npm install -g ./dist/npm/localcoder
```

Install from `dist/npm/localcoder` only — not `packages/localcoder` directly (breaks global shim under `"type": "module"`).

### Dev mode (no global install)

```bash
bun run --cwd packages/localcoder dev
```

---

## curl installer (Unix)

```bash
curl -fsSL https://raw.githubusercontent.com/joypciu/localcoder/main/install | bash
```

---

## First-time provider setup

No manual config editing required.

### llama.cpp (local GGUF)

1. Download [llama.cpp](https://github.com/ggerganov/llama.cpp/releases) binaries (`llama-server.exe` on Windows).
2. Download any `.gguf` model.
3. Run the wizard:

```powershell
localcoder llamacpp setup
```

You'll pick folder, model, context size (4096–131072), and thinking mode (Qwen/Qwopus). Config: `~/.localcoder/llamacpp.json`.

**Desktop / VS Code:** use the in-app setup dialog or **LocalCoder: Set up llama.cpp**.

### Cloud providers (OpenRouter, OpenCode Go, etc.)

```powershell
localcoder auth set-api --provider openrouter --key YOUR_KEY
localcoder auth set-api --provider opencode-go --key YOUR_KEY
localcoder models
```

**VS Code:** first-run wizard or **LocalCoder: Connect cloud provider** (Settings ⚙).

Keys stored in `~/.localcoder/auth.json`.

---

## Desktop app (Electron)

| Platform | Artifact |
|----------|----------|
| Windows | `LocalCoder-*-portable.exe` (recommended) or NSIS installer |
| macOS | `.dmg` |

**Download:** [GitHub Releases](https://github.com/joypciu/localcoder/releases)

**Build locally:**

```powershell
bun run build:win-standalone
# Output: packages\desktop\dist\LocalCoder-<version>-portable.exe

# Fast iteration (unpacked exe, ~1 min)
$env:LOCALCODER_FAST_PACK = "1"
bun run build:win-standalone
# Run: packages\desktop\dist\win-unpacked\LocalCoder.exe
```

Does not bundle llama.cpp or GGUF — users pick paths in the setup wizard.

See [packages/desktop/README.md](packages/desktop/README.md).

---

## VS Code extension

1. Clone the repo and open in VS Code
2. `cd sdks/vscode && bun install && bun run compile`
3. Press **F5** (Extension Development Host)
4. Build CLI: `bun run install:cli` or `bun run build:win` in `packages/localcoder`
5. Set **LocalCoder: Package Path** to `packages/localcoder` if auto-detect fails

First launch shows the provider wizard (llama.cpp, OpenRouter, OpenCode Go, Groq, Gemini, …).

See [sdks/vscode/README.md](sdks/vscode/README.md).

---

## Chat history

| Surface | How |
|---------|-----|
| CLI/TUI | `localcoder --continue`, `/sessions`, recent list on home |
| VS Code | Session button in chat header; restores per workspace |
| Desktop | Same server sessions as CLI |

---

## Troubleshooting

### Windows

| Symptom | Fix |
|---------|-----|
| `Cannot find module '...\localcoder\bin\localcoder'` | `npm uninstall -g localcoder`, then `bun run install:cli`. |
| `require is not defined` after global install | Linked dev package instead of `dist/npm/localcoder`. Reinstall via `install:cli`. |
| `localcoder` not on PATH | Add `%AppData%\npm` to PATH; restart terminal. |
| Double-click `localcoder.exe` shows help | Expected — CLI is terminal-first. Use desktop portable exe for GUI. |
| VS Code chat empty / backend error | Build CLI; set `localcoder.packagePath`; run provider wizard (⚙ or first-run). |
| Invalid model hangs | Update to latest build — invalid `-m provider/model` fails in ~2s with suggestions. |

### llama.cpp

| Symptom | Fix |
|---------|-----|
| Model not found | Run `localcoder llamacpp setup` or VS Code/desktop wizard. |
| Server not starting | Check `localcoder llamacpp status`; verify `llama-server.exe` in chosen folder. |
| Out of VRAM | Lower context in wizard (try 8192 or 4096). |

### General

| Symptom | Fix |
|---------|-----|
| Wrong platform binary after npm install | Re-run install on target machine. |
| Plugin 404 on startup | Harmless on bundled builds; update to latest if noisy. |

---

## CI release builds

Push tag `v*` to trigger GitHub Actions: CLI archives, desktop portable/installer, npm publish.

Workflow: [.github/workflows/release.yml](.github/workflows/release.yml)
