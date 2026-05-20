import path from "path"
const p = path.join(import.meta.dir, "agent-tool-e2e.ts")
let t = await Bun.file(p).text()
t = t.replace(
  `  const args = [
    "run",
    path.join(ROOT, "src/index.ts"),`,
  `  const args = [
    path.join(ROOT, "src/index.ts"),
    "run",`,
)
await Bun.write(p, t)
console.log("fixed cli args")
