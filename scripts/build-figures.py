"""切り抜いた画像を、地球儀に立てるフィギュア画像（透明つき WebP）にする。
使い方: python3 scripts/build-figures.py <切り抜きフォルダ> [--edge 6]
  --edge を付けると、切り抜きシールのような白いふちを付ける（写真の切り抜き向け）。
  付けないときは、ふちなしで立体感をそのまま残す（Canva の 3D フィギュア向け）。
"""
import glob, os, sys
from PIL import Image, ImageFilter, ImageChops, ImageEnhance

args = sys.argv[1:]
SRC = args[0]
EDGE = int(args[args.index('--edge') + 1]) if '--edge' in args else 0
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'fig')
os.makedirs(OUT, exist_ok=True)
MAX = 420       # 長い辺の画素数（スマホの高解像度画面でもにじまない大きさ）

for f in sorted(glob.glob(os.path.join(SRC, '*.png'))):
  fid = os.path.splitext(os.path.basename(f))[0]
  im = Image.open(f).convert('RGBA')
  im.thumbnail((MAX, MAX), Image.LANCZOS)
  # 暗い地球儀の上でしずまないよう、ほんの少しだけ明るく・くっきり
  rgb = ImageEnhance.Contrast(ImageEnhance.Brightness(im.convert('RGB')).enhance(1.04)).enhance(1.06)
  rgb.putalpha(im.getchannel('A'))
  im = rgb
  pad = EDGE * 2 + 4
  canvas = Image.new('RGBA', (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
  canvas.paste(im, (pad, pad), im)
  out = canvas
  if EDGE:
    a = canvas.getchannel('A').point(lambda v: 255 if v > 100 else 0)
    ring = a.filter(ImageFilter.MaxFilter(EDGE * 2 + 1)).filter(ImageFilter.GaussianBlur(1.2))
    white = Image.new('RGBA', canvas.size, (255, 255, 255, 255))
    white.putalpha(ring)
    out = Image.alpha_composite(white, canvas)
    thick = Image.new('RGBA', canvas.size, (120, 130, 150, 255))
    thick.putalpha(ImageChops.offset(ring, 0, 3).point(lambda v: int(v * 0.8)))
    out = Image.alpha_composite(thick, out)
  bb = out.getchannel('A').getbbox()
  out = out.crop(bb)
  path = os.path.join(OUT, f'{fid}.webp')
  out.save(path, 'WEBP', quality=84, method=6)
  print(fid, out.size, os.path.getsize(path))
