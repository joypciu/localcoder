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

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(path.join(outDir, "bin"), { recursive: true })
fs.copyFileSync(path.join(root, "bin", "localcoder"), path.join(outDir, "bin", "localcoder"))
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
  bin: { localcoder: "./bin/localcoder" },
  scripts: { postinstall: "node ./postinstall.mjs" },
  optionalDependencies,
  engines: { node: ">=18" },
}

fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify(npmPkg, null, 2) + "\n")
console.log(`Prepared ${outDir} (${forRegistry ? "registry" : "local"} mode)`)
console.log(`Platforms: ${Object.keys(optionalDependencies).join(", ") || "none"}`)
console.log("Install: cd dist/npm/localcoder && npm install -g .")
console.log("Publish: NPM_PREPARE_REGISTRY=1 bun run prepare:npm && cd dist/npm/localcoder && npm publish --access public")
