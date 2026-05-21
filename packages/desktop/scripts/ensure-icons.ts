#!/usr/bin/env bun
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const prodIcon = path.join(desktopRoot, "icons/prod/icon.png")
const prodDock = path.join(desktopRoot, "icons/prod/dock.png")
const fallbackIcon = path.resolve(desktopRoot, "../../sdks/vscode/images/icon.png")

function sourceIcon(): string {
  if (fs.existsSync(prodIcon)) return prodIcon
  if (fs.existsSync(fallbackIcon)) {
    console.warn(`Using fallback icon (may be <512px): ${fallbackIcon}`)
    return fallbackIcon
  }
  console.error("Missing desktop icon. Add packages/desktop/icons/prod/icon.png (512x512).")
  process.exit(1)
}

const icon = sourceIcon()
const dock = fs.existsSync(prodDock) ? prodDock : icon

for (const channel of ["dev", "beta", "prod"]) {
  const dir = path.join(desktopRoot, "icons", channel)
  fs.mkdirSync(dir, { recursive: true })
  for (const [src, name] of [[icon, "icon.png"], [dock, "dock.png"]] as const) {
    const dest = path.join(dir, name)
    if (channel === "prod" && fs.existsSync(dest) && fs.statSync(dest).size > 50_000) {
      continue
    }
    fs.copyFileSync(src, dest)
  }
}

const resIcons = path.join(desktopRoot, "resources/icons")
fs.mkdirSync(resIcons, { recursive: true })
console.log(`Desktop icons ready (source: ${icon})`)
