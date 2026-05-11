import { $ } from "bun"

await $`bun ./scripts/copy-icons.ts ${process.env.LOCALCODER_CHANNEL ?? "dev"}`

await $`cd ../localcoder && bun script/build-node.ts`
