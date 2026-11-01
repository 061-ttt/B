"""集めた写真を WebP に縮小してアプリに同梱し、出典の一覧を作る。
使い方: python3 scripts/build-photos.py <作業フォルダ> [魚ID=候補番号 ...]
"""
import json, os, sys
from PIL import Image, ImageOps

SRC = sys.argv[1]
PICK = dict(a.split('=') for a in sys.argv[2:])
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'fish')
os.makedirs(OUT, exist_ok=True)
cands = json.load(open(os.path.join(SRC, 'candidates.json')))

def cover(im, w, h):
  im = ImageOps.exif_transpose(im).convert('RGB')
  return ImageOps.fit(im, (w, h), Image.LANCZOS, centering=(0.5, 0.5))

credits = {}
for fid, cs in cands.items():
  if not cs: continue
  c = cs[int(PICK.get(fid, 0))]
  im = Image.open(c['local'])
  cover(im, 480, 320).save(os.path.join(OUT, f'{fid}.webp'), 'WEBP', quality=76, method=6)
  cover(im, 120, 80).save(os.path.join(OUT, f'{fid}-s.webp'), 'WEBP', quality=72, method=6)
  credits[fid] = {k: c[k] for k in ('file', 'license', 'author', 'page')}
  if credits[fid]['author'].strip().lower() in ('self', 'own work', 'unknown', 'unknown author'): credits[fid]['author'] = ''

json.dump(credits, open(os.path.join(ROOT, 'src', 'data', 'photo-credits.json'), 'w'), ensure_ascii=False, indent=1)
fish = {}
try:
  import re
  t = open(os.path.join(ROOT, 'src', 'data', 'fish.ts'), encoding='utf-8').read()
  fish = dict(re.findall(r"id: '([^']+)', name: '([^']+)'", t))
except Exception:
  pass
lines = ['# 写真の出典', '', '魚の写真は Wikimedia Commons の、教材に自由に使えるライセンスの写真を縮小して使っています。', '',
         '| 魚 | ファイル | 撮影者・作者 | ライセンス |', '|---|---|---|---|']
for fid, c in credits.items():
  lines.append(f"| {fish.get(fid, fid)} | [{c['file']}]({c['page']}) | {c['author'] or '（ファイルのページを参照）'} | {c['license']} |")
open(os.path.join(ROOT, 'docs', 'CREDITS.md'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print(f'{len(credits)} 種の写真を書き出しました')
