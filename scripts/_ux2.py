from pathlib import Path

ROOT = Path(r"P:/localcoder/packages/localcoder")

def patch(path, old, new):
    p = Path(path)
    t = p.read_text(encoding="utf-8")
    if old not in t:
        raise SystemExit(f"missing {p.name}: {old[:80]!r}")
    p.write_text(t.replace(old, new, 1), encoding="utf-8", newline="\n")
    print("ok", p.name)

# llama-server.ts full rewrite of top section
llama = ROOT / "src/cli/cmd/tui/llama-server.ts"
t = llama.read_text(encoding="utf-8")
old_block = """const DEFAULT_LLAMA_DIR =
  process.env.LOCALCODER_LLAMACPP_DIR ?? String.raw`P:\\llama cpp\\llama-b9222-bin-win-cuda-13.1-x64`
const DEFAULT_MODEL =
  process.env.LOCALCODER_LLAMACPP_MODEL ??
  String.raw`P:\\gguf models\\Qwopus3.5-9B-Coder-MTP-Q6_K.gguf`"""

new_block = """import * as LlamaSetup from "./llamacpp-setup\""""

if old_block in t:
    t = t.replace(old_block, new_block)
    t = t.replace(
        'import { spawn, type ChildProcess } from "child_process"',
        'import { spawn, type ChildProcess } from "child_process"\nimport * as LlamaSetup from "./llamacpp-setup"',
    )
    # remove duplicate import if added twice
    t = t.replace('import * as LlamaSetup from "./llamacpp-setup"\nimport * as LlamaSetup from "./llamacpp-setup"', 'import * as LlamaSetup from "./llamacpp-setup"')

# replace llamaServerArgs to use MTP conditionally
patch_content = """export function llamaServerArgs(cfg: LlamaServerConfig): string[] {
  const args = [
    "-m",
    cfg.modelPath,
    "--host",
    "127.0.0.1",
    "--port",
    String(cfg.port),
    "-c",
    String(cfg.ctx),
    "--jinja",
    "--spec-type",
    "draft-mtp",
    "--spec-draft-n-max",
    process.env.LLAMACPP_MTP_DRAFT ?? "2",
  ]
  const parallel = process.env.LLAMACPP_PARALLEL
  if (parallel) args.push("-np", parallel)
  const ngl = process.env.LLAMACPP_NGL
  if (ngl) args.push("-ngl", ngl)
  return args
}"""

new_args = """export function llamaServerArgs(cfg: LlamaServerConfig): string[] {
  const args = [
    "-m",
    cfg.modelPath,
    "--host",
    "127.0.0.1",
    "--port",
    String(cfg.port),
    "-c",
    String(cfg.ctx),
    "--jinja",
  ]
  if (LlamaSetup.modelUsesMtp(cfg.modelPath)) {
    args.push("--spec-type", "draft-mtp", "--spec-draft-n-max", process.env.LLAMACPP_MTP_DRAFT ?? "2")
  }
  const parallel = process.env.LLAMACPP_PARALLEL
  if (parallel) args.push("-np", parallel)
  const ngl = process.env.LLAMACPP_NGL
  if (ngl) args.push("-ngl", ngl)
  return args
}"""

t = t.replace(patch_content, new_args)

t = t.replace(
    """export function getConfig(): LlamaServerConfig {
  const apiUrl = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"
  const llamaDir = DEFAULT_LLAMA_DIR
  return {
    llamaDir,
    modelPath: DEFAULT_MODEL,""",
    """export function getConfig(): LlamaServerConfig {
  const apiUrl = process.env.LLAMACPP_API_URL ?? "http://127.0.0.1:8080/v1"
  const llamaDir = LlamaSetup.resolveLlamaDir()
  const modelPath = LlamaSetup.resolveModelPath() ?? ""
  return {
    llamaDir,
    modelPath,""")

# better error when no model
t = t.replace(
    '    throw new Error(`GGUF model not found: ${cfg.modelPath}`)',
    '    throw new Error(\n      cfg.modelPath\n        ? `GGUF model not found: ${cfg.modelPath}`\n        : `No GGUF model configured. Set LOCALCODER_LLAMACPP_MODEL or save a path in ${LlamaSetup.configPath()}`,\n    )',
)

llama.write_text(t, encoding="utf-8", newline="\n")
print("ok llama-server.ts")

# use-connected
patch(ROOT / "src/cli/cmd/tui/component/use-connected.tsx",
    """export function useConnected() {
  const sync = useSync()
  return createMemo(() =>
    sync.data.provider.some((x) => x.id !== "localcoder" || Object.values(x.models).some((y) => y.cost?.input !== 0)),
  )
}""",
    """export function useConnected() {
  const sync = useSync()
  return createMemo(() =>
    sync.data.provider.some((x) => {
      if (x.id === "llamacpp" && Object.keys(x.models).length > 0) return true
      if (x.id !== "localcoder") return Object.keys(x.models).length > 0
      return Object.values(x.models).some((y) => y.cost?.input !== 0)
    }),
  )
}

export function hasLlamaCppProvider() {
  const sync = useSync()
  return createMemo(() => sync.data.provider.some((x) => x.id === "llamacpp"))
}""")

# context-usage helpers
patch(ROOT / "src/cli/cmd/tui/util/context-usage.ts",
    'export function contextLevelColor(',
    '''export function isLocalProvider(providerID: string) {
  return providerID === "llamacpp"
}

export function formatSessionCost(cost: number, providerID?: string) {
  if (cost <= 0) return undefined
  if (providerID && isLocalProvider(providerID)) return undefined
  return cost
}

export function homeModelHint(input: {
  model?: { providerID: string; modelID: string }
  providers: Array<{ id: string; models: Record<string, unknown> }>
}) {
  if (input.model) {
    return `${input.model.providerID}/${input.model.modelID}`
  }
  const llama = input.providers.find((p) => p.id === "llamacpp")
  if (llama && Object.keys(llama.models).length > 0) {
    return "llamacpp ready — /llama to manage"
  }
  return "No model — /connect or /llama"
}

export function contextLevelColor(''')

# qwen.txt generic
(ROOT / "src/session/prompt/qwen.txt").write_text(
    (ROOT / "src/session/prompt/qwen.txt").read_text(encoding="utf-8").replace(
        "# Agentic coding (Qwopus / Qwen local)",
        "# Agentic coding (Qwen-family local & cloud models)",
    ),
    encoding="utf-8",
    newline="\n",
)
print("qwen.txt")

print("batch2 done")
