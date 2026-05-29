#!/usr/bin/env bun
/** @deprecated Use `bun run scripts/e2e/run.ts --tier=standard` */
process.env.E2E_TIER = "standard"
process.env.E2E_SKIP_BUILD = process.env.E2E_SKIP_BUILD ?? "1"
await import("./e2e/run.ts")
