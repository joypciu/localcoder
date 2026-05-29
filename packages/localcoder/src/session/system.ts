import { Context, Effect, Layer } from "effect"

import { InstanceState } from "@/effect/instance-state"

import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
import PROMPT_DEFAULT from "./prompt/default.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"
import PROMPT_GPT from "./prompt/gpt.txt"
import PROMPT_KIMI from "./prompt/kimi.txt"

import PROMPT_CODEX from "./prompt/codex.txt"
import PROMPT_TRINITY from "./prompt/trinity.txt"
import PROMPT_QWEN from "./prompt/qwen.txt"
import type { Provider } from "@/provider/provider"
import { isSmallLocalContext } from "@/session/overflow"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Skill } from "@/skill"
import { Database } from "@/storage/db"
import { SessionTable } from "./session.sql"
import { and, count, eq, isNull } from "drizzle-orm"

export function provider(model: Provider.Model) {
  if (model.api.id.includes("gpt-4") || model.api.id.includes("o1") || model.api.id.includes("o3"))
    return [PROMPT_BEAST]
  if (model.api.id.includes("gpt")) {
    if (model.api.id.includes("codex")) {
      return [PROMPT_CODEX]
    }
    return [PROMPT_GPT]
  }
  if (model.api.id.includes("gemini-")) return [PROMPT_GEMINI]
  if (model.api.id.includes("claude")) return [PROMPT_ANTHROPIC]
  if (model.api.id.toLowerCase().includes("trinity")) return [PROMPT_TRINITY]
  if (model.api.id.toLowerCase().includes("kimi")) return [PROMPT_KIMI]
  if (model.api.id.toLowerCase().includes("qwen") || model.api.id.toLowerCase().includes("qwopus"))
    return [PROMPT_QWEN]
  return [PROMPT_DEFAULT]
}

export interface Interface {
  readonly environment: (model: Provider.Model) => Effect.Effect<string[]>
  readonly skills: (agent: Agent.Info, model: Provider.Model) => Effect.Effect<string | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@localcoder/SystemPrompt") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service

    return Service.of({
      environment: Effect.fn("SystemPrompt.environment")(function* (model: Provider.Model) {
        const ctx = yield* InstanceState.context
        return [
          [
            `You are powered by the model named ${model.api.id}. The exact model ID is ${model.providerID}/${model.api.id}`,
            `Here is some useful information about the environment you are running in:`,
            `<env>`,
            `  Working directory: ${ctx.directory}`,
            `  Workspace root folder: ${ctx.worktree}`,
            `  Is directory a git repo: ${ctx.project.vcs === "git" ? "yes" : "no"}`,
            `  Platform: ${process.platform}`,
            `  Today's date: ${new Date().toDateString()}`,
            `</env>`,
          ].join("\n"),
        ]
      }),

      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info, model: Provider.Model) {
        if (Permission.disabled(["skill"], agent.permission).has("skill")) return

        const list = yield* skill.available(agent)
        const ctx = yield* InstanceState.context
        const compact = isSmallLocalContext(model)

        const parts: string[] = [
          "Skills provide specialized instructions and workflows for specific tasks.",
          "Use the skill tool to load a skill when a task matches its description.",
          Skill.fmt(list, { verbose: !compact }),
        ]

        // Hermes-style memory nudge: when no project skills exist but the directory
        // has significant session history, remind the agent to suggest skill creation
        // for recurring workflows.  Threshold: 5+ past sessions without skills.
        if (!compact && list.length === 0) {
          const row = Database.use((db) =>
            db
              .select({ n: count() })
              .from(SessionTable)
              .where(and(eq(SessionTable.directory, ctx.directory), isNull(SessionTable.time_archived)))
              .get(),
          )
          const n = row?.n ?? 0
          if (n >= 5) {
            parts.push(
              [
                `<memory-nudge>`,
                `This directory has ${n} past sessions but no skills defined yet.`,
                `If the current task involves a workflow the user repeats often (testing, deployment,`,
                `code review, data processing, etc.), proactively suggest creating a skill file at`,
                `.localcoder/skills/<name>/SKILL.md so future sessions can load it automatically.`,
                `</memory-nudge>`,
              ].join("\n"),
            )
          }
        }

        return parts.join("\n")
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Skill.defaultLayer))

export * as SystemPrompt from "./system"
