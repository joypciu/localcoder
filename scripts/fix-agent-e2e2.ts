import path from "path"
const p = path.join(import.meta.dir, "agent-tool-e2e.ts")
let t = await Bun.file(p).text()
t = t.replace(
  `  const proc = Bun.spawn(["bun", ...args], {
    cwd: ROOT,`,
  `  const proc = Bun.spawn(["bun", "run", "--conditions=browser", ...args], {
    cwd: ROOT,`,
)
t = t.replace(
  `  const args = [
    path.join(ROOT, "src/index.ts"),
    "run",`,
  `  const args = [
    "./src/index.ts",
    "run",`,
)
await Bun.write(p, t)
console.log("fixed bun run")

