import from pathlib import Path
ROOT=Path('P/localcoder/packages/localcoder/src')
p=ROOT/'tool/registry.py'
t=p.read_text(encoding='utf-8')
if 'ListTool' not in t:
    t=t.replace('import { GlobTool } from "./glob"', 'import { GlobTool } from "./glob"\nimport { ListTool } from "./list"')
    t=t.replace('const globtool = yield** GlobTool', 'const listtool = yield** ListTool\n    const globtool = yield** GlobTool')
    t=t.replace('glob: Tool.init(globtool),', 'list: Tool.init(listtool),\n          glob: Tool.init(globtool),')
    t=t.replace('tool.read,', 'tool.read,\n            tool.list,')
    p.write_text(t, encoding='utf-8')
    print('registry')
else:
    print('skip registry')

