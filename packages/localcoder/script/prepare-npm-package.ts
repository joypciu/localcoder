#!/usr/bin/env bun
/**
 * Assemble npm-installable package from built platform binaries in dist/.
 * Usage: bun run script/prepare-npm-package.ts
 * Then: cd dist/npm/localcoder && npm link -g
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

const optionalDependencies: Record<string, string> = {}
for (const name of fs.readdirSync(distDir)) {
  if (!name.startsWith("localcoder-")) continue
  const pj = path.join(distDir, name, "package.json")
  if (!fs.existsSync(pj)) continue
  const p = JSON.parse(fs.readFileSync(pj, "utf8"))
  optionalDependencies[p.name] = `file:${path.relative(outDir, path.join(distDir, name)).replace(/\\/g, "/")}`
}

const hasBinaries = Object.keys(optionalDependencies).length > 0
if (!hasBinaries) {
  console.warn("No platform packages in dist/. Run: bun run build -- --platforms=windows,darwin --skip-embed-web-ui")
    // Dev install without binaries: still emit package (bun fallback in bin/localcoder)
  console.warn("No platform binaries in dist/ — npm install will use Bun when run from monorepo")

}

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(path.join(outDir, "bin"), { recursive: true })
fs.copyFileSync(path.join(root, "bin", "localcoder"), path.join(outDir, "bin", "localcoder"))
fs.copyFileSync(path.join(root, "script", "postinstall.mjs"), path.join(outDir, "postinstall.mjs"))
const license = path.join(root, "../../LICENSE")
if (fs.existsSync(license)) fs.copyFileSync(license, path.join(outDir, "LICENSE"))

const npmPkg = {
  name: "localcoder",
  version,
  description: "AI coding agent for the terminal — localcoder CLI",
  license: "MIT",
  repository: {
    type: "git",
    url: "https://github.com/joypciu/localcoder.git",
  },
  homepage: "https://github.com/joypciu/localcoder",
  bugs: { url: "https://github.com/joypciu/localcoder/issues" },
  keywords: ["ai", "coding", "agent", "cli", "llm", "localcoder"],
  bin: { localcoder: "./bin/localcoder" },
  scripts: {
    postinstall: "node ./postinstall.mjs",
  },
  optionalDependencies,
  engines: { node: ">=18" },
}

fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify(npmPkg, null, 2) + "\n")
console.log(`Prepared ${outDir}`)
console.log(`Platforms: ${Object.keys(optionalDependencies).join(", ")}`)
console.log("Install globally: cd dist/npm/localcoder && npm link -g")
console.log("Or publish: npm publish dist/npm/localcoder --access public")
