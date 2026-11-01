// 陸地データを投影済みの軽量JSONにする（ビルド時に1回だけ実行）
// 出典: Natural Earth（パブリックドメイン） via world-atlas
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoMercator, geoEquirectangular } from 'd3-geo';
import { geoProject } from 'd3-geo-projection';

const load = (f) => JSON.parse(readFileSync(new URL(`../node_modules/world-atlas/${f}`, import.meta.url)));

/** 点の間引き（投影座標での最小間隔） */
function decimate(ring, minDist) {
  const out = [ring[0]];
  for (let i = 1; i < ring.length - 1; i++) {
    const [px, py] = out[out.length - 1];
    const [x, y] = ring[i];
    if (Math.hypot(x - px, y - py) >= minDist) out.push(ring[i]);
  }
  return out;
}

function area(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return a / 2;
}

function build({ name, topo, object, projection, W, H, minDist, minArea }) {
  const t = load(topo);
  const land = feature(t, t.objects[object]);
  const projected = geoProject(land, projection.clipExtent([[0, 0], [W, H]]));
  const polys = [];
  const push = (poly) => {
    const rings = [];
    for (const ring of poly) {
      const r = decimate(ring, minDist).map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
      if (r.length < 4) continue;
      if (Math.abs(area(r)) < minArea) continue;
      // 切り取りで生じる「地図全体を覆う枠」は捨てる
      if (Math.abs(area(r)) > W * H * 0.8) continue;
      rings.push(r.flat());
    }
    if (rings.length) polys.push(rings);
  };
  const geoms = projected.type === 'FeatureCollection' ? projected.features.map((f) => f.geometry) : [projected.geometry ?? projected];
  for (const g of geoms) {
    if (!g) continue;
    if (g.type === 'Polygon') push(g.coordinates);
    if (g.type === 'MultiPolygon') g.coordinates.forEach(push);
  }
  const out = {
    name, W, H,
    proj: projection.__params,
    polys,
  };
  writeFileSync(new URL(`../src/data/land-${name}.json`, import.meta.url), JSON.stringify(out));
  const pts = polys.reduce((s, p) => s + p.reduce((a, r) => a + r.length / 2, 0), 0);
  console.log(`${name}: ${polys.length} polygons, ${pts} points`);
}

// 日本: メルカトル、北緯24〜47度・東経121〜151度
{
  const W = 1000, H = 1000;
  const p = geoMercator().center([136, 35.5]).fitExtent([[0, 0], [W, H]], { type: 'MultiPoint', coordinates: [[121, 23.5], [151, 46.8]] });
  p.__params = { type: 'mercator', scale: p.scale(), translate: p.translate(), center: p.center(), rotate: p.rotate() };
  build({ name: 'japan', topo: 'land-10m.json', object: 'land', projection: p, W, H, minDist: 0.9, minArea: 2 });
}
// 世界: 太平洋中心（日本の教科書と同じ）、南緯60度〜北緯80度
{
  const W = 2000;
  const p = geoEquirectangular().rotate([-150, 0]);
  const s = W / (2 * Math.PI);
  p.scale(s).translate([W / 2, s * (80 * Math.PI / 180)]);
  const H = Math.round(s * (140 * Math.PI / 180));
  p.__params = { type: 'equirect', scale: p.scale(), translate: p.translate(), center: [0, 0], rotate: p.rotate() };
  build({ name: 'world', topo: 'land-50m.json', object: 'land', projection: p, W, H, minDist: 1.6, minArea: 3 });
}
