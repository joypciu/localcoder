import { render } from "solid-js/web"
import { ShellApp } from "../src/shell-app"
import "../src/styles.css"

const root = document.getElementById("root")
if (!root) throw new Error("root not found")

const params = new URLSearchParams(location.search)
const useProxy = params.get("proxy") !== "0"
const url = useProxy
  ? location.origin
  : (params.get("url") ?? import.meta.env.VITE_SHELL_E2E_URL ?? "http://127.0.0.1:4096")
const password = params.get("password") ?? import.meta.env.VITE_SHELL_E2E_PASSWORD
const directory = params.get("directory") ?? import.meta.env.VITE_SHELL_E2E_DIRECTORY ?? "C:\\dev\\project"
const session = params.get("session")

render(
  () => (
    <ShellApp
      server={{
        url,
        password: password ?? undefined,
        directory,
      }}
      initialSessionID={session ?? undefined}
    />
  ),
  root,
)
