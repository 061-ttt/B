// 地球儀（3D球体）。端がなく、日本から世界までひと続きで見られる。
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CURRENTS, SEA_LABELS, TRENCHES, type LonLat, type OceanCurrent } from '../data/ocean';
import { FISH_BY_ID } from '../data/fish';
import { PLACE_BY_ID } from '../data/places';
import { buildDepth } from './depth';
import { pinScale, type Pin } from '../core/model';
import { iconSvg } from '../ui/icons';
import { photo } from '../ui/photo';

export const R = 100;
const LAND_H = 0.8;
const CUR_R = R + 0.35;
const WARM = new THREE.Color('#ff4a5c');
const COLD = new THREE.Color('#3aa8ff');
const RAD = Math.PI / 180;

export type MapMode = 'detail' | 'world';
export interface Layers { currents: boolean; depth: boolean; labels: boolean }
export interface GlobeData { globe: { polys: number[][][]; japanFrom: number }; patch: { bbox: [number, number, number, number]; polys: number[][][] } }

interface Label { el: HTMLElement; pos: THREE.Vector3; prio: number; kind: 'sea' | 'current' | 'trench' | 'pin' | 'ghost'; near?: boolean; far?: boolean; dy?: number; hidden?: boolean }
interface Flow { curve: THREE.CatmullRomCurve3; len: number; n: number; spacing: number; kind: OceanCurrent['kind']; warmIdx: number[]; coldIdx: number[] }

export function lonLatTo(lon: number, lat: number, r = R, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = (90 - lat) * RAD, th = (lon + 180) * RAD;
  return out.set(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}
export function toLonLat(v: THREE.Vector3): LonLat {
  const r = v.length();
  const lat = 90 - Math.acos(v.y / r) / RAD;
  let lon = Math.atan2(v.z, -v.x) / RAD - 180;
  if (lon < -180) lon += 360;
  return [lon, lat];
}

/** 大円に沿って経路を細かくする */
function densify(path: LonLat[], step = 0.8): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = lonLatTo(path[i][0], path[i][1], 1), b = lonLatTo(path[i + 1][0], path[i + 1][1], 1);
    const ang = a.angleTo(b) / RAD;
    const n = Math.max(1, Math.ceil(ang / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const q = new THREE.Quaternion().setFromUnitVectors(a, b);
      const v = a.clone().applyQuaternion(new THREE.Quaternion().slerp(q, t));
      out.push(v.multiplyScalar(CUR_R));
    }
  }
  const l = path[path.length - 1];
  out.push(lonLatTo(l[0], l[1], CUR_R));
  return out;
}

/** 陸地を球面に沿って押し出す（上面は細かく分割して丸みに沿わせる） */
function buildLand(polys: number[][][], japanFrom: number) {
  const caps: number[][] = [[], []], walls: number[][] = [[], []];
  const push = (arr: number[], lon: number, lat: number, r: number) => { const v = lonLatTo(lon, lat, r); arr.push(v.x, v.y, v.z); };
  polys.forEach((poly, pi) => {
    const k = pi >= japanFrom ? 1 : 0;
    const MAX = k ? 2 : 10; // 上面の三角形の最大の辺（度）
    const rings = poly.map((r) => {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < r.length; i += 2) pts.push(new THREE.Vector2(r[i], r[i + 1]));
      if (pts.length > 1 && pts[0].equals(pts[pts.length - 1])) pts.pop();
      return pts;
    });
    if (rings[0].length < 3) return;
    const all = rings.flat();
    let tris: number[][];
    try { tris = THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1)); } catch { return; }
    const sub = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, d: number) => {
      const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a);
      const m = Math.max(ab, bc, ca);
      if (m > MAX && d < 10) {
        if (m === ab) { const p = a.clone().lerp(b, 0.5); sub(a, p, c, d + 1); sub(p, b, c, d + 1); }
        else if (m === bc) { const p = b.clone().lerp(c, 0.5); sub(a, b, p, d + 1); sub(a, p, c, d + 1); }
        else { const p = c.clone().lerp(a, 0.5); sub(a, b, p, d + 1); sub(p, b, c, d + 1); }
        return;
      }
      push(caps[k], a.x, a.y, R + LAND_H); push(caps[k], b.x, b.y, R + LAND_H); push(caps[k], c.x, c.y, R + LAND_H);
    };
    for (const t of tris) sub(all[t[0]], all[t[1]], all[t[2]], 0);
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      if (Math.abs(p.x) > 179.9 && Math.abs(q.x) > 179.9) continue; // 切り口（日付変更線）
      if (p.y < -89.5 && q.y < -89.5) continue;
      const w = walls[k];
      push(w, p.x, p.y, R); push(w, q.x, q.y, R); push(w, q.x, q.y, R + LAND_H);
      push(w, p.x, p.y, R); push(w, q.x, q.y, R + LAND_H); push(w, p.x, p.y, R + LAND_H);
    }
  });
  const geo = (arr: number[], smooth: boolean) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    if (smooth) {
      const n = new Float32Array(arr.length);
      for (let i = 0; i < arr.length; i += 3) { const l = Math.hypot(arr[i], arr[i + 1], arr[i + 2]); n[i] = arr[i] / l; n[i + 1] = arr[i + 1] / l; n[i + 2] = arr[i + 2] / l; }
      g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    } else g.computeVertexNormals();
    return g;
  };
  return { caps: caps.map((a) => geo(a, true)), walls: walls.map((a) => geo(a, false)) };
}

