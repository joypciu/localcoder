from pathlib import Path
p = Path("src/cli/cmd/tui/feature-plugins/home/tips-view.tsx")
t = p.read_text(encoding="utf-8")
tip = '  "Run {highlight}/llama{/highlight} to start a local llama.cpp server with your GGUF model",\n'
if "/llama" not in t:
    t = t.replace('  "Run {highlight}/connect{/highlight} to add an AI provider', tip + '  "Run {highlight}/connect{/highlight} to add an AI provider', 1)
    p.write_text(t, encoding="utf-8")
    print("OK tips")
else:
    print("skip")
