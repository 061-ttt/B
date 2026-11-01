"""写真の候補を検索して、縮小画像を並べた一覧を作る（目で選ぶため）。
使い方: python3 scripts/search-photos.py <作業フォルダ> "fid=検索語" ...
"""
import importlib.util, json, os, re, sys, urllib.parse
from PIL import Image, ImageDraw, ImageOps
spec = importlib.util.spec_from_file_location('fp', os.path.join(os.path.dirname(__file__), 'fetch-photos.py'))
OUT = sys.argv[1]
sys.argv = [sys.argv[0], OUT, '__none__'] + sys.argv[2:]
args = sys.argv[3:]
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
res = {}
for a in args:
  fid, q = a.split('=', 1)
  h = fp.get('https://commons.wikimedia.org/w/index.php?' + urllib.parse.urlencode({'search': q + ' filetype:bitmap', 'title': 'Special:Search', 'ns6': 1, 'fulltext': 1, 'limit': 12}))
  files = []
  for f in re.findall(r'href="/wiki/File:([^"#?]+?\.(?:jpe?g|JPE?G))"', h or ''):
    f = urllib.parse.unquote(f)
    if f not in files: files.append(f)
  got = []
  for f in files[:6]:
    try: b = fp.get(fp.thumb(f, 960), binary=True)
    except RuntimeError: b = None
    if not b: continue
    p = os.path.join(OUT, f'search-{fid}-{len(got)}.jpg'); open(p, 'wb').write(b)
    got.append((f, p))
  res[fid] = got
  print(fid, [g[0] for g in got], flush=True)
json.dump(res, open(os.path.join(OUT, 'search.json'), 'w'), ensure_ascii=False, indent=1)
W, H = 220, 150
rows = [(fid, g) for fid, gs in res.items() for g in [gs]]
sheet = Image.new('RGB', (6 * W, len(rows) * (H + 16)), 'black'); dr = ImageDraw.Draw(sheet)
for r, (fid, gs) in enumerate(rows):
  for c, (f, p) in enumerate(gs):
    sheet.paste(ImageOps.fit(Image.open(p).convert('RGB'), (W, H)), (c * W, r * (H + 16)))
    dr.text((c * W + 3, r * (H + 16) + H + 2), f'{fid}:{c}', fill='white')
sheet.save(os.path.join(OUT, 'search.jpg'), quality=80)
