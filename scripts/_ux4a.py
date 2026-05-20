from pathlib import Path
ROOT = Path(r"P:/localcoder/packages/localcoder")

# session /context
si = ROOT / "src/cli/cmd/tui/routes/session/index.tsx"
t = si.read_text(encoding="utf-8")
if "session.context" not in t:
    t = t.replace(
        'import { usePromptRef } from "../../context/prompt"',
        'import { usePromptRef } from "../../context/prompt"\nimport { useSessionContextDialog } from "@tui/component/dialog-context"',
    )
    t = t.replace(
        '    {\n      title: "Compact session",',
        '''    {
      title: "Context usage",
      value: "session.context",
      category: "Session",
      slash: {
        name: "context",
        aliases: ["tokens", "ctx"],
      },
      onSelect: (dialog) => {
        const show = useSessionContextDialog()
        show(route.sessionID)
        dialog.clear()
      },
    },
    {
      title: "Compact session",''',
    )
    si.write_text(t, encoding="utf-8", newline="\n")
    print("session /context")

# Fix: onSelect can't call hook - need different pattern
