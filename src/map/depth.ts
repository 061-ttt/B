// 海の深さのグラデーション（教材用の模式）。正距円筒の画像として作り、地球儀にはる。
// 海岸からの距離で「細い大陸棚 → 大陸斜面 → 深海」を作り、幅の広い大陸棚と海溝を重ねる。
import { SHELVES, TRENCHES, TROUGHS, type LonLat } from '../data/ocean';

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

export interface DepthOpts {
  polys: number[][][];        // 陸地（経度・緯度の平らな配列）
  bbox: [number, number, number, number]; // 西, 南, 東, 北
  w: number;
  h: number;
  shelfKm: number;
  slopeKm: number;
  wrap?: boolean;             // 全球（東西がつながる）
  fade?: number;              // 縁を透明にする幅（画素）
  land?: string;              // 陸の色
}

/** 深さの画像を作る */
export function buildDepth(o: DepthOpts) {
  const [W0, S0, E0, N0] = o.bbox;
  const { w, h } = o;
  const sx = w / (E0 - W0), sy = h / (N0 - S0);
  const X = (lon: number) => (lon - W0) * sx;
  const Y = (lat: number) => (N0 - lat) * sy;
  const kmPerPx = 111.2 / sy;
  const offsets = o.wrap ? [0, -360, 360] : [0];

  // 経度を前の点から180度以内に保って連続にする（日付変更線をまたぐ形のため）
  const unwrap = (pts: LonLat[]): LonLat[] => {
    const out: LonLat[] = [];
    let prev: number | null = null;
    for (const [lo0, la] of pts) {
      let lo = ((lo0 + 540) % 360) - 180;
      if (prev !== null) { while (lo - prev > 180) lo -= 360; while (lo - prev < -180) lo += 360; }
      out.push([lo, la]);
      prev = lo;
    }
    // 範囲の中心に寄せる
    const mid = (W0 + E0) / 2;
    const c = out.reduce((s, p) => s + p[0], 0) / out.length;
    const shift = Math.round((mid - c) / 360) * 360;
    return out.map(([lo, la]) => [lo + shift, la]);
  };
  const drawPath = (ctx: CanvasRenderingContext2D, pts: LonLat[], close: boolean) => {
    const u = unwrap(pts);
    for (const off of offsets) {
      ctx.moveTo(X(u[0][0] + off), Y(u[0][1]));
      for (let i = 1; i < u.length; i++) ctx.lineTo(X(u[i][0] + off), Y(u[i][1]));
      if (close) ctx.closePath();
    }
  };

  const landMask = rasterize(w, h, 1, (ctx) => {
    ctx.beginPath();
    for (const poly of o.polys) for (const r of poly) {
      ctx.moveTo(X(r[0]), Y(r[1]));
      for (let i = 2; i < r.length; i += 2) ctx.lineTo(X(r[i]), Y(r[i + 1]));
      ctx.closePath();
    }
    ctx.fill('evenodd');
  });
  const shelfMask = rasterize(w, h, 1, (ctx) => {
    ctx.beginPath();
    for (const s of SHELVES) drawPath(ctx, s, true);
    ctx.fill();
  });
  const line = (paths: LonLat[][], width: number) => rasterize(w, h, 1, (ctx) => {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = width;
    ctx.beginPath();
    for (const p of paths) drawPath(ctx, p, false);
    ctx.stroke();
  });
  const trenchMask = line(TRENCHES.map((t) => t.path), Math.max(2, 18 / kmPerPx));
  const troughMask = line(TROUGHS, Math.max(1.5, 12 / kmPerPx));

  const src = new Uint8Array(w * h);
  for (let i = 0; i < src.length; i++) src[i] = landMask[i] || shelfMask[i] ? 1 : 0;
  const dCoast = distance(src, w, h);
  const dLand = distance(landMask, w, h);
  const dTrench = distance(trenchMask, w, h);
  const dTrough = distance(troughMask, w, h);

  const depth = new Float32Array(w * h);
  for (let i = 0; i < depth.length; i++) {
    if (landMask[i]) { depth[i] = -1; continue; }
    const km = dCoast[i] * kmPerPx;
    let d: number;
    if (shelfMask[i] || km < o.shelfKm) {
      d = 30 + 160 * Math.min(1, (dLand[i] * kmPerPx) / 120);
    } else if (km < o.shelfKm + o.slopeKm) {
      const t = (km - o.shelfKm) / o.slopeKm;
      d = 200 + 4100 * (t * t * (3 - 2 * t));
    } else {
      const x = i % w, y = (i / w) | 0;
      const lon = W0 + x / sx, lat = N0 - y / sy;
      d = 4500 + 260 * Math.sin(lon * 0.11 + Math.sin(lat * 0.07) * 2) * Math.cos(lat * 0.13);
    }
    const tKm = dTrench[i] * kmPerPx;
    if (tKm < 140) { const k = 1 - tKm / 140; d = d + (9000 - d) * k * k; }
    const trKm = dTrough[i] * kmPerPx;
    if (trKm < 60) d = Math.max(d, 3600 + 800 * (1 - trKm / 60));
    depth[i] = d;
  }

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const land = hex(o.land ?? '#2f3a35');
  const fade = o.fade ?? 0;
  for (let i = 0; i < depth.length; i++) {
    const d = depth[i];
    const p = i * 4;
    const x = i % w, y = (i / w) | 0;
    let a = 255;
    if (fade) a = Math.round(255 * Math.min(1, x / fade, (w - 1 - x) / fade, y / fade, (h - 1 - y) / fade));
    img.data[p + 3] = a;
    if (d < 0) { img.data[p] = land[0]; img.data[p + 1] = land[1]; img.data[p + 2] = land[2]; continue; }
    let [r, g, b] = depthColor(d);
    if (x > 0 && x < w - 1 && y > 0 && y < h - 1 && d <= 200) {
      if (depth[i - 1] > 200 || depth[i + 1] > 200 || depth[i - w] > 200 || depth[i + w] > 200) { r += 22; g += 30; b += 34; }
    }
    img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: cv, w, h };
}
