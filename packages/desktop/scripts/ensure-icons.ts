#!/usr/bin/env bun
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const srcIcon = path.resolve(desktopRoot, "../../sdks/vscode/images/icon.png")

if (!fs.existsSync(srcIcon)) {
  console.error(`Missing source icon: ${srcIcon}`)
  process.exit(1)
}

for (const channel of ["dev", "beta", "prod"]) {
  const dir = path.join(desktopRoot, "icons", channel)
  fs.mkdirSync(dir, { recursive: true })
  for (const name of ["icon.png", "dock.png"]) {
    fs.copyFileSync(srcIcon, path.join(dir, name))
  }
}

const resIcons = path.join(desktopRoot, "resources", "icons")
fs.mkdirSync(resIcons, { recursive: true })
fs.copyFileSync(srcIcon, path.join(resIcons, "icon.png"))
console.log(`Desktop icons ready at ${resIcons}`)
