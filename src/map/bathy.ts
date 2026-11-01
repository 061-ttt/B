// 海の深さのグラデーション（教材用の模式）。
// 海岸からの距離で「細い大陸棚 → 大陸斜面 → 深海」を作り、幅の広い大陸棚と海溝を重ねる。
import { SHELVES, TRENCHES, TROUGHS } from '../data/ocean';
import type { LandData, Projector, XY } from '../geo/project';

export const DEPTH_STOPS: [number, string][] = [
  [0, '#45abc4'],
  [200, '#2683ab'],
  [1000, '#17669a'],
  [3000, '#0d4373'],
  [5000, '#092c55'],
  [7000, '#06193a'],
  [10000, '#030b1f'],
];

export const DEPTH_LEGEND = [
  { label: '大陸棚', ruby: 'たいりくだな', range: '〜200m', color: '#3aa6cc' },
  { label: '大陸斜面', ruby: 'たいりくしゃめん', range: '〜3000m', color: '#15588a' },
  { label: '深い海', ruby: '', range: '〜6000m', color: '#0a2f5a' },
  { label: '海溝', ruby: 'かいこう', range: '6000m〜', color: '#040f28' },
];

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const STOPS = DEPTH_STOPS.map(([d, c]) => [d, ...hex(c)] as [number, number, number, number]);

export function depthColor(d: number): [number, number, number] {
  if (d <= STOPS[0][0]) return [STOPS[0][1], STOPS[0][2], STOPS[0][3]];
  for (let i = 1; i < STOPS.length; i++) {
    if (d <= STOPS[i][0]) {
      const a = STOPS[i - 1], b = STOPS[i];
      const t = (d - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
    }
  }
  const l = STOPS[STOPS.length - 1];
  return [l[1], l[2], l[3]];
}

/** 2パスのチャンファー距離変換（マスク=1 の画素からの距離、単位は画素） */
function distance(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  const a = 1, b = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + a);
    if (y > 0) {
      v = Math.min(v, d[i - w] + a);
      if (x > 0) v = Math.min(v, d[i - w - 1] + b);
      if (x < w - 1) v = Math.min(v, d[i - w + 1] + b);
    }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + a);
    if (y < h - 1) {
      v = Math.min(v, d[i + w] + a);
      if (x < w - 1) v = Math.min(v, d[i + w + 1] + b);
      if (x > 0) v = Math.min(v, d[i + w - 1] + b);
    }
    d[i] = v;
  }
  return d;
}

function rasterize(w: number, h: number, sx: number, draw: (ctx: CanvasRenderingContext2D) => void): Uint8Array {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.setTransform(sx, 0, 0, sx, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  draw(ctx);
  const img = ctx.getImageData(0, 0, w, h).data;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = img[i * 4 + 3] > 100 ? 1 : 0;
  return m;
}

function polyPath(ctx: CanvasRenderingContext2D, rings: XY[][]) {
  for (const r of rings) {
    ctx.moveTo(r[0][0], r[0][1]);
    for (let i = 1; i < r.length; i++) ctx.lineTo(r[i][0], r[i][1]);
    ctx.closePath();
  }
}

/** 深さ（m）の格子と、それを色にしたキャンバスを返す */
export function buildBathymetry(land: LandData, proj: Projector, view: 'japan' | 'world') {
  const res = view === 'japan' ? 0.55 : 0.5; // 投影単位あたりの画素
  const w = Math.round(land.W * res), h = Math.round(land.H * res);
  // km / 画素（おおよそ）
  const kmPerPx = view === 'japan' ? 2.75 / res : 20 / res;

  const landMask = rasterize(w, h, res, (ctx) => {
    ctx.beginPath();
    for (const poly of land.polys) {
      const rings = poly.map((r) => { const o: XY[] = []; for (let i = 0; i < r.length; i += 2) o.push([r[i], r[i + 1]]); return o; });
      polyPath(ctx, rings);
    }
    ctx.fill('evenodd');
  });

  const shelfMask = rasterize(w, h, res, (ctx) => {
    ctx.beginPath();
    for (const s of SHELVES) for (const seg of proj.path([...s, s[0]])) polyPath(ctx, [seg]);
    ctx.fill();
  });

  const trenchMask = rasterize(w, h, res, (ctx) => {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = view === 'japan' ? 3 : 2.5;
    ctx.beginPath();
    for (const t of TRENCHES) if (t.view.includes(view)) for (const seg of proj.path(t.path)) {
      ctx.moveTo(seg[0][0], seg[0][1]);
      for (const p of seg.slice(1)) ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
  });

  const troughMask = rasterize(w, h, res, (ctx) => {
    ctx.lineCap = 'round'; ctx.lineWidth = view === 'japan' ? 3 : 1.5;
    ctx.beginPath();
    for (const t of TROUGHS) for (const seg of proj.path(t)) {
      ctx.moveTo(seg[0][0], seg[0][1]);
      for (const p of seg.slice(1)) ctx.lineTo(p[0], p[1]);
    }
    ctx.stroke();
  });

  const src = new Uint8Array(w * h);
  for (let i = 0; i < src.length; i++) src[i] = landMask[i] || shelfMask[i] ? 1 : 0;
  const dCoast = distance(src, w, h);
  const dLand = distance(landMask, w, h);
  const dTrench = distance(trenchMask, w, h);
  const dTrough = distance(troughMask, w, h);

  const shelfKm = view === 'japan' ? 14 : 45, slopeKm = view === 'japan' ? 70 : 140;
  const depth = new Float32Array(w * h);
  for (let i = 0; i < depth.length; i++) {
    if (landMask[i]) { depth[i] = -1; continue; }
    const km = dCoast[i] * kmPerPx;
    let d: number;
    if (shelfMask[i] || km < shelfKm) {
      // 大陸棚：陸に近いほど浅い
      const near = Math.min(1, (dLand[i] * kmPerPx) / 120);
      d = 30 + 160 * near;
    } else if (km < shelfKm + slopeKm) {
      const t = (km - shelfKm) / slopeKm;
      d = 200 + (4300 - 200) * (t * t * (3 - 2 * t));
    } else {
      // 深海底：ゆるやかなうねり
      const x = i % w, y = (i / w) | 0;
      d = 4400 + 500 * Math.sin(x * 0.045) * Math.cos(y * 0.05) + 300 * Math.sin((x + y) * 0.021);
    }
    const tKm = dTrench[i] * kmPerPx;
    if (tKm < 140) {
      const k = 1 - tKm / 140;
      d = Math.max(d, d + (9000 - d) * k * k);
    }
    const trKm = dTrough[i] * kmPerPx;
    if (trKm < 60) d = Math.max(d, 3600 + 800 * (1 - trKm / 60));
    depth[i] = d;
  }

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < depth.length; i++) {
    const d = depth[i];
    const o = i * 4;
    if (d < 0) { img.data[o] = 30; img.data[o + 1] = 70; img.data[o + 2] = 80; img.data[o + 3] = 255; continue; }
    let [r, g, b] = depthColor(d);
    // 大陸棚の縁（200m）をうっすら強調
    const x = i % w;
    if (x > 0 && x < w - 1 && i > w && i < depth.length - w) {
      const n = [depth[i - 1], depth[i + 1], depth[i - w], depth[i + w]];
      if (d <= 200 && n.some((v) => v > 200)) { r += 22; g += 30; b += 34; }
    }
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: cv, depth, w, h, res };
}
