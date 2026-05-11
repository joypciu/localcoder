import { sentryVitePlugin } from "@sentry/vite-plugin"
import { defineConfig } from "electron-vite"
import appPlugin from "@localcoder-ai/app/vite"
import solid from "vite-plugin-solid"
import * as fs from "node:fs/promises"

/** Legacy OpenCode-derived web app. Set LOCALCODER_LEGACY_UI=1 to restore. */
const legacyUI = process.env.LOCALCODER_LEGACY_UI === "1"

const channel = (() => {
  const raw = process.env.LOCALCODER_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

const standalone = process.env.LOCALCODER_STANDALONE === "1"

const LOCALCODER_SERVER_DIST = "../localcoder/dist/node"

const nodePtyPkg = `@lydell/node-pty-${process.platform}-${process.arch}`

/** Mirror packages/localcoder/script/build.ts — Rollup must not bundle OAuth helpers */
const oauthExternals = [
  "mcp-oauth",
  "poe-oauth",
  "opencode-poe-auth",
  "opencode-gitlab-auth",
  "@gitlab/opencode-gitlab-auth",
]


const sentry =
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? sentryVitePlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        telemetry: false,
        release: {
          name: process.env.SENTRY_RELEASE ?? process.env.VITE_SENTRY_RELEASE,
        },
        sourcemaps: {
          assets: "./out/renderer/**",
          filesToDeleteAfterUpload: "./out/renderer/**/*.map",
        },
      })
    : false

export default defineConfig({
  main: {
    define: {
      "import.meta.env.LOCALCODER_CHANNEL": JSON.stringify(channel),
      __LOCALCODER_LEGACY_UI__: JSON.stringify(legacyUI),
    },
    build: {
      externalizeDeps: { include: [nodePtyPkg, ...oauthExternals] },
      rollupOptions: {
        input: { index: "src/main/index.ts" },
        external: oauthExternals,
      },
    },
    plugins: [
      {
        name: "localcoder:node-pty-narrower",
        enforce: "pre",
        resolveId(s) {
          if (s === "@lydell/node-pty") return nodePtyPkg
        },
      },
      {
        name: "localcoder:virtual-server-module",
        enforce: "pre",
        resolveId(id) {
          if (id === "virtual:localcoder-server") return this.resolve(`${LOCALCODER_SERVER_DIST}/node.js`)
        },
      },
      {
        name: "localcoder:copy-server-assets",
        async writeBundle() {
          for (const l of await fs.readdir(LOCALCODER_SERVER_DIST)) {
            if (!l.endsWith(".wasm")) continue
            await fs.writeFile(`./out/main/chunks/${l}`, await fs.readFile(`${LOCALCODER_SERVER_DIST}/${l}`))
          }
        },
      },
    ],
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: "src/preload/index.ts" },
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    plugins: legacyUI ? [appPlugin, sentry].filter(Boolean) : [solid(), sentry].filter(Boolean),
    publicDir: legacyUI ? "../../../app/public" : false,
    root: "src/renderer",
    define: {
      "import.meta.env.VITE_LOCALCODER_CHANNEL": JSON.stringify(channel),
      "import.meta.env.VITE_LOCALCODER_LEGACY_UI": JSON.stringify(legacyUI ? "1" : "0"),
    },
    build: {
      sourcemap: !standalone,
      rollupOptions: {
        input: legacyUI
          ? {
              main: "src/renderer/index.html",
              loading: "src/renderer/loading.html",
            }
          : {
              main: "src/renderer/shell.html",
              loading: "src/renderer/loading.html",
            },
        external: oauthExternals,
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return
            if (id.includes("shiki") || id.includes("@shikijs")) return "vendor-shiki"
            if (id.includes("@sentry")) return "vendor-sentry"
            if (id.includes("ghostty-web")) return "vendor-terminal"
            if (id.includes("luxon")) return "vendor-luxon"
          },
        },
      },
    },
  },
})
