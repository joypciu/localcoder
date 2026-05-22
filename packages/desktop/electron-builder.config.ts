import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const signScript = path.join(rootDir, "script", "sign-windows.ps1")
const ci = process.env.GITHUB_ACTIONS === "true"
const standalone = process.env.LOCALCODER_STANDALONE === "1"
const fastPack = process.env.LOCALCODER_FAST_PACK === "1"
const isWin = process.platform === "win32"
const isWinX64 = isWin && process.arch === "x64"

async function signWindows(configuration: { path: string }) {
  if (!ci || !isWin) return
  await execFileAsync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", signScript, configuration.path],
    { cwd: rootDir },
  )
}

const channel = (() => {
  const raw = process.env.LOCALCODER_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

const ptyUnpack = isWinX64
  ? ["**/@lydell/node-pty-win32-x64/**"]
  : isWin
    ? ["**/@lydell/node-pty-win32-arm64/**"]
    : ["**/@lydell/node-pty-*/**"]

const getBase = (): Configuration => ({
  artifactName: "localcoder-desktop-${os}-${arch}.${ext}",
  directories: {
    output: process.env.LOCALCODER_BUILD_OUTPUT ?? "dist",
    buildResources: "resources",
  },
  files: [
    "out/**/*",
    "resources/**/*",
    "package.json",
    "!**/*.map",
    "!**/node_modules/@lydell/node-pty-darwin-*",
    "!**/node_modules/@lydell/node-pty-linux-*",
    ...(isWinX64 ? ["!**/node_modules/@lydell/node-pty-win32-arm64"] : []),
    ...(isWin && process.arch === "arm64" ? ["!**/node_modules/@lydell/node-pty-win32-x64"] : []),
  ],
  asarUnpack: ["**/*.node", ...ptyUnpack],
  extraResources:
    process.platform === "darwin"
      ? [
          {
            from: "native/",
            to: "native/",
            filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"],
          },
        ]
      : [],
  npmRebuild: false,
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,
  removePackageScripts: true,
  mac: {
    category: "public.app-category.developer-tools",
    icon: `resources/icons/icon.png`,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    notarize: Boolean(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD),
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: Boolean(process.env.APPLE_ID),
  },
  protocols: {
    name: "LocalCoder",
    schemes: ["localcoder"],
  },
  win: {
    icon: `resources/icons/icon.png`,
    signAndEditExecutable: ci,
    verifyUpdateCodeSignature: false,
    ...(ci ? { signtoolOptions: { sign: signWindows } } : {}),
    target: fastPack
      ? [{ target: "dir", arch: ["x64"] }]
      : standalone
        ? [{ target: "portable", arch: ["x64"] }]
        : [
            { target: "portable", arch: ["x64"] },
            { target: "nsis", arch: ["x64"] },
          ],
  },
  portable: {
    artifactName: "LocalCoder-${version}-portable.${ext}",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: `resources/icons/icon.ico`,
    installerHeaderIcon: `resources/icons/icon.ico`,
  },
  linux: {
    icon: `resources/icons`,
    category: "Development",
    target: ["AppImage", "deb", "rpm"],
  },
})

function getConfig() {
  const base = getBase()

  switch (channel) {
    case "dev": {
      return {
        ...base,
        appId: "ai.localcoder.desktop.dev",
        productName: "LocalCoder Dev",
        rpm: { packageName: "localcoder-dev" },
      }
    }
    case "beta": {
      return {
        ...base,
        appId: "ai.localcoder.desktop.beta",
        productName: "LocalCoder Beta",
        protocols: { name: "LocalCoder Beta", schemes: ["localcoder"] },
        publish: ci ? null : { provider: "github", owner: "joypciu", repo: "localcoder", prerelease: true, channel: "latest" },
        rpm: { packageName: "localcoder-beta" },
      }
    }
    case "prod": {
      return {
        ...base,
        appId: "ai.localcoder.desktop",
        productName: "LocalCoder",
        protocols: { name: "LocalCoder", schemes: ["localcoder"] },
        publish: ci ? null : { provider: "github", owner: "joypciu", repo: "localcoder", channel: "latest" },
        rpm: { packageName: "localcoder" },
      }
    }
  }
}

export default getConfig()

