/**
 * Minimal entry so Windows Explorer launch is handled before TUI/opentui imports load.
 */
import { hideBin } from "yargs/helpers"
import { isWindowsGuiLaunch, openWindowsConsoleLauncher } from "@/util/windows-gui"

const args = hideBin(process.argv)
if (isWindowsGuiLaunch(args)) {
  const { InstallationVersion } = await import("@localcoder-ai/core/installation/version")
  openWindowsConsoleLauncher(InstallationVersion, process.execPath)
  process.exit(0)
}

await import("./index")
