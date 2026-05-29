import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { lazy } from "@/util/lazy"
import * as Bootstrap from "@/llamacpp/bootstrap"
import * as Server from "@/llamacpp/server"

const SetupBody = z.object({
  llamaDir: z.string().min(1),
  modelPath: z.string().min(1),
  autoStart: z.boolean().optional(),
  ctx: z.number().int().positive().optional(),
  thinking: z.boolean().optional(),
  forceRestart: z.boolean().optional(),
})

export const LlamaCppRoutes = lazy(() =>
  new Hono()
    .get(
      "/status",
      describeRoute({
        summary: "Get llama.cpp status",
        operationId: "llamacpp.status",
        responses: {
          200: {
            description: "llama.cpp status",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      async (c) => c.json(await Bootstrap.getPublicStatus()),
    )
    .post(
      "/setup",
      describeRoute({
        summary: "Configure and start llama.cpp",
        operationId: "llamacpp.setup",
        responses: {
          200: {
            description: "Setup result",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator("json", SetupBody),
      async (c) => {
        try {
          const body = c.req.valid("json")
          const result = await Bootstrap.configure(body)
          return c.json(result)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return c.json({ error: message }, 400)
        }
      },
    )
    .post(
      "/start",
      describeRoute({
        summary: "Start llama.cpp server",
        operationId: "llamacpp.start",
        responses: {
          200: {
            description: "Start result",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      async (c) => {
        try {
          const started = await Server.start({ forceRestart: true })
          return c.json({
            modelId: started.modelId,
            alreadyRunning: started.alreadyRunning,
            model: Server.modelRef(started.modelId),
            logPath: Server.getLogPath(),
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return c.json({ error: message }, 400)
        }
      },
    )
    .post(
      "/thinking",
      describeRoute({
        summary: "Toggle Qwen3.5 thinking mode",
        operationId: "llamacpp.thinking",
        responses: {
          200: {
            description: "Thinking toggle result",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator("json", z.object({ thinking: z.boolean() })),
      async (c) => {
        try {
          const { thinking } = c.req.valid("json")
          const result = await Bootstrap.setThinking(thinking)
          return c.json(result)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return c.json({ error: message }, 400)
        }
      },
    )
    .post(
      "/stop",
      describeRoute({
        summary: "Stop managed llama.cpp server",
        operationId: "llamacpp.stop",
        responses: {
          200: {
            description: "Stop result",
            content: { "application/json": { schema: resolver(z.object({ stopped: z.boolean() })) } },
          },
        },
      }),
      async (c) => c.json({ stopped: await Server.stopIfManaged() }),
    ),
)