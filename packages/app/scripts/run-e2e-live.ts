import { execSync } from "child_process"

process.env.PLAYWRIGHT_LIVE_SESSION = "1"
execSync("playwright test --grep @live", { stdio: "inherit", env: process.env })