export class Globe {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private world = new THREE.Group();
  private flows: Flow[] = [];
  private warmMesh!: THREE.InstancedMesh;
  private coldMesh!: THREE.InstancedMesh;
  private ribbons = new THREE.Group();
  private ocean!: THREE.Mesh;
  private oceanFlat!: THREE.Mesh;
  private patch!: THREE.Mesh;
  private labels: Label[] = [];
  private labelLayer: HTMLElement;
  private pinLayer: HTMLElement;
  private pins = new Map<string, { pin: Pin; el: HTMLElement; stem: THREE.Mesh; ring: THREE.Mesh; born: number; label: Label; h: number; normal: THREE.Vector3; base: THREE.Vector3 }>();
  private pinGroup = new THREE.Group();
  private ghosts: Label[] = [];
  private raf = 0;
  private active = true;
  private lastT = performance.now();
  private elapsed = 0;
  private layers: Layers = { currents: true, depth: true, labels: true };
  private lastCollide = 0;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  mode: MapMode = 'world';
  frames = 0;
  onPinTap: (p: Pin) => void = () => {};
  onModeChange: (m: MapMode) => void = () => {};

  static supported(): boolean {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  }

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x02040a, 1);
    this.renderer.domElement.className = 'map-canvas';
    host.appendChild(this.renderer.domElement);
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'label-layer';
    this.pinLayer = document.createElement('div');
    this.pinLayer.className = 'pin-layer';
    host.append(this.labelLayer, this.pinLayer);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 6000);
    this.camera.position.copy(lonLatTo(160, 15, R * 4.2));
    this.scene.add(this.camera);
    const head = new THREE.DirectionalLight(0xffffff, 2.1);
    head.position.set(-0.6, 0.8, 1);
    this.camera.add(head);
    this.scene.add(new THREE.AmbientLight(0x9bb8d8, 0.9));
    this.scene.add(this.world, this.pinGroup);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = R + 14;
    this.controls.maxDistance = R * 5;
    this.controls.zoomSpeed = 0.9;
    this.controls.addEventListener('start', () => { this.tween = null; });

    this.addSky();
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    document.addEventListener('visibilitychange', () => this.setActive(!document.hidden && this.active));
  }

  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 58 : 42;
    this.camera.updateProjectionMatrix();
  }

  setActive(on: boolean) {
    this.active = on;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (on) { this.lastT = performance.now(); this.loop(); }
  }

  private addSky() {
    // 星
    const n = 1600, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(1600 + Math.random() * 1400);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfd8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75 })));
    // 大気の光
    const atm = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 96, 64), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 vN; void main(){ float i = pow(max(0., .72 - dot(vN, vec3(0,0,1.))), 3.2); gl_FragColor = vec4(.24,.85,1.,1.) * i * 1.6; }',
    }));
    this.scene.add(atm);
  }

  /** 地球儀をつくる（重いので1回だけ） */
  async build(data: GlobeData) {
    // 海：全球の深さ（2048×1024）
    const gd = buildDepth({ polys: data.globe.polys, bbox: [-180, -90, 180, 90], w: 2048, h: 1024, shelfKm: 45, slopeKm: 140, wrap: true });
    const tex = new THREE.CanvasTexture(gd.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.ocean = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 96), new THREE.MeshPhongMaterial({ map: tex, shininess: 22, specular: new THREE.Color(0x1d3550) }));
    this.ocean.name = 'ocean';
    this.oceanFlat = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), new THREE.MeshPhongMaterial({ color: 0x0b2a4a, shininess: 22 }));
    this.oceanFlat.visible = false;
    this.world.add(this.ocean, this.oceanFlat);
    await idle();
    // 日本付近は細かい深さ図を重ねる
    const [w0, s0, e0, n0] = data.patch.bbox;
    const pd = buildDepth({ polys: data.patch.polys, bbox: data.patch.bbox, w: Math.round((e0 - w0) * 32), h: Math.round((n0 - s0) * 32), shelfKm: 14, slopeKm: 70, fade: 40 });
    const ptex = new THREE.CanvasTexture(pd.canvas);
    ptex.colorSpace = THREE.SRGBColorSpace;
    ptex.anisotropy = 8;
    this.patch = new THREE.Mesh(
      new THREE.SphereGeometry(R + 0.04, 96, 80, (w0 + 180) * RAD, (e0 - w0) * RAD, (90 - n0) * RAD, (n0 - s0) * RAD),
      new THREE.MeshPhongMaterial({ map: ptex, transparent: true, depthWrite: false, shininess: 22, specular: new THREE.Color(0x1d3550) }),
    );
    this.patch.name = 'patch';
    this.patch.renderOrder = 1;
    this.world.add(this.patch);
    await idle();

    // 陸地
    const land = buildLand(data.globe.polys, data.globe.japanFrom);
    const capMat = [new THREE.MeshStandardMaterial({ color: '#3d4a44', roughness: 0.95, side: THREE.DoubleSide }), new THREE.MeshStandardMaterial({ color: '#86a98f', roughness: 0.9, side: THREE.DoubleSide })];
    const wallMat = [new THREE.MeshStandardMaterial({ color: '#18211d', roughness: 1, side: THREE.DoubleSide }), new THREE.MeshStandardMaterial({ color: '#2f4136', roughness: 1, side: THREE.DoubleSide })];
    ['land', 'land-japan'].forEach((name, k) => {
      const cap = new THREE.Mesh(land.caps[k], capMat[k]);
      cap.name = name;
      const wall = new THREE.Mesh(land.walls[k], wallMat[k]);
      wall.name = `${name}-wall`;
      this.world.add(cap, wall);
    });
    await idle();

    // 海流
    this.buildCurrents();
    // 海・海溝の名前
    for (const s of SEA_LABELS) {
      const el = document.createElement('div');
      el.className = 'sea-label';
      el.style.fontSize = `${(s.size ?? 1) * 13}px`;
      el.textContent = s.name;
      this.addLabel({ el, pos: lonLatTo(s.at[0], s.at[1], R + 0.5), prio: 6, kind: 'sea', near: s.view === 'japan', far: s.view === 'world' });
    }
    for (const t of TRENCHES) {
      const at = t.path[Math.floor(t.path.length / 2)];
      const el = document.createElement('div');
      el.className = 'trench-label';
      el.textContent = t.name;
      this.addLabel({ el, pos: lonLatTo(at[0], at[1], R + 0.3), prio: 2, kind: 'trench', near: true });
    }
    this.applyLayers();
    this.loop();
  }

  private addLabel(l: Label) { this.labels.push(l); this.labelLayer.appendChild(l.el); }

  private buildCurrents() {
    const spacing = 3.4;
    for (const c of CURRENTS) {
      const pts = densify(c.path);
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const len = curve.getLength();
      const n = Math.max(2, Math.floor(len / spacing));
      this.flows.push({ curve, len, n, spacing: len / n, kind: c.kind, warmIdx: [], coldIdx: [] });
      const tube = (color: THREE.Color, off: number) => {
        const p2 = off ? pts.map((p, i) => {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          const side = new THREE.Vector3().subVectors(b, a).cross(p).normalize();
          return p.clone().addScaledVector(side, off).setLength(CUR_R - 0.05);
        }) : pts.map((p) => p.clone().setLength(CUR_R - 0.05));
        const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p2, false, 'centripetal'), Math.max(8, n * 3), 0.5, 6, false);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false }));
        m.renderOrder = 2;
        this.ribbons.add(m);
      };
      if (c.kind === 'meet') { tube(WARM, 0.8); tube(COLD, -0.8); } else tube(c.kind === 'warm' ? WARM : COLD, 0);
      if (!/赤道/.test(c.name) || c.id === 'w-nec-p') {
        const at = c.label ?? c.path[Math.floor(c.path.length / 2)];
        const el = document.createElement('div');
        el.className = `current-label ${c.kind}`;
        el.innerHTML = c.kind === 'meet' ? '<span class="dot w"></span><span class="dot c"></span><ruby>潮目<rt>しおめ</rt></ruby>' : `<span class="dot"></span>${c.name}`;
        const jp = c.view.includes('japan');
        this.addLabel({ el, pos: lonLatTo(at[0], at[1], CUR_R + 0.3), prio: c.kind === 'meet' ? 9 : jp ? 7 : 4, kind: 'current', near: jp && c.kind !== 'meet' ? true : undefined });
      }
    }
    const total = this.flows.reduce((s, f) => s + f.n, 0);
    const shape = new THREE.Shape([new THREE.Vector2(0.55, 0), new THREE.Vector2(-0.4, 0.34), new THREE.Vector2(-0.16, 0), new THREE.Vector2(-0.4, -0.34)]);
    const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    geo.scale(2, 1, 2);
    const mk = (color: THREE.Color, name: string) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.96, depthWrite: false, side: THREE.DoubleSide }), total);
      m.name = name; m.renderOrder = 3; m.frustumCulled = false;
      return m;
    };
    this.warmMesh = mk(WARM, 'arrows-warm');
    this.coldMesh = mk(COLD, 'arrows-cold');
    let wi = 0, ci = 0;
    for (const f of this.flows) for (let i = 0; i < f.n; i++) {
      if (f.kind === 'warm' || (f.kind === 'meet' && i % 2 === 0)) f.warmIdx.push(wi++); else f.coldIdx.push(ci++);
    }
    this.warmMesh.count = wi;
    this.coldMesh.count = ci;
    this.world.add(this.ribbons, this.warmMesh, this.coldMesh);
  }

  // ── カメラ ──
  get distance() { return this.camera.position.length(); }

  /** 日本がちょうど入る距離 */
  japanDistance() {
    const hfov = 2 * Math.atan(Math.tan((this.camera.fov * RAD) / 2) * this.camera.aspect);
    const half = Math.min(12.5, 14 / Math.max(1, this.camera.aspect)) * RAD * R;
    return R + Math.max(28, half / Math.tan(hfov / 2));
  }
  worldDistance() { return this.camera.aspect < 1 ? R * 4.3 : R * 2.8; }

  private tween: { from: THREE.Vector3; to: THREE.Vector3; d0: number; d1: number; t0: number; dur: number; bump: number } | null = null;
  flyTo(lon: number, lat: number, dist?: number, dur = 1500) {
    const d1 = Math.max(this.controls.minDistance, Math.min(this.controls.maxDistance, dist ?? this.distance));
    const from = this.camera.position.clone().normalize();
    const to = lonLatTo(lon, lat, 1);
    const ang = from.angleTo(to);
    if (this.reduced) { this.camera.position.copy(to.multiplyScalar(d1)); this.controls.update(); return; }
    this.tween = { from, to, d0: this.distance, d1, t0: performance.now(), dur: dur * (0.6 + Math.min(1, ang / Math.PI) * 0.6), bump: ang > 0.6 ? ang * R * 0.45 : 0 };
  }
  flyJapan(dur?: number) { this.flyTo(136.6, 36.2, this.japanDistance(), dur); }
  flyWorld(dur?: number) { this.flyTo(165, 18, this.worldDistance(), dur); }

  setLayers(l: Partial<Layers>) { this.layers = { ...this.layers, ...l }; this.applyLayers(); }
  private applyLayers() {
    if (!this.warmMesh) return;
    this.warmMesh.visible = this.coldMesh.visible = this.ribbons.visible = this.layers.currents;
    this.ocean.visible = this.patch.visible = this.layers.depth;
    this.oceanFlat.visible = !this.layers.depth;
    for (const l of this.labels) l.el.style.display = this.layers.labels && (l.kind !== 'current' || this.layers.currents) ? '' : 'none';
  }

  // ── ピン ──
  setPins(list: Pin[], dimKeys: Set<string> | null = null) {
    const seen = new Set<string>();
    const now = performance.now();
    for (const pin of list) {
      seen.add(pin.key);
      const top = pin.fish[0];
      const f = top.id ? FISH_BY_ID.get(top.id) : undefined;
      const color = f?.color ?? '#9fd3ff';
      const h = 2.6 + 1.5 * Math.sqrt(pin.count);
      let rec = this.pins.get(pin.key);
      if (!rec) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'pin rise';
        el.dataset.key = pin.key;
        el.dataset.place = pin.placeKey;
        el.dataset.fish = pin.fishKey;
        el.addEventListener('click', (e) => { e.stopPropagation(); const r = this.pins.get(pin.key); if (r) this.onPinTap(r.pin); });
        this.pinLayer.appendChild(el);
        const onSea = PLACE_BY_ID.get(pin.placeKey)?.kind === 'sea';
        const base = lonLatTo(pin.lon, pin.lat, onSea ? CUR_R : R + LAND_H + 0.05);
        const normal = base.clone().normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 6).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
        stem.position.copy(base); stem.quaternion.copy(q); stem.scale.y = 0.001;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.62, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        ring.position.copy(base).addScaledVector(normal, 0.05); ring.quaternion.copy(q);
        this.pinGroup.add(stem, ring);
        const label: Label = { el, pos: base.clone(), prio: 100 + pin.count, kind: 'pin' };
        rec = { pin, el, stem, ring, born: now, label, h, normal, base };
        this.pins.set(pin.key, rec);
        setTimeout(() => el.classList.remove('rise'), 900);
      } else if (rec.pin.count !== pin.count) {
        rec.el.classList.remove('bump'); void rec.el.offsetWidth; rec.el.classList.add('bump');
      }
      const ph = photo(top.id, true);
      const pic = ph ? `<img class="pin-photo" src="${ph}" alt="" decoding="async">` : iconSvg(f?.icon ?? 'fish', color, 30);
      rec.el.innerHTML = `<div class="pin-bubble" style="--c:${color}">${pic}<span class="pin-name">${esc(top.name)}</span><span class="pin-count">${pin.count}</span></div><div class="pin-place">${esc(pin.name)}</div>`;
      rec.el.style.setProperty('--s', String(pinScale(pin.count)));
      rec.el.setAttribute('aria-label', `${pin.name}：${pin.fish.map((x) => `${x.name}${x.count}件`).join('、')}`);
      (rec.stem.material as THREE.MeshBasicMaterial).color.set(color);
      (rec.ring.material as THREE.MeshBasicMaterial).color.set(color);
      rec.pin = pin; rec.h = h; rec.label.prio = 100 + pin.count;
      rec.el.classList.toggle('dim', !!dimKeys && !dimKeys.has(pin.key));
    }
    for (const [k, r] of this.pins) if (!seen.has(k)) { r.el.remove(); this.pinGroup.remove(r.stem, r.ring); this.pins.delete(k); }
    // 同じ産地の魚は、画面の上で縦に積んで1つずつ見えるようにする（多い魚ほど下＝産地の近く）
    const groups = new Map<string, typeof this.pins extends Map<string, infer V> ? V[] : never>();
    for (const r of this.pins.values()) {
      const g = groups.get(r.pin.placeKey) ?? [];
      g.push(r);
      groups.set(r.pin.placeKey, g);
    }
    const maxStack = this.mode === 'world' ? 4 : 6;
    for (const g of groups.values()) {
      g.sort((a, b) => b.pin.count - a.pin.count || a.pin.fishKey.localeCompare(b.pin.fishKey));
      let dy = 0;
      g.forEach((r, i) => {
        r.label.dy = dy;
        r.label.hidden = i >= maxStack;
        r.el.classList.toggle('stacked', i > 0);
        r.el.dataset.more = i === maxStack - 1 && g.length > maxStack ? `ほか${g.length - maxStack}種` : '';
        // 茎と輪は先頭（いちばん多い魚）だけ見せる
        r.stem.visible = r.ring.visible = i === 0;
        dy += 30 * pinScale(r.pin.count) + 6;
      });
    }
  }

  setGhosts(ids: string[]) {
    for (const g of this.ghosts) g.el.remove();
    this.ghosts = [];
    for (const id of ids) {
      const p = PLACE_BY_ID.get(id);
      if (!p) continue;
      const el = document.createElement('div');
      el.className = 'ghost';
      el.innerHTML = `<i></i><span>${esc(p.name)}</span>`;
      this.labelLayer.appendChild(el);
      this.ghosts.push({ el, pos: lonLatTo(p.lon, p.lat, R + LAND_H + 0.1), prio: 50, kind: 'ghost' });
    }
  }

  // ── 描画 ──
  private loop = () => {
    if (!this.active) { this.raf = 0; return; }
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.elapsed += dt;
    if (!this.warmMesh) return;

    if (this.tween) {
      const k = Math.min(1, (now - this.tween.t0) / this.tween.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const q = new THREE.Quaternion().setFromUnitVectors(this.tween.from, this.tween.to);
      const dir = this.tween.from.clone().applyQuaternion(new THREE.Quaternion().slerp(q, e));
      const d = this.tween.d0 + (this.tween.d1 - this.tween.d0) * e + this.tween.bump * Math.sin(Math.PI * e);
      this.camera.position.copy(dir.multiplyScalar(d));
      if (k >= 1) this.tween = null;
    }
    // 近いほどゆっくり回す（Google Earth のように）
    this.controls.rotateSpeed = Math.max(0.04, Math.min(1, ((this.distance - R) / R) * 0.55));
    this.controls.update();

    const m: MapMode = this.distance < R * 2.05 ? 'detail' : 'world';
    if (m !== this.mode) { this.mode = m; this.onModeChange(m); }

    if (this.layers.currents) this.updateArrows(this.reduced ? 0 : this.elapsed);
    for (const r of this.pins.values()) {
      const age = Math.min(1, (now - r.born) / 700);
      const e = this.reduced ? 1 : 1 - Math.pow(1 - age, 3);
      r.stem.scale.y += (r.h * e - r.stem.scale.y) * 0.25;
      const pulse = this.reduced ? 0 : (this.elapsed * 0.8 + r.pin.lat * 0.1) % 1;
      const s = pinScale(r.pin.count) * (1 + pulse * 1.3);
      r.ring.scale.set(s, 1, s);
      (r.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - pulse);
      r.label.pos.copy(r.base).addScaledVector(r.normal, r.stem.scale.y);
    }
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    this.adapt(performance.now() - t0, dt);
    this.placeLabels();
  };

  private slow = 0;
  private adapt(ms: number, dt: number) {
    if (this.frames < 30) return;
    this.slow = dt > 0.045 || ms > 30 ? this.slow + 1 : Math.max(0, this.slow - 0.5);
    const pr = this.renderer.getPixelRatio();
    if (this.slow > 40 && pr > 1) { this.renderer.setPixelRatio(Math.max(1, pr - 0.5)); this.resize(); this.slow = 0; }
  }

  private mtx = new THREE.Matrix4();
  private p = new THREE.Vector3();
  private t = new THREE.Vector3();
  private nrm = new THREE.Vector3();
  private side = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private updateArrows(time: number) {
    const speed = 4.5;
    const zoom = Math.max(0.75, Math.min(1.7, (this.distance - R) / 70));
    for (const f of this.flows) {
      let wk = 0, ck = 0;
      for (let i = 0; i < f.n; i++) {
        const u = ((i * f.spacing + time * speed) % f.len) / f.len;
        f.curve.getPointAt(u, this.p);
        f.curve.getTangentAt(u, this.t);
        this.nrm.copy(this.p).normalize();
        this.t.addScaledVector(this.nrm, -this.t.dot(this.nrm)).normalize();
        this.side.crossVectors(this.t, this.nrm);
        const edge = Math.min(1, u * 10, (1 - u) * 10) * zoom;
        this.mtx.makeBasis(this.t, this.nrm, this.side);
        this.mtx.scale(this.sc.set(edge, 1, edge));
        this.mtx.setPosition(this.p);
        if (f.kind === 'warm' || (f.kind === 'meet' && i % 2 === 0)) this.warmMesh.setMatrixAt(f.warmIdx[wk++], this.mtx);
        else this.coldMesh.setMatrixAt(f.coldIdx[ck++], this.mtx);
      }
    }
    this.warmMesh.instanceMatrix.needsUpdate = true;
    this.coldMesh.instanceMatrix.needsUpdate = true;
  }

  private sp = new THREE.Vector3();
  private placeLabels() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const cam = this.camera.position;
    const near = this.distance < R * 2.3, far = this.distance > R * 1.6;
    const all = [...this.labels, ...this.ghosts, ...[...this.pins.values()].map((p) => p.label)];
    const collide = performance.now() - this.lastCollide > 160;
    if (collide) { this.lastCollide = performance.now(); all.sort((a, b) => b.prio - a.prio); }
    const placed: DOMRect[] = [];
    for (const l of all) {
      // 地球の裏側にあるものは隠す
      const facing = this.nrm.copy(l.pos).normalize().dot(this.sp.subVectors(cam, l.pos).normalize());
      this.sp.copy(l.pos).project(this.camera);
      const x = (this.sp.x * 0.5 + 0.5) * w, y = (-this.sp.y * 0.5 + 0.5) * h;
      const off = facing < 0.12 || x < -80 || x > w + 80 || y < -80 || y > h + 80;
      const yy = y - (l.dy ?? 0);
      l.el.style.transform = `translate3d(${x.toFixed(1)}px,${yy.toFixed(1)}px,0)`;
      if (l.kind === 'pin') {
        l.el.style.zIndex = String(Math.round(y) * 10 - Math.round((l.dy ?? 0) / 30));
        l.el.style.visibility = off || l.hidden ? 'hidden' : '';
        continue;
      }
      if (!collide) continue;
      let hide = off || (l.near === true && !near) || (l.far === true && !far) || (l.kind === 'trench' && this.distance > R * 1.75);
      if (!hide && l.kind !== 'ghost') {
        const r = l.el.getBoundingClientRect();
        if (r.width) {
          for (const p of placed) if (!(r.right < p.left || r.left > p.right || r.bottom < p.top || r.top > p.bottom)) { hide = true; break; }
          if (!hide) placed.push(r);
        }
      }
      l.el.classList.toggle('hid', hide);
    }
  }

  info() {
    return {
      view: this.mode, frames: this.frames, dist: Math.round(this.distance),
      warm: this.warmMesh?.count ?? 0, cold: this.coldMesh?.count ?? 0,
      arrows: (this.warmMesh?.count ?? 0) + (this.coldMesh?.count ?? 0),
      meet: this.flows.filter((f) => f.kind === 'meet').length, pins: this.pins.size,
    };
  }
  arrowSample(): string {
    return Array.from(this.warmMesh.instanceMatrix.array.slice(12, 15)).join(',');
  }
}

function idle() { return new Promise((r) => setTimeout(r, 0)); }
function esc(s: string) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
