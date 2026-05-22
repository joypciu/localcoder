import path from "path"
import { mergeDeep } from "remeda"
import { Effect } from "effect"
import { AppRuntime } from "@/effect/app-runtime"
import { Config, type Info } from "@/config/config"
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"
import * as Setup from "./setup"
import * as Server from "./server"

export type LlamaCppSetupInput = {
  llamaDir: string
  modelPath: string
  autoStart?: boolean
  ctx?: number
  thinking?: boolean
}

export type LlamaCppSetupResult = {
  model: string
  modelId?: string
  running: boolean
  alreadyRunning?: boolean
  apiUrl: string
  logPath?: string
}

function providerPatch(modelId: string, modelPath: string, apiUrl: string, ctx: number): Partial<Info> {
  const output = Number(process.env.LLAMACPP_MAX_OUTPUT ?? 4096)
  const thinking = Setup.resolveThinkingEnabled(modelPath)
  return {
    model: Server.modelRef(modelId),
    provider: {
      llamacpp: {
        npm: "@ai-sdk/openai-compatible",
        name: "llama.cpp (local)",
        options: {
          baseURL: apiUrl,
          apiKey: "not-needed",
        },
        models: {
          [modelId]: {
            name: modelId,
            tool_call: true,
            reasoning: thinking,
            ...(Setup.modelSupportsThinkingToggle(modelPath)
              ? { interleaved: { field: "reasoning_content" as const } }
              : {}),
            temperature: true,
            limit: { context: ctx, output },
          },
        },
      },
    },
  }
}

export async function getPublicStatus() {
  const cfg = Server.getConfig()
  const status = await Server.status()
  const saved = Setup.loadUserLlamaConfig()
  const modelRef = cfg.modelPath || saved.modelPath || ""
  return {
    ...status,
    llamaDir: cfg.llamaDir,
    modelPath: cfg.modelPath,
    ctx: cfg.ctx,
    thinking: modelRef ? Setup.resolveThinkingEnabled(modelRef) : undefined,
    thinkingSupported: modelRef ? Setup.modelSupportsThinkingToggle(modelRef) : false,
    saved,
    discoveredModels: Setup.findGgufFiles(24),
    serverExe: cfg.serverExe,
  }
}

async function applyProvider(modelPath: string, apiUrl: string, ctx: number) {
  const modelId = path.basename(modelPath)
  await AppRuntime.runPromise(
    Config.Service.use((svc) =>
      Effect.gen(function* () {
        const current = yield* svc.getGlobal()
        const patch = providerPatch(modelId, modelPath, apiUrl, ctx)
        const merged = mergeDeep(current, patch) as Info
        const result = yield* svc.updateGlobal(merged)
        if (result.changed) {
          yield* disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true })
        }
      }),
    ),
  )
  return modelId
}

export async function setThinking(thinking: boolean) {
  const saved = Setup.loadUserLlamaConfig()
  const modelPath = saved.modelPath ?? Server.getConfig().modelPath
  if (!modelPath) throw new Error("No GGUF model configured")
  Setup.saveUserLlamaConfig({ ...saved, thinking })
  const cfg = Server.getConfig()
  const ctx = saved.ctx ?? cfg.ctx
  const modelId = await applyProvider(modelPath, cfg.apiUrl, ctx)
  return { thinking, modelId, model: Server.modelRef(modelId) }
}

export async function configure(input: LlamaCppSetupInput): Promise<LlamaCppSetupResult> {
  Setup.validateSetup(input)
  const cfg = Server.getConfig()
  const ctx = input.ctx ?? Setup.loadUserLlamaConfig().ctx ?? Server.getLlamaContextLimit()
  const mtp = Setup.modelUsesMtp(input.modelPath)
  const prev = Setup.loadUserLlamaConfig()
  const thinking =
    input.thinking ??
    (Setup.modelSupportsThinkingToggle(input.modelPath)
      ? prev.thinking ?? Setup.resolveThinkingEnabled(input.modelPath)
      : prev.thinking)

  Setup.saveUserLlamaConfig({
    llamaDir: input.llamaDir,
    modelPath: input.modelPath,
    autoStart: input.autoStart ?? true,
    ctx,
    mtp,
    thinking,
  })

  process.env.LLAMACPP_API_URL = cfg.apiUrl

  const modelId = await applyProvider(input.modelPath, cfg.apiUrl, ctx)

  if (input.autoStart === false) {
    return { model: Server.modelRef(modelId), running: false, apiUrl: cfg.apiUrl }
  }

  const started = await Server.start({
    config: { llamaDir: input.llamaDir, modelPath: input.modelPath, ctx },
  })

  return {
    model: Server.modelRef(started.modelId),
    modelId: started.modelId,
    running: true,
    alreadyRunning: started.alreadyRunning,
    apiUrl: cfg.apiUrl,
    logPath: Server.getLogPath(),
  }
}