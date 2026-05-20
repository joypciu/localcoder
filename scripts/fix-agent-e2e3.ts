import path from "path"
const p = path.join(import.meta.dir, "agent-tool-e2e.ts")
let t = await Bun.file(p).text()
t = t.replace(
  '  const proc = Bun.spawn(["bun", "run", "--conditions=browser", ...args], {',
  '  const bun = process.execPath\n  const proc = Bun.spawn([bun, "run", "--conditions=browser", ...args], {',
)
await Bun.write(p, t)
console.log("fixed bun path")
