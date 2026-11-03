// 海の深さのグラデーション（教材用の模式）。正距円筒の画像として作り、地球儀にはる。
// 海岸からの距離で「細い大陸棚 → 大陸斜面 → 深海」を作り、幅の広い大陸棚と海溝を重ねる。
import { SHELVES, TRENCHES, TROUGHS, type LonLat } from '../data/ocean';

// 深さは4つの段（大陸棚・大陸斜面・深い海・海溝）に分けて、段ごとにはっきり色を変える。
// 段の中では少しだけ濃くなり、段のさかい目には等深線（200m・1000m・3000m・6000m）を引く。
export const DEPTH_STOPS: [number, string][] = [
  [0, '#7fe7ee'],
  [200, '#3cc0d6'],     // 大陸棚（あかるい水色）
  [201, '#2a86c4'],
  [3000, '#16508f'],    // 大陸斜面（青）
  [3001, '#0f3a72'],
  [6000, '#0a2754'],    // 深い海（こい紺）
  [6001, '#1d1150'],
  [10000, '#0a0526'],   // 海溝（むらさきがかった黒）
];
/** 等深線（m）。200m（大陸棚のふち）だけ太く明るく */
export const CONTOURS = [200, 1000, 3000, 6000];

export const DEPTH_LEGEND = [
  { label: '大陸棚', ruby: 'たいりくだな', range: '0〜200m', color: '#3cc0d6' },
  { label: '大陸斜面', ruby: 'たいりくしゃめん', range: '200〜3000m', color: '#2170ae' },
  { label: '深い海', ruby: '', range: '3000〜6000m', color: '#0d3166' },
  { label: '海溝', ruby: 'かいこう', range: '6000m〜', color: '#170d44' },
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

/** 段のさかい目を少しなめらかにした色（全球の粗い画像用） */
function softColor(d: number): [number, number, number] {
  const edges: [number, number][] = [[200, 70], [3000, 500], [6000, 600]];
  for (const [e, wd] of edges) {
    if (Math.abs(d - e) < wd) {
      const t = (d - (e - wd)) / (2 * wd);
      const k = t * t * (3 - 2 * t);
      const a = depthColor(e - wd), b = depthColor(e + wd);
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
  }
  return depthColor(d);
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
  // 斜面の陰影（北西から光を当てる）。深くなっていく斜面が立体的に見える
  const shadeK = 0.9 / Math.max(1, kmPerPx);
  // 細かい日本付近の画像では段をくっきり、粗い全球の画像では段のさかい目を少しぼかす
  const crisp = !o.wrap;
  const band = (d: number) => (d <= 200 ? 0 : d <= 1000 ? 1 : d <= 3000 ? 2 : d <= 6000 ? 3 : 4);
  for (let i = 0; i < depth.length; i++) {
    const d = depth[i];
    const p = i * 4;
    const x = i % w, y = (i / w) | 0;
    let a = 255;
    if (fade) a = Math.round(255 * Math.min(1, x / fade, (w - 1 - x) / fade, y / fade, (h - 1 - y) / fade));
    img.data[p + 3] = a;
    if (d < 0) { img.data[p] = land[0]; img.data[p + 1] = land[1]; img.data[p + 2] = land[2]; continue; }
    let [r, g, b] = crisp ? depthColor(d) : softColor(d);
    if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
      const dl = depth[i - 1], dr = depth[i + 1], du = depth[i - w], dd = depth[i + w];
      // 陰影：深さが右下へ増える斜面は明るく、左上へ増える斜面は暗く
      if (dl >= 0 && dr >= 0 && du >= 0 && dd >= 0) {
        const gx = (dr - dl) / 2, gy = (dd - du) / 2;
        const sh = Math.max(-0.22, Math.min(0.22, (gx + gy) * 0.0007 * shadeK * 10));
        r *= 1 + sh; g *= 1 + sh; b *= 1 + sh;
      }
      // 等深線：となりの画素と段がちがう所に線を引く（200mは太く明るい）。粗い全球の画像では引かない（ギザギザになるため）
      const bd = crisp ? band(d) : -1;
      let edge = -1;
      for (const n of [dl, dr, du, dd]) if (n >= 0 && band(n) < bd) edge = Math.max(edge, band(n));
      if (edge === 0) { r = 200; g = 250; b = 255; }
      else if (edge > 0) { r += 34; g += 44; b += 60; }
    }
    img.data[p] = Math.min(255, r); img.data[p + 1] = Math.min(255, g); img.data[p + 2] = Math.min(255, b);
  }
  // 200m の線は少し太くして、大陸棚のふちをはっきり見せる
  const shelfEdge = new Uint8Array(w * h);
  for (let i = w; crisp && i < depth.length - w; i++) {
    const d = depth[i];
    if (d > 200 && d <= 3000) for (const n of [depth[i - 1], depth[i + 1], depth[i - w], depth[i + w]]) if (n >= 0 && n <= 200) { shelfEdge[i] = 1; break; }
  }
  for (let i = 0; i < depth.length; i++) if (shelfEdge[i]) { const p = i * 4; img.data[p] = 150; img.data[p + 1] = 228; img.data[p + 2] = 245; }
  ctx.putImageData(img, 0, 0);
  return { canvas: cv, w, h };
}
