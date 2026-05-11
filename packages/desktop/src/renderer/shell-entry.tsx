import { render } from "solid-js/web"
import { createResource, Show } from "solid-js"
import { ShellApp, createShellSdk } from "@localcoder-ai/desktop-shell"
import "@localcoder-ai/desktop-shell/styles.css"

const root = document.getElementById("root")
if (!root) throw new Error("root element not found")

render(
  () => {
    const [ready] = createResource(async () => {
      const data = await window.api.awaitInitialization(() => undefined)
      const bootstrap = createShellSdk({
        url: data.url,
        username: data.username ?? undefined,
        password: data.password ?? undefined,
        directory: ".",
      })
      const projects = await bootstrap.project.list()
      const directory = projects.data?.[0]?.worktree ?? "."
      return { ...data, directory }
    })

    return (
      <Show when={ready()} keyed>
        {(data) => (
          <ShellApp
            server={{
              url: data.url,
              username: data.username ?? undefined,
              password: data.password ?? undefined,
              directory: data.directory,
            }}
          />
        )}
      </Show>
    )
  },
  root,
)
