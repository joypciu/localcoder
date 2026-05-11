import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Permission } from "@/permission"
import { PermissionID } from "@/permission/schema"
import { SessionID } from "@/session/schema"
import { errors } from "../../error"
import { lazy } from "@/util/lazy"
import { jsonRequest } from "./trace"

function e2ePermissionInjectAllowed() {
  const caller = process.env.LOCALCODER_CALLER ?? ""
  return caller === "e2e" || caller === "shell-e2e" || caller.startsWith("playwright")
}

export const PermissionRoutes = lazy(() =>
  new Hono()
    .post(
      "/:requestID/reply",
      describeRoute({
        summary: "Respond to permission request",
        description: "Approve or deny a permission request from the AI assistant.",
        operationId: "permission.reply",
        responses: {
          200: {
            description: "Permission processed successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          requestID: PermissionID.zod,
        }),
      ),
      validator("json", z.object({ reply: Permission.Reply.zod, message: z.string().optional() })),
      async (c) =>
        jsonRequest("PermissionRoutes.reply", c, function* () {
          const params = c.req.valid("param")
          const json = c.req.valid("json")
          const svc = yield* Permission.Service
          yield* svc.reply({
            requestID: params.requestID,
            reply: json.reply,
            message: json.message,
          })
          return true
        }),
    )
    .post(
      "/e2e/ask",
      describeRoute({
        summary: "Enqueue permission prompt (E2E only)",
        description: "Integration tests only when LOCALCODER_CALLER is e2e or playwright-*.",
        operationId: "permission.e2e.ask",
        responses: {
          200: {
            description: "Permission request created",
            content: {
              "application/json": {
                schema: resolver(Permission.Request.zod),
              },
            },
          },
          ...errors(403),
        },
      }),
      validator(
        "json",
        z.object({
          sessionID: SessionID.zod,
          permission: z.string(),
          patterns: z.array(z.string()).optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
          always: z.array(z.string()).optional(),
        }),
      ),
      async (c) => {
        if (!e2ePermissionInjectAllowed()) {
          return c.json({ error: "forbidden" }, 403)
        }
        return jsonRequest("PermissionRoutes.e2eAsk", c, function* () {
          const json = c.req.valid("json")
          const svc = yield* Permission.Service
          return yield* svc.enqueue({
            sessionID: json.sessionID,
            permission: json.permission,
            patterns: json.patterns ?? ["*"],
            metadata: json.metadata ?? {},
            always: json.always ?? [],
            ruleset: [{ permission: json.permission, pattern: "*", action: "ask" }],
          })
        })
      },
    )
    .get(
      "/",
      describeRoute({
        summary: "List pending permissions",
        description: "Get all pending permission requests across all sessions.",
        operationId: "permission.list",
        responses: {
          200: {
            description: "List of pending permissions",
            content: {
              "application/json": {
                schema: resolver(Permission.Request.zod.array()),
              },
            },
          },
        },
      }),
      async (c) =>
        jsonRequest("PermissionRoutes.list", c, function* () {
          const svc = yield* Permission.Service
          return yield* svc.list()
        }),
    ),
)
