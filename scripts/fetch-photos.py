"""Wikimedia Commons から魚の写真を集める（出典・ライセンス付き）。
ゆっくり（数秒おき）アクセスし、429が返ったら待ってから再試行する。
使い方: python3 scripts/fetch-photos.py <作業フォルダ> [魚ID ...]
"""
import hashlib, html, json, os, re, sys, time, urllib.parse, urllib.request

UA = 'suisan-map/1.0 (https://github.com/061-ttt/B; educational app for elementary school)'
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
ONLY = set(sys.argv[2:])

PAGES = {
  'salmon': 'Oncorhynchus keta', 'mackerel': 'Scomber japonicus', 'horse-mackerel': 'Trachurus japonicus',
  'sardine': 'Sardinops melanostictus', 'saury': 'Cololabis saira', 'tuna': 'Thunnus orientalis',
  'bonito': 'Katsuwonus pelamis', 'yellowtail': 'Seriola quinqueradiata', 'seabream': 'Pagrus major',
  'cod': 'Gadus macrocephalus', 'atka': 'Pleurogrammus azonus', 'flatfish': 'Paralichthys olivaceus',
  'capelin': 'Mallotus villosus', 'shrimp': 'Litopenaeus vannamei', 'squid': 'Todarodes pacificus',
  'octopus': 'Octopus vulgaris', 'scallop': 'Mizuhopecten yessoensis', 'oyster': 'Magallana gigas',
  'clam': 'Ruditapes philippinarum', 'eel': 'Anguilla japonica', 'crab': 'Chionoecetes opilio',
  'ikura': 'Ikura', 'pollock-roe': 'Mentaiko', 'urchin': 'Strongylocentrotus intermedius',
  'wakame': 'Undaria pinnatifida', 'nori': 'Nori', 'kombu': 'Saccharina japonica', 'shirasu': 'Shirasu',
  'herring': 'Clupea pallasii',
}

last = [0.0]
def get(url, binary=False):
  for attempt in range(8):
    wait = 3.0 - (time.time() - last[0])
    if wait > 0: time.sleep(wait)
    last[0] = time.time()
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
      with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
        return data if binary else data.decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
      if e.code == 404: return None
      if e.code == 429:
        ra = int(e.headers.get('retry-after') or 5)
        time.sleep(max(5, ra) * (attempt + 1)); continue
      raise
  raise RuntimeError('too many retries: ' + url)

def files_on(page):
  out = []
  for name in [page.replace(' ', '_'), 'Category:' + page.replace(' ', '_')]:
    h = get('https://commons.wikimedia.org/wiki/' + urllib.parse.quote(name))
    if not h: continue
    for f in re.findall(r'href="/wiki/File:([^"#?]+?\.(?:jpe?g|JPE?G))"', h):
      f = urllib.parse.unquote(f)
      if f not in out and not re.search(r'map|distribution|range|stamp|drawing|illustration|diagram|logo', f, re.I): out.append(f)
    if len(out) >= 4: break
  return out[:4]

def info(f):
  h = get('https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(f.replace(' ', '_')))
  if not h: return None
  cats = re.search(r'"wgCategories":\[(.*?)\]', h)
  if cats and re.search(r'illustration|drawing|painting|print', cats.group(1), re.I): return None
  lic = re.search(r'licensetpl(?:_|&#95;)short"[^>]*>([^<]+)<', h)
  aut = re.search(r'id="fileinfotpl(?:_|&#95;)aut"[^>]*>.*?</td>\s*<td[^>]*>(.*?)</td>', h, re.S)
  author = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', aut.group(1)))).strip() if aut else ''
  author = re.sub(r'\s*\(talk\)|\s*\(トーク\)', '', author)[:80]
  return {'file': f, 'license': html.unescape(lic.group(1)).strip() if lic else '', 'author': author,
          'page': 'https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(f.replace(' ', '_'))}

def thumb(f, w=500):
  n = f.replace(' ', '_')
  m = hashlib.md5(n.encode()).hexdigest()
  return f'https://upload.wikimedia.org/wikipedia/commons/thumb/{m[0]}/{m[:2]}/{urllib.parse.quote(n)}/{w}px-{urllib.parse.quote(n)}'

OK = re.compile(r'public domain|^pd|cc0|cc[ -]by', re.I)
meta_path = os.path.join(OUT, 'candidates.json')
meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
for fid, page in PAGES.items():
  if ONLY and fid not in ONLY: continue
  if fid in meta and not ONLY: continue
  cands = []
  for f in files_on(page):
    i = info(f)
    if not i or not OK.search(i['license']): continue
    img = get(thumb(f), binary=True)
    if not img: continue
    path = os.path.join(OUT, f'{fid}-{len(cands)}.jpg')
    open(path, 'wb').write(img)
    i['local'] = path
    cands.append(i)
    if len(cands) >= 2: break
  meta[fid] = cands
  json.dump(meta, open(meta_path, 'w'), ensure_ascii=False, indent=1)
  print(fid, [(c['file'], c['license']) for c in cands], flush=True)
