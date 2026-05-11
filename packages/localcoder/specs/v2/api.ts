// @ts-nocheck

import { LocalCoder } from "@localcoder-ai/core"
import { ReadTool } from "@localcoder-ai/core/tools"

const localcoder = LocalCoder.make({})

localcoder.tool.add(ReadTool)

localcoder.tool.add({
  name: "bash",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to run.",
      },
    },
    required: ["command"],
  },
  execute(input, ctx) {},
})

localcoder.auth.add({
  provider: "openai",
  type: "api",
  value: process.env.OPENAI_API_KEY,
})

localcoder.agent.add({
  name: "build",
  permissions: [],
  model: {
    id: "gpt-5-5",
    provider: "openai",
    variant: "xhigh",
  },
})

const sessionID = await localcoder.session.create({
  agent: "build",
})

localcoder.subscribe((event) => {
  console.log(event)
})

await localcoder.session.prompt({
  sessionID,
  text: "hey what is up",
})

await localcoder.session.prompt({
  sessionID,
  text: "what is up with this",
  files: [
    {
      mime: "image/png",
      uri: "data:image/png;base64,xxxx",
    },
  ],
})

await localcoder.session.wait()

console.log(await localcoder.session.messages(sessionID))
