from pathlib import Path
s = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/routes/session/index.tsx")
t = s.read_text(encoding="utf-8")
# remove broken block
lines = t.splitlines()
out = []
skip = False
for i, line in enumerate(lines):
    if "if (sessionBusy()) ?" in line:
        skip = True
        continue
    if skip and "sessionID ?" in line:
        skip = False
        continue
    if skip and line.strip() == "})" and i > 0 and "onCleanup" in lines[i-1] if i>0 else False:
        skip = False
        continue
    if skip:
        continue
    out.append(line)
t = "\n".join(out) + "\n"
# dedupe followScroll block if doubled
marker = "const [followScroll, setFollowScroll] = createSignal(true)"
if t.count(marker) > 1:
    first = t.find(marker)
    second = t.find(marker, first + 1)
    # find end of second onCleanup block
    end = t.find("const keybind = useKeybind()", second)
    if end > second:
        t = t[:second] + t[end:]
if "onCleanup," not in t[:500]:
    t = t.replace("  onMount,\n  Show,", "  onCleanup,\n  onMount,\n  Show,")
s.write_text(t, encoding="utf-8")
print("session")

r = Path(r"P:/localcoder/packages/localcoder/src/tool/registry.ts")
t = r.read_text(encoding="utf-8")
t = t.replace("          read: tool.read,\n            tool.list,\n        }", "          read: tool.read,\n        }")
r.write_text(t, encoding="utf-8")
print("registry")
