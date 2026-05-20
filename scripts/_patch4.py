from pathlib import Path
p = Path(r"P:/localcoder/packages/localcoder/src/cli/cmd/tui/llama-server.ts")
t = p.read_text(encoding="utf-8")
t = t.replace(
    '    "-np",\n    process.env.LLAMACPP_PARALLEL ?? "2",\n',
    '')
if 'LLAMACPP_PARALLEL' not in t:
    t = t.replace(
        '  const ngl = process.env.LLAMACPP_NGL\n  if (ngl) args.push("-ngl", ngl)',
        '  const parallel = process.env.LLAMACPP_PARALLEL\n  if (parallel) args.push("-np", parallel)\n  const ngl = process.env.LLAMACPP_NGL\n  if (ngl) args.push("-ngl", ngl)')
p.write_text(t, encoding="utf-8", newline="\n")
print("llama-server np optional")
