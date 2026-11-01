// 地球儀用の陸地データ（経度・緯度）を作る。ビルド前に1回だけ実行し、生成JSONはリポジトリに含める。
// 出典: Natural Earth（パブリックドメイン） via world-atlas
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoEquirectangular } from 'd3-geo';
import { geoProject } from 'd3-geo-projection';

const load = (f) => JSON.parse(readFileSync(new URL(`../node_modules/world-atlas/${f}`, import.meta.url)));

function decimate(ring, minDist) {
  const out = [ring[0]];
  for (let i = 1; i < ring.length - 1; i++) {
    const [px, py] = out[out.length - 1];
    const [x, y] = ring[i];
    if (Math.hypot(x - px, y - py) >= minDist) out.push(ring[i]);
  }
  out.push(ring[ring.length - 1]);
  return out;
}
function area(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
}

/** 正距円筒（x=経度+180, y=90-緯度）で切り取り、経緯度の多角形にする */
function lonlatPolys(topo, extent, minDist, minArea, dp) {
  const t = load(topo);
  const land = feature(t, t.objects.land);
  const proj = geoEquirectangular().scale(180 / Math.PI).translate([180, 90]).clipExtent(extent);
  const g = geoProject(land, proj);
  const geoms = g.type === 'FeatureCollection' ? g.features.map((f) => f.geometry) : [g.geometry ?? g];
  const k = 10 ** dp;
  const extArea = (extent[1][0] - extent[0][0]) * (extent[1][1] - extent[0][1]);
  const polys = [];
  const push = (poly) => {
    const rings = [];
    for (const ring of poly) {
      const r = decimate(ring, minDist).map(([x, y]) => [Math.round((x - 180) * k) / k, Math.round((90 - y) * k) / k]);
      if (r.length < 4 || Math.abs(area(r)) < minArea) continue;
      if (Math.abs(area(r)) > extArea * 0.8) continue; // 切り取りで生じる全体の枠
      rings.push(r);
    }
    if (rings.length) polys.push(rings);
  };
  for (const geom of geoms) {
    if (!geom) continue;
    if (geom.type === 'Polygon') push(geom.coordinates);
    if (geom.type === 'MultiPolygon') geom.coordinates.forEach(push);
  }
  return polys;
}

const isJapan = (ring) => {
  let sx = 0, sy = 0;
  for (const [x, y] of ring) { sx += x; sy += y; }
  const lon = sx / ring.length, lat = sy / ring.length;
  return (lon > 129 && lon < 149.5 && lat > 24 && lat < 45.8) || (lon > 122.9 && lon <= 129 && lat > 23.8 && lat < 31);
};

// 世界（1:5000万）から日本を抜き、日本だけ1:1000万の細かい形に差しかえる
const world = lonlatPolys('land-50m.json', [[0, 0], [360, 180]], 0.12, 0.02, 2).filter((p) => !isJapan(p[0]));
const jp10 = lonlatPolys('land-10m.json', [[180 + 120, 90 - 47], [180 + 150.5, 90 - 23]], 0.012, 0.0006, 3).filter((p) => isJapan(p[0]));
const flat = (polys) => polys.map((p) => p.map((r) => r.flat()));
writeFileSync(new URL('../src/data/land-globe.json', import.meta.url), JSON.stringify({ polys: flat([...world, ...jp10]), japanFrom: world.length }));

// 日本付近の深さ図（高精細パッチ）用：東経118〜156度・北緯20〜50度
const patch = lonlatPolys('land-10m.json', [[180 + 118, 90 - 50], [180 + 156, 90 - 20]], 0.02, 0.001, 3);
writeFileSync(new URL('../src/data/land-jpatch.json', import.meta.url), JSON.stringify({ bbox: [118, 20, 156, 50], polys: flat(patch) }));

const pts = (polys) => polys.reduce((s, p) => s + p.reduce((a, r) => a + r.length, 0), 0);
console.log(`globe: ${world.length} + japan ${jp10.length} polygons, ${pts(world) + pts(jp10)} points; patch: ${patch.length} polygons, ${pts(patch)} points`);
