#!/usr/bin/env bun
/** Git --msg-filter: drop AI co-author trailers from commit messages. */
const msg = await Bun.stdin.text()
const lines = msg.split(/\r?\n/)
const filtered = lines.filter((line) => !/^Co-Authored-By:\s*/i.test(line))
let out = filtered.join("\n")
if (msg.endsWith("\n") && !out.endsWith("\n")) out += "\n"
process.stdout.write(out)
