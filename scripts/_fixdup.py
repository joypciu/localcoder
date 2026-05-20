from pathlib import Path
p = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/llama-server.ts")
t = p.read_text(encoding="utf-8")
t = t.replace("import * as LlamaSetup from \"./llamacpp-setup\"\n\n/** Matches", "\n/** Matches")
p.write_text(t, encoding="utf-8", newline="\n")
print("fixed")
