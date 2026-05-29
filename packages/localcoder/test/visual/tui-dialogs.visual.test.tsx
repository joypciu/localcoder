/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import path from "path"
import { assertTextSnapshot } from "../../../../scripts/visual-test/lib/snapshot"
import { TUI_SNAPSHOTS } from "../../../../scripts/visual-test/lib/paths"
import { DialogPrompt } from "../../src/cli/cmd/tui/ui/dialog-prompt"
import { DialogSelect } from "../../src/cli/cmd/tui/ui/dialog-select"
import { DialogProvider as ConnectDialog } from "../../src/cli/cmd/tui/component/dialog-provider"
import { DialogLlamaConnect } from "../../src/cli/cmd/tui/component/dialog-llama-setup"
import { DialogSessionList } from "../../src/cli/cmd/tui/component/dialog-session-list"
import * as LlamaSetup from "../../src/llamacpp/setup"
import { captureFrame, driveEnter, driveSelect, mountVisualDialog } from "./harness"

const UPDATE = process.env.VISUAL_UPDATE === "1"
const SNAPSHOT_DIR = path.join(TUI_SNAPSHOTS)

function snap(name: string, frame: string) {
  const result = assertTextSnapshot({ name, actual: frame, dir: SNAPSHOT_DIR, update: UPDATE })
  if (!result.ok) {
    throw new Error(`${result.message}${result.diffPath ? `: ${result.diffPath}` : ""}`)
  }
  return result
}

describe("visual tui dialogs", () => {
  test("dialog-prompt wraps string descriptions without orphan text errors", async () => {
    const mount = await mountVisualDialog(() => (
      <DialogPrompt
        title="llama.cpp folder"
        placeholder="C:\\llama"
        description="Folder containing llama-server (not the GGUF file)"
        onConfirm={() => {}}
      />
    ))

    const frame = captureFrame(mount.app)
    expect(frame).toContain("llama.cpp folder")
    expect(frame).toContain("llama-server")
    snap("dialog-prompt-string-description", frame)
    await mount.destroy()
  })

  test("connect dialog lists local llama.cpp first", async () => {
    const mount = await mountVisualDialog(() => <ConnectDialog />)

    const frame = captureFrame(mount.app)
    expect(frame.indexOf("llama.cpp (local GGUF)")).toBeLessThan(frame.indexOf("OpenAI"))
    expect(frame).toContain("Meta cloud API")
    snap("dialog-connect-providers", frame)
    await mount.destroy()
  })

  test("llama connect menu renders setup options", async () => {
    const mount = await mountVisualDialog(() => <DialogLlamaConnect />)

    const frame = captureFrame(mount.app)
    expect(frame).toContain("Set up or change folder")
    expect(frame).toContain("Pick llama")
    snap("dialog-llama-connect-menu", frame)
    await mount.destroy()
  })

  test("connect dialog navigation opens llama setup screen", async () => {
    const mount = await mountVisualDialog(() => <ConnectDialog />)

    await driveEnter(mount.app)
    const frame = captureFrame(mount.app)
    expect(frame).toContain("llama.cpp (local GGUF)")
    expect(frame).toContain("Set up or change folder")
    snap("dialog-connect-to-llama-setup", frame)
    await mount.destroy()
  })

  test("llama setup wizard folder prompt renders helper text", async () => {
    const mount = await mountVisualDialog(() => <DialogLlamaConnect />)

    await driveEnter(mount.app)

    const frame = captureFrame(mount.app)
    expect(frame).toContain("llama.cpp folder")
    expect(frame).toContain("llama-server")
    snap("dialog-llama-folder-prompt", frame)
    await mount.destroy()
  })

  test("context size presets include 131072", async () => {
    const mount = await mountVisualDialog(() => (
      <DialogSelect
        title="Context size (tokens)"
        options={LlamaSetup.CONTEXT_PRESETS.map((n) => ({
          title: String(n),
          value: String(n),
        }))}
        onSelect={() => {}}
      />
    ))

    const frame = captureFrame(mount.app)
    expect(frame).toContain("131072")
    expect(frame).toContain("32768")
    snap("dialog-llama-context-presets", frame)
    await mount.destroy()
  })

  test("session list renders saved sessions", async () => {
    const now = Date.now()
    const mount = await mountVisualDialog(() => <DialogSessionList />, {
      sessions: [
        {
          id: "ses_alpha",
          title: "hello script task",
          time: { created: now - 60_000, updated: now - 30_000 },
          workspaceID: undefined,
        },
        {
          id: "ses_beta",
          title: "web search usman gani joy",
          time: { created: now - 120_000, updated: now - 90_000 },
          workspaceID: undefined,
        },
      ],
    })

    const frame = captureFrame(mount.app)
    expect(frame).toContain("hello script task")
    expect(frame).toContain("web search")
    snap("dialog-session-list", frame)
    await mount.destroy()
  })

  test("llama connect menu shows restart action", async () => {
    const mount = await mountVisualDialog(() => <DialogLlamaConnect />)
    const frame = captureFrame(mount.app)
    expect(frame).toMatch(/Restart server|Start server/)
    snap("dialog-llama-restart-option", frame)
    await mount.destroy()
  })
})
