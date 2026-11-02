"""白い背景の画像（Canva で作ったフィギュア画像）から、魚だけを切り抜く。
使い方: python3 scripts/cutout-dir.py <入力フォルダ（{魚ID}.png）> <出力フォルダ>
"""
import glob, os, sys
from PIL import Image, ImageFilter
from rembg import new_session, remove

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
sess = new_session('isnet-general-use')
for f in sorted(glob.glob(os.path.join(SRC, '*.png'))):
  fid = os.path.splitext(os.path.basename(f))[0]
  im = Image.open(f).convert('RGB')
  cut = remove(im, session=sess, post_process_mask=True)
  a = cut.getchannel('A')
  # 小さなかけらを消し、縁をなめらかに（半透明の縁は少しだけ残す）
  hard = a.point(lambda v: 255 if v > 110 else 0).filter(ImageFilter.MedianFilter(5))
  a = hard.filter(ImageFilter.GaussianBlur(0.8))
  cut.putalpha(a)
  bb = hard.getbbox()
  if not bb:
    print(fid, 'empty'); continue
  cut = cut.crop(bb)
  cut.save(os.path.join(OUT, f'{fid}.png'))
  print(fid, cut.size, flush=True)
