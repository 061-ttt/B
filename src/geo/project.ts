import { geoMercator } from 'd3-geo';
import type { LonLat } from '../data/ocean';

export interface ProjParams {
  type: 'mercator' | 'equirect';
  scale: number;
  translate: [number, number];
  center: [number, number];
  rotate: [number, number, number];
}
export interface LandData {
  name: 'japan' | 'world';
  W: number;
  H: number;
  proj: ProjParams;
  polys: number[][][];
}

export type XY = [number, number];

const RAD = Math.PI / 180;

export function makeProjector(p: ProjParams) {
  if (p.type === 'mercator') {
    const m = geoMercator().scale(p.scale).translate(p.translate).center(p.center);
    return {
      point: (lon: number, lat: number): XY => m([lon, lat]) as XY,
      /** 経路を投影（メルカトルは継ぎ目なし） */
      path: (pts: LonLat[]): XY[][] => [pts.map(([lo, la]) => m([lo, la]) as XY)],
      invert: (x: number, y: number): LonLat => m.invert!([x, y]) as LonLat,
    };
  }
  // 太平洋中心の正距円筒図法。継ぎ目は西経30度。
  const [tx, ty] = p.translate;
  const s = p.scale;
  const lam0 = -p.rotate[0];
  const wrap = (l: number) => {
    let d = l - lam0;
    d = ((((d + 180) % 360) + 360) % 360) - 180;
    return d;
  };
  const point = (lon: number, lat: number): XY => [tx + s * wrap(lon) * RAD, ty - s * lat * RAD];
  const path = (pts: LonLat[]): XY[][] => {
    // 経度を連続のまま扱い、継ぎ目（±180）をまたぐ所で分割する
    const segs: XY[][] = [];
    let cur: XY[] = [];
    const k = (d: number) => Math.floor((d + 180) / 360);
    for (let i = 0; i < pts.length; i++) {
      const d = pts[i][0] - lam0;
      if (i > 0) {
        const dp = pts[i - 1][0] - lam0;
        const kp = k(dp), kc = k(d);
        if (kp !== kc) {
          const edge = (kc > kp ? kc : kp) * 360 - 180; // 境界の連続経度
          const t = (edge - dp) / (d - dp);
          const lat = pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]);
          const eL = kc > kp ? 180 : -180;
          cur.push([tx + s * (eL > 0 ? 179.999 : -179.999) * RAD, ty - s * lat * RAD]);
          segs.push(cur);
          cur = [[tx + s * (eL > 0 ? -179.999 : 179.999) * RAD, ty - s * lat * RAD]];
        }
      }
      const dn = d - k(d) * 360;
      cur.push([tx + s * dn * RAD, ty - s * pts[i][1] * RAD]);
    }
    if (cur.length) segs.push(cur);
    return segs.filter((g) => g.length >= 2);
  };
  const invert = (x: number, y: number): LonLat => [((x - tx) / s) / RAD + lam0, -((y - ty) / s) / RAD];
  return { point, path, invert };
}

export type Projector = ReturnType<typeof makeProjector>;
