#!/usr/bin/env bun
/** @deprecated Use `bun run scripts/e2e/run.ts --tier=full` */
process.env.E2E_TIER = "full"
await import("./e2e/run.ts")
