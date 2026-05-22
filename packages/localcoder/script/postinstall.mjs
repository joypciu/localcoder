#!/usr/bin/env node

import fs from "fs"
import path from "path"
import os from "os"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function detectPlatformAndArch() {
  // Map platform names
  let platform
  switch (os.platform()) {
    case "darwin":
      platform = "darwin"
      break
    case "linux":
      platform = "linux"
      break
    case "win32":
      platform = "windows"
      break
    default:
      platform = os.platform()
      break
  }

  // Map architecture names
  let arch
  switch (os.arch()) {
    case "x64":
      arch = "x64"
      break
    case "arm64":
      arch = "arm64"
      break
    case "arm":
      arch = "arm"
      break
    default:
      arch = os.arch()
      break
  }

  return { platform, arch }
}


function findBinaryFromDistSibling() {
  const { platform, arch } = detectPlatformAndArch()
  const packageName = `localcoder-${platform}-${arch}`
  const binaryName = platform === "windows" ? "localcoder.exe" : "localcoder"

  let current = __dirname
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(current, packageName, "bin", binaryName)
    if (fs.existsSync(candidate)) {
      return { binaryPath: candidate, binaryName }
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  throw new Error(`Could not find sibling platform package ${packageName}`)
}

function findBinary() {
  const { platform, arch } = detectPlatformAndArch()
  const packageName = `localcoder-${platform}-${arch}`
  const binaryName = platform === "windows" ? "localcoder.exe" : "localcoder"

  try {
    // Use require.resolve to find the package
    const packageJsonPath = require.resolve(`${packageName}/package.json`)
    const packageDir = path.dirname(packageJsonPath)
    const binaryPath = path.join(packageDir, "bin", binaryName)

    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Binary not found at ${binaryPath}`)
    }

    return { binaryPath, binaryName }
  } catch (error) {
    return findBinaryFromDistSibling()
  }
}

async function main() {
  try {
    if (os.platform() === "win32") {
      const { binaryPath } = findBinary()
      const target = path.join(__dirname, "bin", ".localcoder")
      fs.copyFileSync(binaryPath, target)
      console.log("Windows: linked platform binary for npm launcher")
      const cmdShim = path.join(__dirname, "bin", "localcoder.cmd")
      const shim = `@echo off

"%~dp0.localcoder" %*

exit /b %ERRORLEVEL%

`
      fs.writeFileSync(cmdShim, shim)
      console.log("Windows: wrote bin/localcoder.cmd shim")

      return
    }

    // On non-Windows platforms, just verify the binary package exists
    // Don't replace the wrapper script - it handles binary execution
    const { binaryPath } = findBinary()
    const target = path.join(__dirname, "bin", ".localcoder")
    if (fs.existsSync(target)) fs.unlinkSync(target)
    try {
      fs.linkSync(binaryPath, target)
    } catch {
      fs.copyFileSync(binaryPath, target)
    }
    fs.chmodSync(target, 0o755)
  } catch (error) {
    console.error("Failed to setup localcoder binary:", error.message)
    process.exit(1)
  }
}

try {
  void main()
} catch (error) {
  console.error("Postinstall script error:", error.message)
  process.exit(0)
}
