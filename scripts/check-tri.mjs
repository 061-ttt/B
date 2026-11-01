import { readFileSync } from 'node:fs';
import * as THREE from 'three';
for (const name of ['japan', 'world']) {
  const d = JSON.parse(readFileSync(`src/data/land-${name}.json`));
  let bad = 0;
  d.polys.forEach((poly, idx) => {
    const toV = (r) => { const o = []; for (let i = 0; i < r.length; i += 2) o.push(new THREE.Vector2(r[i], -r[i + 1])); return o; };
    const outer = toV(poly[0]);
    const holes = poly.slice(1).map(toV);
    const faces = THREE.ShapeUtils.triangulateShape(outer, holes);
    const n = outer.length + holes.reduce((s, h) => s + h.length, 0);
    const expect = n - 2 + 2 * holes.length;
    if (faces.length < expect * 0.95) { bad++; if (outer.length > 50) console.log(name, idx, 'pts', outer.length, 'holes', holes.length, 'faces', faces.length, 'expect', expect, 'first', poly[0].slice(0, 2)); }
  });
  console.log(name, 'bad', bad, 'of', d.polys.length);
}
