import { render } from "solid-js/web"
import { ShellApp } from "../src/shell-app"
import "../src/styles.css"

const root = document.getElementById("root")
if (!root) throw new Error("root not found")

const mock = new URLSearchParams(location.search).has("mock")

render(
  () => (
    <ShellApp
      mock={mock}
      server={{
        url: "http://127.0.0.1:4096",
        directory: "C:\\dev\\project",
      }}
    />
  ),
  root,
)
