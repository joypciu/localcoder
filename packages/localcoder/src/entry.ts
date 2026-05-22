/**
 * Minimal entry so Windows Explorer launch is handled before TUI/opentui imports load.
 */
import { hideBin } from "yargs/helpers"
import { isWindowsGuiLaunch, openWindowsGuiLauncher } from "@/util/windows-gui"

const args = hideBin(process.argv)
if (isWindowsGuiLaunch(args)) {
  openWindowsGuiLauncher(process.execPath)
  process.exit(0)
}

await import("./index")
