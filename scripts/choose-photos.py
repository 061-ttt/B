"""検索結果から選んだ写真を採用する（ライセンスを確かめて candidates.json に書く）。
使い方: python3 scripts/choose-photos.py <作業フォルダ> fid=候補番号 ...
"""
import importlib.util, json, os, re, sys
OUT = sys.argv[1]
picks = dict(a.split('=') for a in sys.argv[2:])
spec = importlib.util.spec_from_file_location('fp', os.path.join(os.path.dirname(__file__), 'fetch-photos.py'))
sys.argv = [sys.argv[0], OUT, '__none__']
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
search = json.load(open(os.path.join(OUT, 'search.json'))) if os.path.exists(os.path.join(OUT, 'search.json')) else {}
meta_path = os.path.join(OUT, 'candidates.json')
meta = json.load(open(meta_path))
for fid, k in picks.items():
  f, local = search[fid][int(k)] if fid in search else (None, None)
  i = fp.info(f)
  if not i or not fp.OK.search(i['license']):
    print(fid, 'ライセンスが合わないので不採用', i and i['license']); continue
  i['local'] = local
  meta[fid] = [i]
  print(fid, i['file'], i['license'], i['author'])
json.dump(meta, open(meta_path, 'w'), ensure_ascii=False, indent=1)
