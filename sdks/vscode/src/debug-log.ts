import * as fs from "fs";
import * as path from "path";

const DEBUG_ENABLED = process.env.LOCALCODER_VSCODE_DEBUG === "1";
const DEBUG_FILE = path.join(__dirname, "..", "debug.txt");

export function vscodeDebugLog(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 23);
  const line = `[${ts}] ${msg}`;
  if (DEBUG_ENABLED) {
    console.log(line);
    try {
      fs.appendFileSync(DEBUG_FILE, line + "\n");
    } catch {
      /* ignore */
    }
  }
}
