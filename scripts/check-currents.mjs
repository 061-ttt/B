// 海流の線が陸地にかかっていないか・海岸からどれだけ離れているかを、地図の陸地データで確かめる
//   node scripts/check-currents.mjs
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const root = new URL('..', import.meta.url).pathname;
const out = `${root}node_modules/.cache/cur.mjs`;
await build({ entryPoints: [`${root}src/data/ocean.ts`], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
const { CURRENTS } = await import(`${out}?${Date.now()}`);
const G = JSON.parse(readFileSync(`${root}src/data/land-globe.json`, 'utf8'));
const P = JSON.parse(readFileSync(`${root}src/data/land-jpatch.json`, 'utf8'));
const norm = (l) => ((((l + 180) % 360) + 360) % 360) - 180;
const rings = (polys) => polys.flatMap((poly) => poly.map((r) => { const a = []; for (let i = 0; i < r.length; i += 2) a.push([r[i], r[i + 1]]); return a; }));
const gR = rings(G.polys), pR = rings(P.polys);
const [w0, s0, e0, n0] = P.bbox;
function inside(r, x, y) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
const ringsAt = (x, y) => (x >= w0 && x <= e0 && y >= s0 && y <= n0 ? pR : gR);
const onLand = (x, y) => { let n = 0; for (const r of ringsAt(x, y)) if (inside(r, x, y)) n++; return n % 2 === 1; };
function coastKm(x, y) {
  let best = Infinity; const cl = Math.cos((y * Math.PI) / 180);
  for (const r of ringsAt(x, y)) for (const [px, py] of r) { const dx = (px - x) * cl, dy = py - y; if (Math.abs(dy) > 6) continue; const d = Math.hypot(dx, dy) * 111; if (d < best) best = d; }
  return best;
}
const only = process.argv[2];
let bad = 0;
for (const c of CURRENTS) {
  if (only && !c.id.includes(only)) continue;
  const pts = [];
  for (let i = 0; i < c.path.length - 1; i++) {
    const [a, b] = [c.path[i], c.path[i + 1]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1));
    for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  pts.push(c.path[c.path.length - 1]);
  const land = pts.filter(([x, y]) => onLand(norm(x), y));
  const d = c.path.map(([x, y]) => Math.round(coastKm(norm(x), y)));
  if (land.length) bad++;
  console.log(`${land.length ? 'NG' : 'ok'} ${c.id.padEnd(12)} ${c.name}  陸上の点 ${land.length}/${pts.length}${land.length ? ' 例 ' + land.slice(0, 3).map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' / ') : ''}  頂点の海岸までkm [${d.join(' ')}]`);
}
process.exit(bad ? 1 : 0);
