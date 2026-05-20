# Installing LocalCoder

## npm (recommended)

```bash
npm install -g localcoder
```

Then run from any terminal (CMD, PowerShell, or bash):

```bash
localcoder --version
localcoder
```

The `localcoder` package installs a small Node launcher plus a **platform-specific binary** as an optional dependency:

| Platform | npm package |
|----------|-------------|
| Windows x64 | `localcoder-windows-x64` |
| Windows arm64 | `localcoder-windows-arm64` |
| macOS Apple Silicon | `localcoder-darwin-arm64` |
| macOS Intel | `localcoder-darwin-x64` |
| Linux x64 / arm64 | `localcoder-linux-x64`, `localcoder-linux-arm64`, … |

## From source (monorepo)

```bash
git clone https://github.com/joypciu/localcoder.git
cd localcoder/packages/localcoder
bun install
npm link
```

Requires [Bun](https://bun.sh). The `localcoder` command uses Bun to run the CLI when no native binary is present.

## Build Windows / Mac executables locally

```bash
cd packages/localcoder
bun run build:win    # Windows .exe
bun run build:mac    # macOS binary (on macOS or cross-compile)
bun run build:desktop # both (slow on Windows)
bun run prepare:npm   # assemble dist/npm/localcoder for npm link / publish
cd dist/npm/localcoder && npm link -g
```

CI builds all platform binaries on tag push (see `.github/workflows/release-cli.yml`).

## curl installer (Unix)

```bash
curl -fsSL https://raw.githubusercontent.com/joypciu/localcoder/main/install | bash
```


## Desktop app (Electron)

Rich UI with the same agent as the CLI.

| Platform | Artifact |
|----------|----------|
| Windows | NSIS installer (`localcoder-desktop-win-x64.exe`) |
| macOS | `.dmg` (drag **LocalCoder** to Applications) |

Download from [GitHub Releases](https://github.com/joypciu/localcoder/releases) or build locally (see `packages/desktop/README.md`).

```bash
cd packages/desktop
bun run prebuild && bun run build
# Windows
set LOCALCODER_CHANNEL=prod && bun run package:win
# macOS
LOCALCODER_CHANNEL=prod bun run package:mac
```
