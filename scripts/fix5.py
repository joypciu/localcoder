from pathlib import Path
s = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/routes/session/index.tsx")
lines = s.read_text(encoding="utf-8").splitlines()
out = []
i = 0
while i < len(lines):
    # skip duplicate block inside AssistantMessage (after duration closing })
    if (i < len(lines) - 12 and 
        lines[i].strip() == "const [followScroll, setFollowScroll] = createSignal(true)" and
        i > 1400 and
        "AssistantMessage" in "\n".join(lines[max(0,i-50):i])):
        # skip until after onCleanup closing
        while i < len(lines) and not (lines[i].strip() == "})" and i > 0 and "onCleanup" in lines[i-1]):
            i += 1
        if i < len(lines):
            i += 1  # skip the })
        continue
    out.append(lines[i])
    i += 1
s.write_text("\n".join(out) + "\n", encoding="utf-8")
print("lines", len(lines), "->", len(out), "followScroll", "\n".join(out).count("followScroll"))
