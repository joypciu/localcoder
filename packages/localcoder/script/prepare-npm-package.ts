#!/usr/bin/env bun
/**
 * Assemble npm-installable package from built platform binaries in dist/.
 * Usage: bun run script/prepare-npm-package.ts
 * Registry publish: NPM_PREPARE_REGISTRY=1 bun run script/prepare-npm-package.ts
 * Then: cd dist/npm/localcoder && npm install -g .
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import pkg from "../package.json"

const dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(dir, "..")
const distDir = path.join(root, "dist")
const outDir = path.join(distDir, "npm", "localcoder")
const version = pkg.version
const forRegistry = process.env.NPM_PREPARE_REGISTRY === "1"

function platformBinaryName(platform: string) {
  return platform === "windows" ? "localcoder.exe" : "localcoder"
}

function embedLocalBinary(outDir: string, distDir: string) {
  const { platform, arch } = (() => {
    switch (process.platform) {
      case "darwin":
        return { platform: "darwin", arch: process.arch === "arm64" ? "arm64" : "x64" }
      case "win32":
        return { platform: "windows", arch: process.arch === "arm64" ? "arm64" : "x64" }
      case "linux":
        return { platform: "linux", arch: process.arch === "arm64" ? "arm64" : "x64" }
      default:
        return { platform: process.platform, arch: process.arch }
    }
  })()

  const packageName = `localcoder-${platform}-${arch}`
  const source = path.join(distDir, packageName, "bin", platformBinaryName(platform))
  if (!fs.existsSync(source)) {
    console.warn(`Local embed skipped: ${source} not found`)
    return false
  }

  const binDir = path.join(outDir, "bin")
  fs.mkdirSync(binDir, { recursive: true })
  const target = path.join(binDir, ".localcoder")
  fs.copyFileSync(source, target)

  if (platform === "windows") {
    fs.writeFileSync(
      path.join(binDir, "localcoder.cmd"),
      `@echo off

"%~dp0.localcoder" %*

exit /b %ERRORLEVEL%

`,
    )
  }

  console.log(`Embedded ${packageName} binary for local npm install`)
  return true
}


const optionalDependencies: Record<string, string> = {}
for (const name of fs.readdirSync(distDir)) {
  if (!name.startsWith("localcoder-")) continue
  const pj = path.join(distDir, name, "package.json")
  if (!fs.existsSync(pj)) continue
  const p = JSON.parse(fs.readFileSync(pj, "utf8"))
  if (forRegistry) {
    optionalDependencies[p.name] = version
  } else {
    optionalDependencies[p.name] = `file:${path.relative(outDir, path.join(distDir, name)).replace(/\\/g, "/")}`
  }
}

const hasBinaries = Object.keys(optionalDependencies).length > 0
if (!hasBinaries) {
  console.warn("No platform packages in dist/. Run: bun run build:win (or build:mac on macOS)")
  console.warn("npm install will fall back to Bun when run from the monorepo")
}

function resetOutDir(target: string) {
  if (!fs.existsSync(target)) return
  const stale = `${target}.old-${Date.now()}`
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch {
    fs.renameSync(target, stale)
    fs.rmSync(stale, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}

resetOutDir(outDir)
fs.mkdirSync(path.join(outDir, "bin"), { recursive: true })
fs.copyFileSync(path.join(root, "bin", "localcoder.cjs"), path.join(outDir, "bin", "localcoder.cjs"))
if (fs.existsSync(path.join(root, "bin", "localcoder.cmd"))) {
  fs.copyFileSync(path.join(root, "bin", "localcoder.cmd"), path.join(outDir, "bin", "localcoder.cmd"))
}
fs.copyFileSync(path.join(root, "script", "postinstall.mjs"), path.join(outDir, "postinstall.mjs"))
const license = path.join(root, "../../LICENSE")
if (fs.existsSync(license)) fs.copyFileSync(license, path.join(outDir, "LICENSE"))

const readme = `# localcoder

Install: \`npm install -g localcoder\`

- **CLI** — terminal agent (\`localcoder\`)
- **Desktop** — Electron app (Windows NSIS installer, macOS .dmg) from [GitHub Releases](https://github.com/joypciu/localcoder/releases)
- **VS Code** — \`sdks/vscode\` extension

Platform binaries: \`localcoder-windows-x64\`, \`localcoder-darwin-arm64\`, etc.
`
fs.writeFileSync(path.join(outDir, "README.md"), readme)

const npmPkg = {
  name: "localcoder",
  version,
  description: "AI coding agent for the terminal — LocalCoder CLI",
  license: "MIT",
  repository: { type: "git", url: "https://github.com/joypciu/localcoder.git" },
  homepage: "https://github.com/joypciu/localcoder",
  bugs: { url: "https://github.com/joypciu/localcoder/issues" },
  keywords: ["ai", "coding", "agent", "cli", "llm", "localcoder"],
  bin: { localcoder: "./bin/localcoder.cjs", ...(fs.existsSync(path.join(outDir, "bin", "localcoder.cmd")) ? { "localcoder.cmd": "./bin/localcoder.cmd" } : {}) },
  scripts: { postinstall: "node ./postinstall.mjs" },
  optionalDependencies,
  engines: { node: ">=18" },
}

const embedded = !forRegistry && embedLocalBinary(outDir, distDir)
if (embedded) {
  delete (npmPkg as { optionalDependencies?: Record<string, string> }).optionalDependencies
  npmPkg.scripts = {}
}

fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify(npmPkg, null, 2) + "\n")
console.log(`Prepared ${outDir} (${forRegistry ? "registry" : "local"} mode)`)
console.log(`Platforms: ${Object.keys(optionalDependencies).join(", ") || "none"}`)
console.log("Install: cd dist/npm/localcoder && npm install -g .")
console.log("Publish: NPM_PREPARE_REGISTRY=1 bun run prepare:npm && cd dist/npm/localcoder && npm publish --access public")
