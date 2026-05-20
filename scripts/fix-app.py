from pathlib import Path
app = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/app.tsx")
t = app.read_text(encoding="utf-8")
t = t.replace("`r`n", "\n").replace("`n", "\n")
app.write_text(t, encoding="utf-8")
dlg = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/component/dialog-llama.tsx")
d = dlg.read_text(encoding="utf-8")
if "import type { LlamaServerStatus }" not in d:
    d = 'import type { LlamaServerStatus } from "@tui/llama-server"\n' + d
dlg.write_text(d, encoding="utf-8")
e = Path(r"P:/localcoder/scripts/e2e-llamacpp.ts")
et = e.read_text(encoding="utf-8")
if "LOCALCODER_LLAMACPP_DIR" not in et:
    et = et.replace(
        'const LLAMA_DIR = "P:\\llama cpp\\llama-b9222-bin-win-cuda-13.1-x64"',
        'const LLAMA_DIR = process.env.LOCALCODER_LLAMACPP_DIR ?? "P:\\\\llama cpp\\\\llama-b9222-bin-win-cuda-13.1-x64"',
    ).replace(
        'const MODEL_PATH = "P:\\gguf models\\Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled.IQ4_XS.gguf"',
        'const MODEL_PATH = process.env.LOCALCODER_LLAMACPP_MODEL ?? "P:\\\\gguf models\\\\Qwen3.6-35B-A3B-Claude-4.7-Opus-Reasoning-Distilled.IQ4_XS.gguf"',
    )
    e.write_text(et, encoding="utf-8")
isc = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/component/input-shortcuts.tsx")
s = isc.read_text(encoding="utf-8").replace(" wrapMode=\"word\"", "")
isc.write_text(s, encoding="utf-8")
print("fixed")
