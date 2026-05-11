import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

export default defineConfig({
  plugins: [solid()],
  root: "e2e",
  server: {
    host: "127.0.0.1",
    port: Number(process.env.SHELL_E2E_PORT ?? 5199),
    strictPort: true,
  },
})
