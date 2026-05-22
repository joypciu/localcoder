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
}

export type LlamaCppSetupResult = {
  model: string
  modelId?: string
  running: boolean
  alreadyRunning?: boolean
  apiUrl: string
  logPath?: string
}

function providerPatch(modelId: string, apiUrl: string, ctx: number): Partial<Info> {
  const output = Number(process.env.LLAMACPP_MAX_OUTPUT ?? 4096)
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
  return {
    ...status,
    llamaDir: cfg.llamaDir,
    modelPath: cfg.modelPath,
    ctx: cfg.ctx,
    saved,
    discoveredModels: Setup.findGgufFiles(24),
    serverExe: cfg.serverExe,
  }
}

export async function configure(input: LlamaCppSetupInput): Promise<LlamaCppSetupResult> {
  Setup.validateSetup(input)
  const cfg = Server.getConfig()
  const ctx = input.ctx ?? Setup.loadUserLlamaConfig().ctx ?? Server.getLlamaContextLimit()
  const mtp = Setup.modelUsesMtp(input.modelPath)

  Setup.saveUserLlamaConfig({
    llamaDir: input.llamaDir,
    modelPath: input.modelPath,
    autoStart: input.autoStart ?? true,
    ctx,
    mtp,
  })

  process.env.LLAMACPP_API_URL = cfg.apiUrl

  const modelId = path.basename(input.modelPath)
  await AppRuntime.runPromise(
    Config.Service.use((svc) =>
      Effect.gen(function* () {
        const current = yield* svc.getGlobal()
        const patch = providerPatch(modelId, cfg.apiUrl, ctx)
        const merged = mergeDeep(current, patch) as Info
        const result = yield* svc.updateGlobal(merged)
        if (result.changed) {
          yield* disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true })
        }
      }),
    ),
  )

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