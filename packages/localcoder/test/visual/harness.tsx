/** @jsxImportSource @opentui/solid */
import { onMount, type JSX } from "solid-js"
import { testRender } from "@opentui/solid"
import { Global } from "@localcoder-ai/core/global"
import { ArgsProvider } from "../../src/cli/cmd/tui/context/args"
import { ExitProvider } from "../../src/cli/cmd/tui/context/exit"
import { KVProvider } from "../../src/cli/cmd/tui/context/kv"
import { ProjectProvider } from "../../src/cli/cmd/tui/context/project"
import { SDKProvider, type EventSource } from "../../src/cli/cmd/tui/context/sdk"
import { SyncProvider, useSync } from "../../src/cli/cmd/tui/context/sync"
import { ThemeProvider } from "../../src/cli/cmd/tui/context/theme"
import { LocalProvider } from "../../src/cli/cmd/tui/context/local"
import { KeyboardLayerProvider } from "../../src/cli/cmd/tui/context/keyboard-layer"
import { KeybindProvider } from "../../src/cli/cmd/tui/context/keybind"
import { TuiConfigProvider } from "../../src/cli/cmd/tui/context/tui-config"
import { RouteProvider } from "../../src/cli/cmd/tui/context/route"
import { ToastProvider } from "../../src/cli/cmd/tui/ui/toast"
import { DialogProvider, useDialog } from "../../src/cli/cmd/tui/ui/dialog"
import type { TuiConfig } from "../../src/cli/cmd/tui/config/tui"
import { tmpdir } from "../fixture/fixture"

const worktree = "/tmp/localcoder"
const directory = `${worktree}/packages/localcoder`

export async function wait(fn: () => boolean, timeout = 3000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  })
}

function eventSource(): EventSource {
  return {
    subscribe: async () => () => {},
  }
}

export function createVisualFetch(options?: { sessions?: Array<Record<string, unknown>> }) {
  const fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))

    switch (url.pathname) {
      case "/agent":
      case "/command":
      case "/experimental/workspace":
      case "/experimental/workspace/status":
      case "/formatter":
      case "/lsp":
        return json([])
      case "/config":
      case "/experimental/resource":
      case "/mcp":
      case "/provider/auth":
      case "/session/status":
        return json({})
      case "/config/providers":
        return json({ providers: {}, default: {} })
      case "/experimental/console":
        return json({ consoleManagedProviders: [], switchableOrgCount: 0 })
      case "/path":
        return json({ home: "", state: "", config: "", worktree, directory })
      case "/project/current":
        return json({ id: "proj_test" })
      case "/provider":
        return json({
          all: [
            { id: "openai", name: "OpenAI" },
            { id: "llama", name: "Llama" },
            { id: "anthropic", name: "Anthropic" },
            { id: "fireworks-ai", name: "Fireworks" },
          ],
          default: {},
          connected: [],
        })
      case "/session":
        return json(options?.sessions ?? [])
      case "/vcs":
        return json({ branch: "main" })
    }

    throw new Error(`unexpected request: ${url.pathname}`)
  }) as typeof globalThis.fetch

  return fetch
}

export type VisualMount = {
  app: Awaited<ReturnType<typeof testRender>>
  dialog: ReturnType<typeof useDialog>
  sync: ReturnType<typeof useSync>
  destroy: () => Promise<void>
}

export async function mountVisualDialog(
  content: () => JSX.Element,
  options?: { sessions?: Array<Record<string, unknown>> },
): Promise<VisualMount> {
  const previous = Global.Path.state
  const tmp = await tmpdir()
  Global.Path.state = tmp.path
  await Bun.write(`${tmp.path}/kv.json`, "{}")

  let dialog!: ReturnType<typeof useDialog>
  let sync!: ReturnType<typeof useSync>
  let ready!: () => void
  const gate = new Promise<void>((resolve) => {
    ready = resolve
  })

  const config = {} as TuiConfig.Info
  const app = await testRender(
    () => (
      <ArgsProvider>
        <ExitProvider>
          <KVProvider>
            <ToastProvider>
              <RouteProvider>
                <TuiConfigProvider config={config}>
                  <SDKProvider url="http://test" directory={directory} fetch={createVisualFetch(options)} events={eventSource()}>
                    <ProjectProvider>
                      <SyncProvider>
                        <ThemeProvider mode="dark">
                          <LocalProvider>
                            <KeyboardLayerProvider>
                              <KeybindProvider>
                                <DialogProvider>
                                  <Probe
                                    onReady={(ctx) => {
                                      dialog = ctx.dialog
                                      sync = ctx.sync
                                      ready()
                                    }}
                                  />
                                </DialogProvider>
                              </KeybindProvider>
                            </KeyboardLayerProvider>
                          </LocalProvider>
                        </ThemeProvider>
                      </SyncProvider>
                    </ProjectProvider>
                  </SDKProvider>
                </TuiConfigProvider>
              </RouteProvider>
            </ToastProvider>
          </KVProvider>
        </ExitProvider>
      </ArgsProvider>
    ),
    { width: 100, height: 32 },
  )

  await gate
  await wait(() => sync.status === "complete")
  dialog.replace(content)
  await app.renderOnce()
  await Bun.sleep(20)

  return {
    app,
    dialog,
    sync,
    async destroy() {
      app.renderer.destroy()
      Global.Path.state = previous
      await tmp[Symbol.asyncDispose]()
    },
  }
}

function Probe(props: { onReady: (ctx: { dialog: ReturnType<typeof useDialog>; sync: ReturnType<typeof useSync> }) => void }) {
  const dialog = useDialog()
  const sync = useSync()
  onMount(() => props.onReady({ dialog, sync }))
  return <box />
}

export function captureFrame(app: VisualMount["app"]): string {
  return app.captureCharFrame()
}

export async function driveSelect(app: VisualMount["app"], direction: "down" | "up", count = 1) {
  for (let i = 0; i < count; i++) {
    app.mockInput.pressArrow(direction)
    await app.renderOnce()
  }
}

export async function driveEnter(app: VisualMount["app"]) {
  app.mockInput.pressEnter()
  await app.renderOnce()
  await Bun.sleep(20)
}
