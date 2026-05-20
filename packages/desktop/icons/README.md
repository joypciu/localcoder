# Desktop icons

Icons are copied from `sdks/vscode/images/icon.png` by `bun run ensure-icons` (also runs during `prebuild`).

electron-builder uses `resources/icons/icon.png` and converts to platform formats at package time.

To refresh after changing the VS Code icon:

```bash
cd packages/desktop
bun run ensure-icons
```
