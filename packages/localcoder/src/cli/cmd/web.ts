import { Effect } from "effect"
import { Server } from "../../server/server"
import { UI } from "../ui"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@localcoder-ai/core/flag/flag"
import open from "open"
import { networkInterfaces } from "os"

function getNetworkIPs() {
  const nets = networkInterfaces()
  const results: string[] = []

  for (const name of Object.keys(nets)) {
    const net = nets[name]
    if (!net) continue

    for (const netInfo of net) {
      if (netInfo.internal || netInfo.family !== "IPv4") continue
      if (netInfo.address.startsWith("172.")) continue
      results.push(netInfo.address)
    }
  }

  return results
}

const startWebInterface = Effect.fn("Cli.web")(function* (args) {
  if (!Flag.LOCALCODER_SERVER_PASSWORD) {
    UI.println(UI.Style.TEXT_WARNING_BOLD + "!  LOCALCODER_SERVER_PASSWORD is not set; server is unsecured.")
  }
  const opts = yield* Effect.promise(() => resolveNetworkOptions(args))
  const server = yield* Effect.promise(() => Server.listen(opts))
  UI.empty()
  UI.println(UI.logo("  "))
  UI.empty()

  if (opts.hostname === "0.0.0.0") {
    const localhostUrl = `http://localhost:${server.port}`
    UI.println(UI.Style.TEXT_INFO_BOLD + "  Local access:      ", UI.Style.TEXT_NORMAL, localhostUrl)
    const networkIPs = getNetworkIPs()
    for (const ip of networkIPs) {
      UI.println(UI.Style.TEXT_INFO_BOLD + "  Network access:    ", UI.Style.TEXT_NORMAL, `http://${ip}:${server.port}`)
    }
    if (opts.mdns) {
      UI.println(UI.Style.TEXT_INFO_BOLD + "  mDNS:              ", UI.Style.TEXT_NORMAL, `${opts.mdnsDomain}:${server.port}`)
    }
    open(localhostUrl.toString()).catch(() => {})
  } else {
    const displayUrl = server.url.toString()
    UI.println(UI.Style.TEXT_INFO_BOLD + "  Web interface:    ", UI.Style.TEXT_NORMAL, displayUrl)
    open(displayUrl).catch(() => {})
  }

  yield* Effect.never
})

export const WebCommand = effectCmd({
  command: "web",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "start localcoder server and open web interface",
  instance: false,
  handler: startWebInterface,
})

export const UiCommand = effectCmd({
  command: "ui",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "modern web UI in your browser (recommended on Windows)",
  instance: false,
  handler: startWebInterface,
})
