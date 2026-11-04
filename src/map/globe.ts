// 地球儀（3D球体）。端がなく、日本から世界までひと続きで見られる。
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CURRENTS, FISHING_GROUNDS, SEA_LABELS, TRENCHES, type LonLat, type OceanCurrent } from '../data/ocean';
import { FISH_BY_ID } from '../data/fish';
import { PLACE_BY_ID } from '../data/places';
import { buildDepth } from './depth';
import { pinScale, type Pin } from '../core/model';
import { iconSvg } from '../ui/icons';
import { figure } from '../ui/photo';

export const R = 100;
const LAND_H = 0.8;
const CUR_R = R + 0.35;
const WARM = new THREE.Color('#ff4a5c');
const COLD = new THREE.Color('#3aa8ff');
const RAD = Math.PI / 180;

export type MapMode = 'detail' | 'world';
export interface Layers { currents: boolean; depth: boolean; labels: boolean }
export interface GlobeData { globe: { polys: number[][][]; japanFrom: number }; patch: { bbox: [number, number, number, number]; polys: number[][][] } }

interface Label { el: HTMLElement; pos: THREE.Vector3; prio: number; kind: 'sea' | 'current' | 'trench' | 'ground' | 'pin' | 'ghost'; near?: boolean; far?: boolean }
interface PinRec { pin: Pin; el: HTMLElement; bill: THREE.Mesh; shadow: THREE.Mesh; tex: THREE.Texture; born: number; bumpAt: number; label: Label; base: THREE.Vector3; normal: THREE.Vector3; phase: number; offset: number; row: number; first: boolean; wPx: number; hPx: number; dim: boolean; fade: number; placeTxt?: string; neon: 'warm' | 'cold' | null; glow: THREE.Mesh | null; glowPad: [number, number] }
const FIG_GEO = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const SHADOW_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
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
  private pins = new Map<string, PinRec>();
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

  private inset = 0;
  /** 画面の右側を図鑑などでふさぐとき、その幅（px）。地球儀の中心を残りの部分の真ん中へずらす */
  setInset(px: number) {
    px = Math.max(0, Math.round(px));
    if (px === this.inset) return;
    this.inset = px;
    this.resize();
  }
  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    const vis = Math.max(1, w - this.inset);   // 地球儀が見えている部分の幅
    this.camera.fov = vis / h < 1 ? 58 : 42;
    if (this.inset) {
      // 横に inset だけ広い仮の画面を考え、その左から inset ずらした所を表示する → 中心が左へ inset/2 動く
      this.camera.aspect = (w + this.inset) / h;
      this.camera.setViewOffset(w + this.inset, h, this.inset, 0, w, h);
    } else {
      this.camera.clearViewOffset();
      this.camera.aspect = w / h;
    }
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
    // 主な漁場（日本を見ているときだけ）
    for (const g of FISHING_GROUNDS) {
      const el = document.createElement('div');
      el.className = 'ground-label';
      el.title = g.note;
      el.innerHTML = `<i></i>${g.name}`;
      this.addLabel({ el, pos: lonLatTo(g.at[0], g.at[1], R + 0.4), prio: 5, kind: 'ground', near: true });
    }
    for (const t of TRENCHES) {
      const at = t.path[Math.floor(t.path.length / 2)];
      const el = document.createElement('div');
      el.className = 'trench-label';
      el.innerHTML = `${t.name}<small>6000m〜</small>`;
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
        m.userData.kind = color === WARM ? 'warm' : 'cold';
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
    // 日本（東西におよそ±12.5度、南北におよそ±9.5度）が、見えている部分にちょうど入る距離。
    // 縦長のスマホでは横の幅で、横長のPCやタブレットでは縦の高さで決まる
    const h = this.host.clientHeight || 1;
    const aspect = Math.max(0.2, ((this.host.clientWidth || 1) - this.inset) / h);
    const vfov = this.camera.fov * RAD;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const byW = (12.5 * RAD * R) / Math.tan(hfov / 2);
    const byH = (9.5 * RAD * R) / Math.tan(vfov / 2);
    return R + Math.max(28, byW, byH);
  }
  worldDistance() { return ((this.host.clientWidth || 1) - this.inset) / (this.host.clientHeight || 1) < 1 ? R * 4.3 : R * 2.8; }

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

  // ── 改良版：関係する海流だけを光らせる ──
  private emphasis: 'warm' | 'cold' | 'both' | 'none' | null = null;
  /** warm／cold＝その海流だけ光らせ、ほかはうすく。both＝両方そのまま（名前だけ整理）。none＝海流をうすく。null＝元どおり */
  setEmphasis(k: 'warm' | 'cold' | 'both' | 'none' | null) {
    if (k === this.emphasis || !this.warmMesh) return;
    this.emphasis = k;
    const lit = (kind: 'warm' | 'cold') => k === null || k === 'both' || k === kind;
    const arrow = (m: THREE.InstancedMesh, kind: 'warm' | 'cold') => { (m.material as THREE.MeshBasicMaterial).opacity = lit(kind) ? 0.96 : 0.12; };
    arrow(this.warmMesh, 'warm');
    arrow(this.coldMesh, 'cold');
    for (const r of this.ribbons.children as THREE.Mesh[]) {
      const kind = r.userData.kind as 'warm' | 'cold';
      (r.material as THREE.MeshBasicMaterial).opacity = k === null ? 0.2 : lit(kind) ? 0.42 : 0.04;
    }
    for (const l of this.labels) {
      let dim = false;
      if (k !== null) {
        if (l.kind === 'current') {
          const c = l.el.classList;
          dim = c.contains('meet') ? k === 'none' : (c.contains('warm') && !lit('warm')) || (c.contains('cold') && !lit('cold'));
        } else dim = true;   // 海・海溝・漁場の名前は一歩下げる
      }
      l.el.classList.toggle('fx-dim', dim);
    }
  }

  // ── 改良版：産地から日本へのびる光の弧 ──
  private arcs: { mesh: THREE.Mesh; head: THREE.Sprite; curve: THREE.CatmullRomCurve3; t0: number; grow: number; hold: number; fade: number; segs: number; rad: number }[] = [];
  private dotTex: THREE.Texture | null = null;
  arc(lon: number, lat: number, toLon: number, toLat: number, kind: 'domestic' | 'overseas') {
    if (!this.warmMesh) return;
    const a = lonLatTo(lon, lat, 1), b = lonLatTo(toLon, toLat, 1);
    const ang = a.angleTo(b);
    if (ang < 0.015) return;
    while (this.arcs.length >= 8) this.dropArc(this.arcs[0]);
    const q = new THREE.Quaternion().setFromUnitVectors(a, b);
    const lift = R * (0.025 + Math.min(0.32, ang * 0.2));
    const pts: THREE.Vector3[] = [];
    const N = 48;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push(a.clone().applyQuaternion(new THREE.Quaternion().slerp(q, t)).multiplyScalar(R + 0.8 + lift * Math.sin(Math.PI * t)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const segs = 96, rad = 6;
    const far = kind === 'overseas';
    const geo = new THREE.TubeGeometry(curve, segs, far ? 0.55 : 0.32, rad, false);
    geo.setDrawRange(0, 0);
    const color = far ? 0xffc44d : 0x3dff9a;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    if (!this.dotTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      this.dotTex = new THREE.CanvasTexture(c);
    }
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dotTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    head.renderOrder = 5;
    const size = far ? 7 : 4.5;
    head.scale.set(size, size, 1);
    head.position.copy(pts[0]);
    this.world.add(mesh, head);
    this.arcs.push({ mesh, head, curve, t0: performance.now(), grow: this.reduced ? 0 : 1100 + ang * 600, hold: 1800, fade: 800, segs, rad });
  }
  private dropArc(r: (typeof this.arcs)[number]) {
    this.world.remove(r.mesh, r.head);
    r.mesh.geometry.dispose();
    (r.mesh.material as THREE.Material).dispose();
    r.head.material.dispose();
    this.arcs = this.arcs.filter((x) => x !== r);
  }
  private updateArcs(now: number) {
    for (const r of [...this.arcs]) {
      const t = now - r.t0;
      const k = r.grow ? Math.min(1, t / r.grow) : 1;
      const e = 1 - Math.pow(1 - k, 3);
      r.mesh.geometry.setDrawRange(0, Math.ceil(e * r.segs) * r.rad * 6);
      r.head.position.copy(r.curve.getPointAt(e));
      // 日本に着いたら、ぽんと光る
      const after = t - r.grow;
      const s0 = r.head.userData.s0 ?? (r.head.userData.s0 = r.head.scale.x);
      if (after > 0) { const p = Math.min(1, after / 500); r.head.scale.setScalar(s0 * (1 + 1.4 * Math.sin(Math.PI * p))); }
      const fadeK = (t - r.grow - r.hold) / r.fade;
      if (fadeK > 0) {
        const o = Math.max(0, 1 - fadeK);
        (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * o;
        r.head.material.opacity = o;
      }
      if (fadeK >= 1) this.dropArc(r);
    }
  }
  arcCount() { return this.arcs.length; }

  setLayers(l: Partial<Layers>) { this.layers = { ...this.layers, ...l }; this.applyLayers(); }
  private applyLayers() {
    if (!this.warmMesh) return;
    this.warmMesh.visible = this.coldMesh.visible = this.ribbons.visible = this.layers.currents;
    this.ocean.visible = this.patch.visible = this.layers.depth;
    this.oceanFlat.visible = !this.layers.depth;
    for (const l of this.labels) l.el.style.display = this.layers.labels && (l.kind !== 'current' || this.layers.currents) ? '' : 'none';
  }

  // ── 魚の3Dフィギュア（地球儀の上に立てる。入力が多いほど大きい） ──
  private texCache = new Map<string, THREE.Texture>();
  private shadowTex: THREE.Texture | null = null;
  private figTexture(id: string | null, icon: Parameters<typeof iconSvg>[0], color: string): THREE.Texture {
    const key = id ?? `icon:${icon}:${color}`;
    let t = this.texCache.get(key);
    if (t) return t;
    const url = figure(id);
    if (url) {
      t = new THREE.TextureLoader().load(url, (tx) => { tx.needsUpdate = true; });
    } else {
      // 図鑑にない魚：アイコンを絵にして使う
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 172;
      t = new THREE.CanvasTexture(cv);
      const img = new Image();
      img.onload = () => { const c = cv.getContext('2d')!; c.drawImage(img, 8, 8, 240, 156); t!.needsUpdate = true; };
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(icon, color, 240).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
    }
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    this.texCache.set(key, t);
    return t;
  }
  // ── 暖流の魚は赤、寒流の魚は青のネオンでフィギュアのまわりを光らせる ──
  // フィギュアの形（透明な部分をのぞいた輪郭）から、ふちの線とぼんやりした光を画像にして、フィギュアのうしろに重ねる。
  // ctx.filter は古いiPadのSafariで使えないため、影（shadowBlur）で光をつくる
  private glowCache = new Map<string, { tex: THREE.Texture; pad: [number, number] }>();
  private glowTexture(key: string, img: CanvasImageSource & { width: number; height: number }, color: string, core: string) {
    const hit = this.glowCache.get(key);
    if (hit) return hit;
    const iw = img.width, ih = img.height;
    const s = Math.min(1, 320 / Math.max(iw, ih));         // 光の画像は小さめでよい
    const w = Math.max(8, Math.round(iw * s)), h = Math.max(8, Math.round(ih * s));
    const pad = Math.round(Math.max(w, h) * 0.16) + 8;
    // フィギュアの形を色でぬったもの
    const tint = (fill: string) => {
      const t = document.createElement('canvas');
      t.width = w; t.height = h;
      const tc = t.getContext('2d')!;
      tc.drawImage(img, 0, 0, w, h);
      tc.globalCompositeOperation = 'source-in';
      tc.fillStyle = fill;
      tc.fillRect(0, 0, w, h);
      return t;
    };
    const sil = tint(color), hot = tint(core);
    const cv = document.createElement('canvas');
    cv.width = w + pad * 2; cv.height = h + pad * 2;
    const c = cv.getContext('2d')!;
    // ぼんやりした光：形を画面の外に置いて、影だけを内側に落とす
    const far = cv.width + 50;
    c.shadowColor = color;
    c.shadowOffsetX = far;
    for (const blur of [pad * 0.9, pad * 0.9, pad * 0.55, pad * 0.55, pad * 0.3, pad * 0.15]) { c.shadowBlur = blur; c.drawImage(sil, pad - far, pad); }
    c.shadowColor = 'transparent';
    // くっきりしたふちの線（形を少しずつずらして重ねる）。外側は色、内側は白っぽく光る「しん」
    const e = Math.max(4, Math.max(w, h) * 0.045);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; c.drawImage(sil, pad + Math.cos(a) * e, pad + Math.sin(a) * e); }
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; c.drawImage(hot, pad + Math.cos(a) * e * 0.55, pad + Math.sin(a) * e * 0.55); }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const out = { tex, pad: [pad / w, pad / h] as [number, number] };
    this.glowCache.set(key, out);
    return out;
  }
  /** フィギュアの画像が読みこまれたら、ネオンの光を用意する */
  private ensureGlow(r: PinRec) {
    if (r.glow || !r.neon) return;
    const img = r.tex.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (!img || !img.width) return;
    const [color, core] = r.neon === 'warm' ? ['#ff2443', '#ff8a9a'] : ['#1a8cff', '#7fd0ff'];
    const g = this.glowTexture(`${r.pin.fish[0].id ?? r.pin.fishKey}|${r.neon}`, img, color, core);
    const m = new THREE.Mesh(FIG_GEO, new THREE.MeshBasicMaterial({ map: g.tex, transparent: true, depthTest: false, depthWrite: false }));
    m.matrixAutoUpdate = false;
    m.renderOrder = 4.5;
    r.glow = m;
    r.glowPad = g.pad;
    this.pinGroup.add(m);
  }

  private getShadowTex() {
    if (this.shadowTex) return this.shadowTex;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const c = cv.getContext('2d')!;
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,.75)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    this.shadowTex = new THREE.CanvasTexture(cv);
    return this.shadowTex;
  }

  setPins(list: Pin[], dimKeys: Set<string> | null = null) {
    const seen = new Set<string>();
    const now = performance.now();
    for (const pin of list) {
      seen.add(pin.key);
      const top = pin.fish[0];
      const f = top.id ? FISH_BY_ID.get(top.id) : undefined;
      const color = f?.color ?? '#9fd3ff';
      let rec = this.pins.get(pin.key);
      if (!rec) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'pin';
        el.dataset.key = pin.key;
        el.dataset.place = pin.placeKey;
        el.dataset.fish = pin.fishKey;
        el.addEventListener('click', (e) => { e.stopPropagation(); const r = this.pins.get(pin.key); if (r) this.onPinTap(r.pin); });
        this.pinLayer.appendChild(el);
        const onSea = PLACE_BY_ID.get(pin.placeKey)?.kind === 'sea';
        const base = lonLatTo(pin.lon, pin.lat, onSea ? CUR_R : R + LAND_H + 0.05);
        const normal = base.clone().normalize();
        const tex = this.figTexture(top.id, f?.icon ?? 'fish', color);
        const bill = new THREE.Mesh(FIG_GEO, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
        bill.matrixAutoUpdate = false;
        bill.renderOrder = 5;
        const shadow = new THREE.Mesh(SHADOW_GEO, new THREE.MeshBasicMaterial({ map: this.getShadowTex(), transparent: true, depthWrite: false }));
        shadow.matrixAutoUpdate = false;
        shadow.renderOrder = 4;
        this.pinGroup.add(shadow, bill);
        const label: Label = { el, pos: base.clone(), prio: 100 + pin.count, kind: 'pin' };
        const cur = f?.current;
        rec = { pin, el, bill, shadow, tex, born: now, bumpAt: 0, label, base, normal, phase: Math.random() * 6.28, offset: 0, row: 0, first: false, wPx: 0, hPx: 0, dim: false, fade: 1, neon: cur === 'warm' || cur === 'cold' ? cur : null, glow: null, glowPad: [0, 0] };
        el.dataset.neon = rec.neon ?? '';
        this.pins.set(pin.key, rec);
      } else if (rec.pin.count !== pin.count) {
        rec.bumpAt = now;
      }
      const sig = `${top.name}|${pin.count}|${pin.name}`;
      if (rec.el.dataset.sig !== sig) {
        rec.el.innerHTML = `<span class="pin-tag" style="--c:${color}"><span class="pin-name">${esc(top.name)}</span><span class="pin-count">${pin.count}</span></span><span class="pin-place">${esc(pin.name)}</span>`;
        rec.el.dataset.sig = sig;
        rec.placeTxt = undefined;
      }
      rec.el.style.setProperty('--s', String(pinScale(pin.count)));
      rec.el.setAttribute('aria-label', `${pin.name}：${top.name}${pin.count}件`);
      rec.pin = pin;
      rec.label.prio = 100 + pin.count;
      const dim = !!dimKeys && !dimKeys.has(pin.key);
      rec.el.classList.toggle('dim', dim);
      rec.dim = dim;
      (rec.bill.material as THREE.MeshBasicMaterial).alphaTest = dim ? 0 : 0.08;
    }
    for (const [k, r] of this.pins) if (!seen.has(k)) {
      r.el.remove(); this.pinGroup.remove(r.bill, r.shadow); (r.bill.material as THREE.Material).dispose(); (r.shadow.material as THREE.Material).dispose();
      if (r.glow) { this.pinGroup.remove(r.glow); (r.glow.material as THREE.Material).dispose(); }
      this.pins.delete(k);
    }
    // 同じ産地の魚は横に並べる（多い魚ほど真ん中）。並びきらないときは上の段へ
    const groups = new Map<string, PinRec[]>();
    for (const r of this.pins.values()) {
      const g = groups.get(r.pin.placeKey) ?? [];
      g.push(r);
      groups.set(r.pin.placeKey, g);
    }
    this.groups = [...groups.values()];
    for (const g of this.groups) {
      g.sort((a, b) => b.pin.count - a.pin.count || a.pin.fishKey.localeCompare(b.pin.fishKey));
      g.forEach((r, i) => { r.first = i === 0; r.el.classList.toggle('first', i === 0); });
    }
  }
  private groups: PinRec[][] = [];
  /** 産地ごとの「ずらし量」（画面の px）。となりの産地のフィギュアと重ならないよう、毎フレーム少しずつ動かす */
  private groupOff = new Map<string, { x: number; y: number }>();
  private figT = 0;
  private leaders: THREE.LineSegments | null = null;
  private getLeaders(): THREE.LineSegments {
    if (this.leaders) return this.leaders;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 256), 3));
    geo.setDrawRange(0, 0);
    this.leaders = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false }));
    this.leaders.frustumCulled = false;
    this.leaders.renderOrder = 4;
    this.pinGroup.add(this.leaders);
    return this.leaders;
  }

  /** 毎フレーム：フィギュアの大きさ・並び・向き・浮き上がりを計算する。
   *  フィギュアはいつも画面に向かって立ち（上から見ても横から見ても形が分かる）、足もとに影を落とす。
   *  ちがう産地のフィギュアどうしが重なるときは、画面の上で押し合ってずらし、産地とは細い線でつなぐ */
  private updateFigures(now: number) {
    const cam = this.camera.position;
    const camRight = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const camUp = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const camBack = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 2);
    const W = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    const perPx = (d: number) => (2 * d * Math.tan((this.camera.fov * RAD) / 2)) / h;
    const zoomK = Math.max(0.5, Math.min(3.6, (this.distance - R) / 60));
    const perRow = 6;
    // 1つの産地に魚がたくさんあるとき、遠くから見ている間は多い順に4種だけ名札を出す（残りはフィギュアだけ）。
    // 寄って見ると（日本全体の約2倍の大きさ）、すべての名札を出す
    const showAll = (this.japanDistance() - R) / Math.max(1, this.distance - R) >= 1.8;
    const pos = new THREE.Vector3(), foot = new THREE.Vector3(), tan = new THREE.Vector3(), roll = new THREE.Matrix4(), sc = new THREE.Vector3(), tmp = new THREE.Vector3();

    // 1) 産地ごとに、フィギュアの大きさと並び（段）を決める
    type Item = { r: PinRec; w: number; h: number; cx: number; row: number; rowBase: number; rise: number };
    const plans = this.groups.map((g) => {
      const d = cam.distanceTo(g[0].base);
      const px = perPx(d);
      // 各フィギュアの大きさ（面積が入力の数に比例するよう、√で大きくする。細長い魚も丸い貝も同じくらいの見た目の大きさに）
      const limit = showAll || g.length <= 5 ? g.length : 4;
      const sizes = g.map((r, gi) => {
        const tagged = gi < limit;
        if (r.el.classList.contains('mini') === tagged) r.el.classList.toggle('mini', !tagged);
        const img = r.tex.image as { width?: number; height?: number } | undefined;
        const aspect = img && img.width && img.height ? img.width / img.height : 1.6;
        const age = (now - r.born) / 1000;
        const pop = this.reduced ? 1 : Math.max(0, 1 - Math.exp(-7 * age) * Math.cos(9 * age));
        const sb = (now - r.bumpAt) / 1000;
        const bump = r.bumpAt && sb < 0.6 && !this.reduced ? 1 + 0.35 * Math.sin((sb / 0.6) * Math.PI) : 1;
        const S = (this.mode === 'world' ? 1.7 : 2.4) * zoomK * pinScale(r.pin.count) * pop * bump;
        const w = S * Math.min(2.4, Math.pow(aspect, 0.62)), hh = w / aspect;
        const labelW = (r.pin.fish[0].name.length * 9 + 26) * px;
        return { w, h: hh, slot: tagged ? Math.max(w, labelW) * 1.04 : w * 1.08 + 4 * px, rise: Math.min(1, age * 2.2) };
      });
      const items: Item[] = [];
      // 横に並べる。画面の幅に収まらなくなったら上の段へ（多い魚ほど下の段の真ん中寄り）
      const maxRow = Math.min(W * 0.84, g.length > 5 && !showAll ? 210 : 320) * px;
      // いちばん多い魚の下に産地名。名札をしぼったときは「ほか○種」
      const hidden = g.length - limit;
      const placeTxt = hidden ? `${g[0].pin.name}・ほか${hidden}種` : g[0].pin.name;
      if (g[0].placeTxt !== placeTxt) {
        const el = g[0].el.querySelector('.pin-place');
        if (el) { el.textContent = placeTxt; g[0].placeTxt = placeTxt; }
      }
      const rows: number[][] = [];
      let cur: number[] = [], curW = 0;
      sizes.forEach((z, i) => {
        if (cur.length && (curW + z.slot > maxRow || cur.length >= perRow)) { rows.push(cur); cur = []; curW = 0; }
        cur.push(i); curW += z.slot;
      });
      if (cur.length) rows.push(cur);
      let rowBase = 0, width = 0;
      rows.forEach((idx0, row) => {
        // 多い魚ほど真ん中に（左右へ交互に並べる）
        const idx: number[] = [];
        idx0.forEach((i, k) => (k % 2 ? idx.unshift(i) : idx.push(i)));
        const sz = idx.map((i) => sizes[i]);
        const total = sz.reduce((s, z) => s + z.slot, 0);
        width = Math.max(width, total);
        let x = -total / 2;
        idx.forEach((i) => { const z = sizes[i]; items.push({ r: g[i], w: z.w, h: z.h, cx: x + z.slot / 2, row, rowBase, rise: z.rise }); x += z.slot; });
        // 名札のある段は名札の分だけ広くあける
        const tagRow = idx.some((i) => i < limit);
        rowBase += Math.max(...sz.map((z) => z.h)) * 1.02 + (tagRow ? 20 : 3) * px;
      });
      // 画面上の位置と、フィギュア全体が占める四角（名札の分も含む）
      tmp.copy(g[0].base).project(this.camera);
      const sx = (tmp.x * 0.5 + 0.5) * W, sy = (-tmp.y * 0.5 + 0.5) * h;
      const facing = this.nrm.copy(g[0].base).normalize().dot(this.sp.subVectors(cam, g[0].base).normalize());
      // 地球の向こう側へ回りこむまで消さない（ふちに近づくと少しずつうすくなる）
      const fade = Math.max(0, Math.min(1, (facing + 0.02) / 0.1));
      for (const r of g) r.fade = fade;
      const vis = fade > 0.05 && tmp.z < 1 && sx > -200 && sx < W + 200 && sy > -200 && sy < h + 200;
      const key = g[0].pin.placeKey;
      let off = this.groupOff.get(key);
      if (!off) { off = { x: 0, y: 0 }; this.groupOff.set(key, off); }
      const weight = g.reduce((s, r) => s + r.pin.count, 0);
      return { g, items, px, sx, sy, wpx: width / px, hpx: (rowBase + 0.22 * (items[0]?.h ?? 0)) / px + 20, vis, off, tx: 0, ty: 0, weight };
    });

    // 2) ちがう産地どうしが重ならないよう、画面の上で押し合う（少ない方が多く動く）
    const vis = plans.filter((p) => p.vis);
    for (let it = 0; it < 12; it++) {
      for (let i = 0; i < vis.length; i++) {
        for (let j = i + 1; j < vis.length; j++) {
          const a = vis[i], b = vis[j];
          const ax = a.sx + a.tx, ay = a.sy + a.ty, bx = b.sx + b.tx, by = b.sy + b.ty;
          // 少しの重なりは許す（産地からなるべく離さないため）
          const ox = (a.wpx + b.wpx) * 0.42 - Math.abs(ax - bx);
          // 四角は足もと（sy）から上に hpx の高さ
          const oy = Math.min(ay, by) - Math.max(ay - a.hpx * 0.85, by - b.hpx * 0.85);
          if (ox <= 0 || oy <= 0) continue;
          const wa = b.weight / (a.weight + b.weight), wb = 1 - wa;
          if (ox < oy) {
            const dir = ax < bx || (ax === bx && i < j) ? -1 : 1;
            a.tx += dir * ox * wa; b.tx -= dir * ox * wb;
          } else {
            // 上下に押す。画面の上にある方は上へ、下にある方は下へ
            const up = ay < by ? 1 : -1;
            a.ty -= up * oy * wa; b.ty += up * oy * wb;
          }
        }
      }
    }
    // ずらしすぎない。なめらかに追いかける
    const dtF = Math.min(0.5, Math.max(0, this.elapsed - this.figT));
    this.figT = this.elapsed;
    const k = this.reduced ? 1 : 1 - Math.exp(-dtF * 9);
    for (const p of plans) {
      const lim = Math.max(90, p.wpx * 1.2);
      let tx = p.vis ? Math.max(-lim, Math.min(lim, p.tx)) : 0;
      const ty = p.vis ? Math.max(-lim, Math.min(lim, p.ty)) : 0;
      // 画面の外へは押し出さない
      if (p.vis && p.sx > 0 && p.sx < W) tx = p.wpx > W - 12 ? W / 2 - p.sx : Math.max(6 + p.wpx / 2 - p.sx, Math.min(W - 6 - p.wpx / 2 - p.sx, tx));
      p.off.x += (tx - p.off.x) * k;
      p.off.y += (ty - p.off.y) * k;
    }

    // 3) フィギュア・影・名札・つなぐ線を置く
    const leaders = this.getLeaders();
    const lp = leaders.geometry.getAttribute('position') as THREE.BufferAttribute;
    let nl = 0;
    for (const p of plans) {
      const g = p.g, n = g[0].normal, px = p.px;
      // 地面に沿った横向き（影を並べる向き）
      tan.copy(camRight).addScaledVector(n, -camRight.dot(n)).normalize();
      const dx = p.off.x * px, dy = -p.off.y * px;
      const moved = Math.hypot(p.off.x, p.off.y) > 10;
      for (const z of p.items) {
        const r = z.r;
        const bob = this.reduced ? 0 : Math.sin(this.elapsed * 1.7 + r.phase) * 0.07 * z.h;
        // 地面からふわっと浮き上がる
        const ease = 1 - Math.pow(1 - z.rise, 3);
        const lift = (0.22 * z.h + bob) * ease + z.rowBase;
        const cx = z.cx;
        pos.copy(r.base).addScaledVector(camRight, cx + dx).addScaledVector(camUp, lift + dy);
        {
          const m = r.bill.matrix;
          m.makeBasis(camRight, camUp, camBack);
          if (!this.reduced) m.multiply(roll.makeRotationZ(Math.sin(this.elapsed * 1.3 + r.phase) * 0.06));
          m.scale(sc.set(z.w, z.h, 1));
          m.setPosition(pos);
          r.bill.matrixWorldNeedsUpdate = true;
          (r.bill.material as THREE.MeshBasicMaterial).opacity = (r.dim ? 0.14 : 1) * r.fade;
          r.bill.visible = r.fade > 0.01;
          // ネオンの光：フィギュアと同じ向き・同じゆれで、ひとまわり大きく、うしろに重ねる
          this.ensureGlow(r);
          if (r.glow) {
            const [px0, py0] = r.glowPad;
            const gm = r.glow.matrix;
            gm.copy(m);
            gm.scale(sc.set(1 + px0 * 2, 1 + py0 * 2, 1));
            // 下の余白の分だけ下げる（FIG_GEO は下の辺が基準）
            gm.multiply(roll.makeTranslation(0, -py0 / (1 + py0 * 2), 0));
            r.glow.matrixWorldNeedsUpdate = true;
            const pulse = this.reduced ? 1 : 0.88 + 0.12 * Math.sin(this.elapsed * 2.6 + r.phase);
            (r.glow.material as THREE.MeshBasicMaterial).opacity = (r.dim ? 0.1 : 1) * pulse * r.fade * ease;
            r.glow.visible = r.bill.visible;
          }
          // 足もとの影（地面に落とす。浮くほどうすく小さく。ずらしたときは産地に小さく残す）
          const sx = moved ? cx * 0.25 : cx;
          foot.copy(r.base).addScaledVector(tan, sx).setLength(r.base.length() + 0.06);
          const sm = r.shadow.matrix;
          const ks = (1 - Math.min(0.5, (lift / Math.max(0.001, z.h)) * 0.6)) * (moved ? 0.45 : 1);
          sm.makeBasis(tan, n, tan.clone().cross(n).negate());
          sm.scale(sc.set(z.w * 0.85 * ks, 1, z.w * 0.3 * ks));
          sm.setPosition(foot);
          r.shadow.matrixWorldNeedsUpdate = true;
          r.shadow.visible = z.row === 0 && r.fade > 0.01;
          (r.shadow.material as THREE.MeshBasicMaterial).opacity = (r.dim ? 0.15 : 0.9) * ease * r.fade;
          // 名札はフィギュアの上。タップできる範囲はフィギュア全体
          r.label.pos.copy(pos).addScaledVector(camUp, z.h);
          r.wPx = z.w / px; r.hPx = z.h / px;
        }
      }
      // 産地から、ずらしたフィギュアの足もとへ細い線
      if (moved && p.vis && nl < 256) {
        const a = g[0].base, bottom = tmp.copy(a).addScaledVector(camRight, dx).addScaledVector(camUp, dy + 0.12 * (p.items[0]?.h ?? 0));
        lp.setXYZ(nl * 2, a.x, a.y, a.z);
        lp.setXYZ(nl * 2 + 1, bottom.x, bottom.y, bottom.z);
        nl++;
      }
    }
    lp.needsUpdate = true;
    leaders.geometry.setDrawRange(0, nl * 2);
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
    // 描画が重い端末では、1秒あたりの描画回数を自動で減らす（古いタブレットでも操作が止まらないように）
    if (this.minGap && now - this.lastT < this.minGap && !this.tween) return;
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
    this.camera.updateMatrixWorld();
    this.updateFigures(now);
    if (this.arcs.length) this.updateArcs(now);
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    this.adapt(performance.now() - t0, dt);
    this.placeLabels();
  };

  private slow = 0;
  private minGap = 0;
  private avgMs = 16;
  private adapt(ms: number, dt: number) {
    this.avgMs = this.avgMs * 0.9 + ms * 0.1;
    if (this.frames < 30) return;
    this.slow = dt > 0.045 || ms > 30 ? this.slow + 1 : Math.max(0, this.slow - 0.5);
    const pr = this.renderer.getPixelRatio();
    if (this.slow > 40 && pr > 1) { this.renderer.setPixelRatio(Math.max(1, pr - 0.5)); this.resize(); this.slow = 0; return; }
    // 解像度を下げてもまだ重いときは、30回/秒 → 20回/秒 に落とす。軽くなったら戻す
    this.minGap = this.avgMs > 40 ? 50 : this.avgMs > 22 ? 33 : 0;
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
  private get pinOf() { const m = new Map<HTMLElement, PinRec>(); for (const r of this.pins.values()) m.set(r.el, r); return m; }
  private placeLabels() {
    const pinOf = this.pinOf;
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
      l.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      if (l.kind === 'pin') {
        const r = pinOf.get(l.el);
        if (r) { l.el.style.width = `${Math.max(36, r.wPx).toFixed(0)}px`; l.el.style.height = `${Math.max(30, r.hPx).toFixed(0)}px`; }
        l.el.style.zIndex = String(Math.round(y));
        // 名札はフィギュアと同じく、地球の向こう側へ回りこむまで出しておく
        const pinOff = !r || r.fade < 0.05 || x < -80 || x > w + 80 || y < -80 || y > h + 80;
        l.el.style.visibility = pinOff ? 'hidden' : '';
        l.el.style.opacity = r && r.fade < 1 ? ((r.dim ? 0.2 : 1) * r.fade).toFixed(2) : '';
        if (pinOff) continue;
        // 魚の上に重なる海や海流の名前は隠す
        if (collide && !l.el.classList.contains('dim')) placed.push(l.el.getBoundingClientRect());
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
      figs: [...this.pins.values()].filter((r) => ((r.tex.image as { width?: number } | undefined)?.width ?? 0) > 0).length,
      figW: Object.fromEntries([...this.pins.values()].map((r) => [r.pin.key, Math.round(r.wPx)])),
      figVis: [...this.pins.values()].filter((r) => r.bill.visible && r.fade > 0.05).length,
      glows: Object.fromEntries([...this.pins.values()].filter((r) => r.glow).map((r) => [r.pin.key, r.neon])),
      tags: [...this.pins.values()].filter((r) => !r.el.classList.contains('mini')).length,
    };
  }
  arrowSample(): string {
    return Array.from(this.warmMesh.instanceMatrix.array.slice(12, 15)).join(',');
  }
}

function idle() { return new Promise((r) => setTimeout(r, 0)); }
function esc(s: string) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
