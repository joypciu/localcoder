import path from "path"
const p = path.join(import.meta.dir, "..", "packages", "localcoder", "test", "integration", "agent-tools.test.ts")
let t = await Bun.file(p).text()
const old = `    yield* prompt.loop({ sessionID: session.id })
    expect(await Bun.file(scriptPath).exists()).toBe(true)
    const proc = Bun.spawn(["python", scriptPath], { cwd: dir, stdout: "pipe" })
    expect(await proc.exited).toBe(0)
    expect(await new Response(proc.stdout).text()).toContain("sum_1_to_10=55")`
const neu = `    yield* prompt.loop({ sessionID: session.id })
    const exists = yield* Effect.promise(() => Bun.file(scriptPath).exists())
    expect(exists).toBe(true)
    const runOut = yield* Effect.promise(async () => {
      const proc = Bun.spawn(["python", scriptPath], { cwd: dir, stdout: "pipe" })
      return { code: await proc.exited, text: await new Response(proc.stdout).text() }
    })
    expect(runOut.code).toBe(0)
    expect(runOut.text).toContain("sum_1_to_10=55")`
if (!t.includes(old)) throw new Error("old block missing")
await Bun.write(p, t.replace(old, neu))
console.log("fixed")

