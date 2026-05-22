from pathlib import Path
PKG = Path(r"P:/localcoder/packages/localcoder")

# fix dialog-llama imports and model set
d = (PKG / "src/cli/cmd/tui/component/dialog-llama.tsx").read_text(encoding="utf-8")
d = d.replace('import { createMemo, createSignal, Show } from "solid-js"', 'import { createMemo, createSignal } from "solid-js"')
d = d.replace('import { useTheme } from "@tui/context/theme"\n', '')
d = d.replace('import * as LlamaServer from "@tui/llama-server"', 'import * as LlamaServer from "@tui/llama-server"\nimport type { LlamaServerStatus } from "@tui/llama-server"')
d = d.replace('const [status, setStatus] = createSignal<LlamaServer.LlamaServerStatus | undefined>()', 'const [status, setStatus] = createSignal<LlamaServerStatus | undefined>()')
d = d.replace('  const { theme } = useTheme()\n', '')
d = d.replace('    local.model.set({ providerID: "llamacpp", modelID: modelId } as any)', '    local.model.set({ providerID: "llamacpp", modelID: modelId }, { recent: true })')
(PKG / "src/cli/cmd/tui/component/dialog-llama.tsx").write_text(d, encoding='utf-8')

# fix input-shortcuts
s = (PKG / "src/cli/cmd/tui/component/input-shortcuts.tsx").read_text(encoding="utf-8")
s = s.replace('  const short = "Shift+Enter · drag select · RMB menu · MMB paste"\n', '')
s = s.replace(' wrapMode="word"', '')
(PKG / "src/cli/cmd/tui/component/input-shortcuts.tsx").write_text(s, encoding='utf-8')

# fix e2e paths
e = (SCRIPTS := Path(r"P:/localcoder/scripts")) / "e2e-llamacpp.ts"
et = e.read_text(encoding="utf-8")
et = et.replace('const LLAMA_DIR = "P:\\llama cpp\\llama-b9284-bin-win-cuda-13.1-x64"', 'const LLAMA_DIR = process.env.LOCALCODER_LLAMACPP_DIR ?? "P:\\\\llama cpp\\\\llama-b9284-bin-win-cuda-13.1-x64"')
et = et.replace('const MODEL_PATH = "P:\\gguf models\\Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled.IQ4_XS.gguf"', 'const MODEL_PATH = process.env.LOCALCODER_LLAMACPP_MODEL ?? "P:\\\\gguf models\\\\Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled.IQ4_XS.gguf"')
e.write_text(et, encoding='utf-8')

# patch app.tsx
app = PKG / "src/cli/cmd/tui/app.tsx"
at = app.read_text(encoding="utf-8")
if "DialogLlama" not in at:
    at = at.replace('import { DialogThemeList } from "@tui/component/dialog-theme-list"', 'import { DialogThemeList } from "@tui/component/dialog-theme-list"\nimport { DialogLlama } from "@tui/component/dialog-llama"\nimport * as LlamaServer from "@tui/llama-server"')
if "llama.menu" not in at:
    at = at.replace(
        """    {
      title: "Connect provider",
      value: "provider.connect",""",
        """    {
      title: "llama.cpp server",
      value: "llama.menu",
      category: "Provider",
      slash: {
        name: "llama",
        aliases: ["llamacpp", "llama-server"],
      },
      onSelect: () => {
        dialog.replace(() => <DialogLlama />)
      },
    },
    {
      title: "Connect provider",
      value: "provider.connect",""",
    )
if "LlamaServer.stopIfManaged" not in at:
    at = at.replace(
        "    const onBeforeExit = async () => {\n      await TuiPluginRuntime.dispose()\n    }",
        "    const onBeforeExit = async () => {\n      LlamaServer.stopIfManaged()\n      await TuiPluginRuntime.dispose()\n    }",
    )
app.write_text(at, encoding='utf-8")

# tips
tips = PKG / "src/cli/cmd/tui/feature-plugins/home/tips-view.tsx"
tt = tips.read_text(encoding="utf-8")
if "/llama" not in tt:
    tt = tt.replace(
        '  "Run {highlight}/connect{/highlight} to add API keys for 75+ supported LLM providers",',
        '  "Run {highlight}/llama{/highlight} to start llama.cpp with your local GGUF model",\n  "Run {highlight}/connect{/highlight} to add API keys for 75+ supported LLM providers",',
    )
    tips.write_text(tt, encoding="utf-8")

# test
(PKG / "test/cli/llama-server.test.ts").write_text('''import { describe, expect, test } from "bun:test"
import { getConfig, probe } from "../../src/cli/cmd/tui/llama-server"

describe("llama-server", () => {
  test("getConfig returns Windows defaults", () => {
    const cfg = getConfig()
    expect(cfg.serverExe).toContain("llama-server")
    expect(cfg.modelPath).toContain(".gguf")
    expect(cfg.apiUrl).toContain("/v1")
  })

  test("probe returns not ok when server is down", async () => {
    const result = await probe("http://127.0.0.1:59999/v1")
    expect(result.ok).toBe(false)
  })
})
''', encoding='utf-8')

print("patches done")
