import fs from "fs"
import path from "path"
import type { SnapshotResult } from "./snapshot"

export type VisualStep = {
  suite: string
  name: string
  ok: boolean
  durationMs: number
  message?: string
  snapshots?: SnapshotResult[]
}

export function writeReport(steps: VisualStep[], outDir: string) {
  fs.mkdirSync(outDir, { recursive: true })

  const jsonPath = path.join(outDir, "report.json")
  fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), steps }, null, 2))

  const failed = steps.filter((s) => !s.ok)
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>LocalCoder Visual Test Report</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 24px; background: #111; color: #eee; }
  h1 { font-size: 20px; }
  .ok { color: #73c991; }
  .fail { color: #f14c4c; }
  table { border-collapse: collapse; width: 100%; margin-top: 16px; }
  th, td { border: 1px solid #333; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #1e1e1e; }
  pre { white-space: pre-wrap; font-size: 12px; background: #1a1a1a; padding: 8px; border-radius: 4px; }
</style>
</head>
<body>
<h1>LocalCoder Visual Test Report</h1>
<p>${steps.filter((s) => s.ok).length}/${steps.length} passed · ${failed.length} failed</p>
<table>
  <tr><th>Suite</th><th>Step</th><th>Status</th><th>Duration</th><th>Details</th></tr>
  ${steps
    .map(
      (s) => `<tr>
    <td>${escapeHtml(s.suite)}</td>
    <td>${escapeHtml(s.name)}</td>
    <td class="${s.ok ? "ok" : "fail"}">${s.ok ? "pass" : "fail"}</td>
    <td>${s.durationMs}ms</td>
    <td>${escapeHtml(s.message ?? "")}${
      s.snapshots?.length
        ? `<pre>${escapeHtml(
            s.snapshots
              .map((snap) => `${snap.name}: ${snap.ok ? "ok" : snap.message}${snap.diffPath ? ` (${snap.diffPath})` : ""}`)
              .join("\n"),
          )}</pre>`
        : ""
    }</td>
  </tr>`,
    )
    .join("\n")}
</table>
</body>
</html>`

  fs.writeFileSync(path.join(outDir, "report.html"), html, "utf8")
  return { jsonPath, failed: failed.length }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
