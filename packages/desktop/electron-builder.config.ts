import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const signScript = path.join(rootDir, "script", "sign-windows.ps1")

async function signWindows(configuration: { path: string }) {
  if (process.platform !== "win32") return
  if (process.env.GITHUB_ACTIONS !== "true") return

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

const getBase = (): Configuration => ({
  artifactName: "localcoder-desktop-${os}-${arch}.${ext}",
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  files: ["out/**/*", "resources/**/*"],
  extraResources: [
    {
      from: "native/",
      to: "native/",
      filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"],
    },
  ],
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
    signtoolOptions: {
      sign: signWindows,
    },
    target: ["nsis"],
    verifyUpdateCodeSignature: false,
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
        publish: process.env.CI === "true" ? null : { provider: "github", owner: "joypciu", repo: "localcoder", prerelease: true, channel: "latest" },
        rpm: { packageName: "localcoder-beta" },
      }
    }
    case "prod": {
      return {
        ...base,
        appId: "ai.localcoder.desktop",
        productName: "LocalCoder",
        protocols: { name: "LocalCoder", schemes: ["localcoder"] },
        publish: process.env.CI === "true" ? null : { provider: "github", owner: "joypciu", repo: "localcoder", channel: "latest" },
        rpm: { packageName: "localcoder" },
      }
    }
  }
}

export default getConfig()
