# Installing LocalCoder

## npm (recommended)

```bash
npm install -g localcoder
localcoder --version
localcoder
```

The `localcoder` package ships a Node launcher (`bin/localcoder.cjs`) plus a **platform-specific binary** as an optional dependency:

| Platform | npm package |
|----------|-------------|
| Windows x64 | `localcoder-windows-x64` |
| Windows arm64 | `localcoder-windows-arm64` |
| macOS Apple Silicon | `localcoder-darwin-arm64` |
| macOS Intel | `localcoder-darwin-x64` |
| Linux x64 / arm64 | `localcoder-linux-x64`, `localcoder-linux-arm64`, … |

On Windows, `postinstall` copies the native `.exe` next to the launcher so `localcoder.cmd` runs without Node for normal use.

---

## From source (monorepo)

Requires [Bun](https://bun.sh).

```bash
git clone https://github.com/joypciu/localcoder.git
cd localcoder
bun install
```

### One-command global CLI (Windows)

```powershell
bun run install:cli
```

This runs `build:win` → `prepare:npm` → `npm install -g ./dist/npm/localcoder` with the Windows binary embedded.

### Manual steps

```bash
cd packages/localcoder
bun run build:win          # or build:mac on macOS
bun run prepare:npm        # assembles dist/npm/localcoder
npm install -g ./dist/npm/localcoder
```

**Important:** Install from `dist/npm/localcoder`, not from `packages/localcoder` directly. Linking the dev package breaks the global shim (`require is not defined` under `"type": "module"`).

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

## Desktop app (Electron)

Rich UI — same agent as the CLI, no terminal required at runtime.

| Platform | Artifact |
|----------|----------|
| Windows | **Portable exe** `LocalCoder-*-portable.exe` (recommended) or NSIS installer |
| macOS | `.dmg` |

**Download:** [GitHub Releases](https://github.com/joypciu/localcoder/releases)

**Build locally:**

```powershell
# From repo root — standalone portable (bundles server + UI)
bun run build:win-standalone

# Output
# packages\desktop\dist\LocalCoder-<version>-portable.exe
```

```powershell
# Fast iteration (unpacked exe, skip portable compression)
$env:LOCALCODER_FAST_PACK = "1"
bun run build:win-standalone
# Run: packages\desktop\dist\win-unpacked\LocalCoder.exe
```

See [packages/desktop/README.md](packages/desktop/README.md).

---

## VS Code extension

1. Clone the repo and open it in VS Code
2. `cd sdks/vscode && bun install`
3. Press **F5** (Extension Development Host)
4. Ensure CLI is built: `bun run install:cli` or `bun run build:win` in `packages/localcoder`
5. Set **LocalCoder: Package Path** to `packages/localcoder` if auto-detect fails

See [sdks/vscode/README.md](sdks/vscode/README.md).

---

## Chat history

| Surface | How |
|---------|-----|
| CLI/TUI | `localcoder --continue`, `/sessions`, recent list on home |
| VS Code | Session button in chat header; last session restores per workspace |
| Desktop | Same server sessions as CLI |
| Prompt reuse (TUI) | `↑`/`↓` in input (`~/.localcoder/prompt-history.jsonl`) |

---

## Troubleshooting

### Windows

| Symptom | Fix |
|---------|-----|
| `Cannot find module '...\node_modules\localcoder\bin\localcoder'` | Stale npm shim. Run `npm uninstall -g localcoder`, then `bun run install:cli` or reinstall from `dist/npm/localcoder`. |
| `require is not defined` after global install | You linked `packages/localcoder` instead of `dist/npm/localcoder`. Uninstall and use `bun run install:cli`. |
| `localcoder` not on PATH | Ensure `%AppData%\npm` is in PATH. Restart the terminal. |
| Double-click `localcoder.exe` shows help in CMD | Expected — CLI is terminal-first. Use the **desktop portable exe** for GUI. |
| VS Code chat empty / backend error | Build CLI (`bun run install:cli`); set `localcoder.packagePath`; configure a model via TUI or wizard first. |

### General

| Symptom | Fix |
|---------|-----|
| npm install succeeds but wrong platform binary | Re-run install on the target machine; optional deps are platform-specific. |
| llama.cpp model not found | Run setup: `localcoder llamacpp setup` or use the in-app / VS Code wizard. |

---

## CI release builds

Push a tag `v*` (e.g. `v1.14.43`) to trigger GitHub Actions:

- Windows + macOS CLI archives
- Desktop installers / portable exe
- npm publish (when configured)

Workflow: [.github/workflows/release.yml](.github/workflows/release.yml)
