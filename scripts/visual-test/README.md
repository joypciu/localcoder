# LocalCoder Visual Testing

Automated visual regression testing across surfaces that unit tests cannot cover:

| Suite | Engine | What it tests |
|-------|--------|---------------|
| `tui` | OpenTUI `testRender` + char-frame snapshots | `/connect`, llama.cpp setup dialogs, prompt text wrapping |
| `vscode` | Playwright + mock `acquireVsCodeApi` | VS Code chat webview layout, settings overlay, messages, usage meter |
| `app` | Playwright + Vite dev server | Windows build web UI home/session shell |
| `desktop` | Electron CDP screenshot (optional) | Packaged `LocalCoder.exe` launch window |

## Surfaces covered

| Surface | Location | Engine |
|---------|----------|--------|
| CLI TUI | `packages/localcoder/test/visual/` | OpenTUI char-frame snapshots + mock keyboard |
| VS Code chat | `packages/app/e2e/visual/vscode-chat.visual.spec.ts` | Playwright + mock `acquireVsCodeApi` |
| Windows web UI | `packages/app/e2e/visual/app-shell.visual.spec.ts` | Playwright + Vite |
| Desktop Electron | `scripts/visual-test/suites/desktop/` | CDP screenshot (optional) |

## CI / E2E integration

Visual smoke runs automatically in `bun run e2e:smoke` (TUI + VS Code webview). Standard/full tiers also run app screenshots via `E2E_SKIP_VISUAL=1` to opt out.

## Commands

From repo root:

```powershell
bun run visual-test
bun run visual-test:update
bun run scripts/visual-test/run.ts --suite=tui
bun run scripts/visual-test/run.ts --suite=vscode,app
```

## Updating baselines

When UI changes are intentional:

```powershell
bun run visual-test:update
```

Or per suite:

```powershell
$env:VISUAL_UPDATE=1; bun test packages/localcoder/test/visual
node packages/app/node_modules/playwright/cli.js test --config packages/app/e2e/visual/playwright.vscode.config.ts --update-snapshots
```

## Artifacts

- HTML report: `scripts/visual-test/.artifacts/report.html`
- TUI char frames: `scripts/visual-test/snapshots/tui/*.txt`
- Playwright PNG baselines: `packages/app/e2e/visual/*-snapshots/`
- Desktop PNG: `scripts/visual-test/snapshots/desktop/desktop-launch.png` (when CDP is available)

## Adding tests

### CLI TUI

Add cases in `packages/localcoder/test/visual/tui-dialogs.visual.test.tsx`:

1. Mount dialog via `mountVisualDialog()`
2. Drive UI with `driveEnter()` / `driveSelect()`
3. Capture frame with `captureFrame()` and `snap(name, frame)`

### VS Code webview

Add Playwright specs in `scripts/visual-test/suites/vscode/`:

1. `installVscodeMock(page)` before navigation
2. `postToWebview(page, { type: ... })` to simulate extension messages
3. `expect(locator).toHaveScreenshot(...)`

### App / desktop

Extend `scripts/visual-test/suites/app/` or `suites/desktop/` similarly.

## CI notes

- `desktop` auto-skips when `LocalCoder.exe` is missing, or when the build does not expose a CDP DevTools port
- Set `VISUAL_STRICT_DESKTOP=1` to fail instead of skip when CDP capture fails
- App suite starts Vite on port `3010` by default (`PLAYWRIGHT_PORT`)
