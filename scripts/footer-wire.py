from pathlib import Path
s = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/routes/session/index.tsx")
t = s.read_text(encoding="utf-8")
if "from \"./footer\"" not in t:
    t = t.replace(
        'import { SubagentFooter } from "./subagent-footer.tsx"',
        'import { Footer } from "./footer"\nimport { SubagentFooter } from "./subagent-footer.tsx"',
    )
if "<Footer />" not in t:
    t = t.replace(
        "          <Toast />",
        """          <box width="100%" paddingLeft={2} paddingRight={2} paddingBottom={1} flexShrink={0}>
            <Footer />
          </box>
          <Toast />""",
        1,
    )
s.write_text(t, encoding="utf-8")
print("footer wired", "<Footer />" in t)
