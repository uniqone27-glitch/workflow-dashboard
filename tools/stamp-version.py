#!/usr/bin/env python3
"""배포 전에 실행: index.html 과 js 파일의 내부 참조에 버전(?v=...)을 붙여
브라우저/GitHub Pages 캐시 때문에 옛 파일과 새 파일이 섞이는 문제를 막습니다.

사용법: python3 tools/stamp-version.py
"""
import datetime
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent
ver = datetime.datetime.now().strftime('%Y%m%d%H%M')

# js 모듈 간 import:  from './store.js'  ->  from './store.js?v=202611171930'
imp = re.compile(r"""(from\s+['"])(\./[\w.-]+\.js)(\?v=\d+)?(['"])""")
for f in sorted((root / 'js').glob('*.js')):
    s = f.read_text(encoding='utf-8')
    n = imp.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={ver}{m.group(4)}", s)
    if n != s:
        f.write_text(n, encoding='utf-8')

# index.html: css / js 참조
html = root / 'index.html'
s = html.read_text(encoding='utf-8')
s = re.sub(r'((?:href|src)="(?:css|js)/[\w.-]+\.(?:css|js))(\?v=\d+)?"', lambda m: f'{m.group(1)}?v={ver}"', s)
html.write_text(s, encoding='utf-8')
print('version', ver)
