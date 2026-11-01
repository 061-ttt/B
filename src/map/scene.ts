import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CURRENTS, SEA_LABELS, TRENCHES, type OceanCurrent } from '../data/ocean';
import { FISH_BY_ID } from '../data/fish';
import { makeProjector, type LandData, type Projector } from '../geo/project';
import { buildBathymetry } from './bathy';
import { pinScale, type Pin, type ViewId } from '../core/model';
import { iconSvg } from '../ui/icons';
import { PLACE_BY_ID } from '../data/places';

const K = 0.1; // 投影単位 → 3D単位
const LAND_H = 1.1;
const WARM = new THREE.Color('#ff4a4a');
const COLD = new THREE.Color('#3d9bff');

interface Label { el: HTMLElement; pos: THREE.Vector3; prio: number; kind: 'sea' | 'current' | 'pin' | 'ghost'; visible?: boolean }

interface Flow {
  curve: THREE.CatmullRomCurve3;
  len: number;
  n: number;
  spacing: number;
  kind: OceanCurrent['kind'];
  warmIdx: number[];
  coldIdx: number[];
}

interface ViewBuild {
  id: ViewId;
  land: LandData;
  proj: Projector;
  group: THREE.Group;
  flows: Flow[];
  warmMesh: THREE.InstancedMesh;
  coldMesh: THREE.InstancedMesh;
  ribbons: THREE.Group;
  labels: Label[];
  size: { w: number; h: number };
  water: THREE.ShaderMaterial;
}

export interface Layers { currents: boolean; depth: boolean; labels: boolean }

export class MapScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: MapControls;
  private views = new Map<ViewId, ViewBuild>();
  private current: ViewBuild | null = null;
  private pinLayer: HTMLElement;
  private labelLayer: HTMLElement;
  private pins = new Map<string, { pin: Pin; el: HTMLElement; stem: THREE.Mesh; ring: THREE.Mesh; born: number; label: Label; h: number }>();
  private pinGroup = new THREE.Group();
  private ghosts: Label[] = [];
  private lastT = performance.now();
  private elapsed = 0;
  private raf = 0;
  private active = true;
  private layers: Layers = { currents: true, depth: true, labels: true };
  private lastCollide = 0;
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  frames = 0;
  onPinTap: (pin: Pin) => void = () => {};

  static supported(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
  }

  constructor(private host: HTMLElement, private landData: Record<ViewId, () => Promise<LandData>>) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.domElement.className = 'map-canvas';
    host.appendChild(this.renderer.domElement);

    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'label-layer';
    this.pinLayer = document.createElement('div');
    this.pinLayer.className = 'pin-layer';
    host.append(this.labelLayer, this.pinLayer);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 3000);
    this.scene.fog = new THREE.Fog(0x000000, 160, 420);
    this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x0a0f14, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-60, 120, -40);
    this.scene.add(sun);
    this.scene.add(this.pinGroup);

    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.screenSpacePanning = false;
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = 1.12;
    this.controls.minDistance = 18;
    this.controls.maxDistance = 360;
    this.controls.zoomToCursor = true;

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    document.addEventListener('visibilitychange', () => this.setActive(!document.hidden && this.active));
  }

  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setActive(on: boolean) {
    this.active = on;
    cancelAnimationFrame(this.raf);
    if (on) { this.lastT = performance.now(); this.loop(); }
  }

  get view(): ViewId | null { return this.current?.id ?? null; }

  private toWorld(x: number, y: number, v: ViewBuild, h = 0): THREE.Vector3 {
    return new THREE.Vector3((x - v.land.W / 2) * K, h, (y - v.land.H / 2) * K);
  }
  lonLatToWorld(lon: number, lat: number, h = 0, v = this.current!): THREE.Vector3 {
    const [x, y] = v.proj.point(lon, lat);
    return this.toWorld(x, y, v, h);
  }

  private async build(id: ViewId): Promise<ViewBuild> {
    const land = await this.landData[id]();
    const proj = makeProjector(land.proj);
    const group = new THREE.Group();
    group.name = id;
    const W = land.W * K, H = land.H * K;

    // 海：深さのグラデーション
    const bathy = buildBathymetry(land, proj, id);
    const tex = new THREE.CanvasTexture(bathy.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex }));
    ocean.name = 'ocean';
    group.add(ocean);
    // 地図の外側（縁が切れて見えないように）
    const beyond = new THREE.Mesh(new THREE.PlaneGeometry(W * 6, H * 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x061426 }));
    beyond.position.y = -0.05;
    group.add(beyond);
    // 深さを消したとき用の単色の海
    const flat = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b2a4a }));
    flat.name = 'ocean-flat';
    flat.visible = false;
    group.add(flat);

    // 水面のゆらぎ
    const water = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { t: { value: 0 }, scale: { value: id === 'japan' ? 0.9 : 0.5 } },
      vertexShader: 'varying vec2 vP; void main(){ vec4 w = modelMatrix*vec4(position,1.); vP = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `varying vec2 vP; uniform float t; uniform float scale;
        void main(){ vec2 p = vP*scale; float a = sin(p.x*1.3+t*.7+sin(p.y*.9+t*.4)*1.6); float b = sin(p.y*1.7-t*.5+sin(p.x*1.1-t*.3)*1.4);
        float c = smoothstep(.75,1.,a*b); gl_FragColor = vec4(.75,.92,1.,c*.06); }`,
    });
    const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), water);
    waterMesh.position.y = 0.05;
    waterMesh.renderOrder = 1;
    group.add(waterMesh);

    // 陸地：押し出し
    const jp: THREE.BufferGeometry[] = [], other: THREE.BufferGeometry[] = [];
    for (const poly of land.polys) {
      const toV = (r: number[]) => { const o: THREE.Vector2[] = []; for (let i = 0; i < r.length; i += 2) o.push(new THREE.Vector2((r[i] - land.W / 2) * K, -(r[i + 1] - land.H / 2) * K)); return o; };
      const outer = toV(poly[0]);
      const shape = new THREE.Shape(outer);
      for (const hole of poly.slice(1)) shape.holes.push(new THREE.Path(toV(hole)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: LAND_H, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);
      // 日本かどうか（重心の経緯度で判定）
      let sx = 0, sy = 0;
      const r0 = poly[0];
      for (let i = 0; i < r0.length; i += 2) { sx += r0[i]; sy += r0[i + 1]; }
      const [lon, lat] = proj.invert(sx / (r0.length / 2), sy / (r0.length / 2));
      const L = ((lon % 360) + 540) % 360 - 180;
      const isJapan = (L > 129 && L < 149.5 && lat > 24 && lat < 45.8) || (L > 122.9 && L <= 129 && lat > 23.8 && lat < 31);
      (isJapan ? jp : other).push(g);
    }
    // ExtrudeGeometry の groups（0=上面, 1=側面）ごとに切り出してから結合する
    const split = (g: THREE.BufferGeometry, gi: number) => {
      const grp = g.groups.filter((x) => x.materialIndex === gi);
      const out = new THREE.BufferGeometry();
      for (const name of ['position', 'normal'] as const) {
        const attr = g.getAttribute(name) as THREE.BufferAttribute;
        const parts: number[] = [];
        for (const r of grp) for (let i = r.start; i < r.start + r.count; i++) parts.push(attr.getX(i), attr.getY(i), attr.getZ(i));
        out.setAttribute(name, new THREE.Float32BufferAttribute(parts, 3));
      }
      return out;
    };
    const mk = (geoms: THREE.BufferGeometry[], top: string, side: string, name: string) => {
      if (!geoms.length) return;
      const caps = mergeGeometries(geoms.map((g) => split(g, 0)), false)!;
      const sides = mergeGeometries(geoms.map((g) => split(g, 1)), false)!;
      geoms.forEach((g) => g.dispose());
      const capMesh = new THREE.Mesh(caps, new THREE.MeshStandardMaterial({ color: top, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));
      const sideMesh = new THREE.Mesh(sides, new THREE.MeshStandardMaterial({ color: side, roughness: 1, metalness: 0 }));
      capMesh.name = name;
      sideMesh.name = `${name}-side`;
      group.add(capMesh, sideMesh);
    };
    mk(other, '#3c4843', '#1b2320', 'land');
    mk(jp, '#7a9c84', '#2e3d33', 'land-japan');

    // 海流
    const flows: Flow[] = [];
    const ribbons = new THREE.Group();
    const arrowScale = id === 'japan' ? 2.3 : 3.0;
    const spacing = id === 'japan' ? 3.3 : 4.6;
    const labels: Label[] = [];
    for (const c of CURRENTS) {
      if (!c.view.includes(id)) continue;
      for (const seg of proj.path(c.path)) {
        const pts = seg.map(([x, y]) => this.toWorld(x, y, { land } as ViewBuild, 0.32));
        if (pts.length < 2) continue;
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        const len = curve.getLength();
        const n = Math.max(2, Math.floor(len / spacing));
        const f: Flow = { curve, len, n, spacing: len / n, kind: c.kind, warmIdx: [], coldIdx: [] };
        flows.push(f);
        // 流れの帯
        const addRibbon = (color: THREE.Color, offset: number) => {
          const p2 = pts.map((p, i) => {
            if (!offset) return p;
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
            const d = new THREE.Vector3().subVectors(b, a).normalize();
            return p.clone().add(new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(offset));
          });
          const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p2, false, 'centripetal'), Math.max(8, n * 3), id === 'japan' ? 0.95 : 1.3, 6, false);
          tube.scale(1, 0.08, 1);
          const mesh = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false }));
          mesh.position.y = 0.3 * (1 - 0.08);
          ribbons.add(mesh);
        };
        if (c.kind === 'meet') { addRibbon(WARM, 0.9); addRibbon(COLD, -0.9); }
        else addRibbon(c.kind === 'warm' ? WARM : COLD, 0);
      }
      if (c.name && (id === 'japan' || !/赤道/.test(c.name) || c.id === 'w-nec-p')) {
        const at = c.label ?? c.path[Math.floor(c.path.length / 2)];
        const el = document.createElement('div');
        el.className = `current-label ${c.kind}`;
        el.innerHTML = c.kind === 'meet'
          ? `<span class="dot w"></span><span class="dot c"></span><ruby>潮目<rt>しおめ</rt></ruby>`
          : `<span class="dot"></span>${c.name}`;
        const [x, y] = proj.point(at[0], at[1]);
        labels.push({ el, pos: this.toWorld(x, y, { land } as ViewBuild, 0.5), prio: c.kind === 'meet' ? 9 : id === 'japan' ? 7 : 4, kind: 'current' });
      }
    }
    // 矢印のインスタンス
    const total = flows.reduce((s, f) => s + f.n, 0);
    const shape = new THREE.Shape([new THREE.Vector2(0.55, 0), new THREE.Vector2(-0.4, 0.34), new THREE.Vector2(-0.16, 0), new THREE.Vector2(-0.4, -0.34)]);
    const arrowGeo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    arrowGeo.scale(arrowScale, 1, arrowScale);
    const warmMesh = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicMaterial({ color: WARM, transparent: true, opacity: 0.95, depthWrite: false }), Math.max(1, total));
    const coldMesh = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicMaterial({ color: COLD, transparent: true, opacity: 0.95, depthWrite: false }), Math.max(1, total));
    warmMesh.renderOrder = coldMesh.renderOrder = 3;
    warmMesh.frustumCulled = coldMesh.frustumCulled = false;
    warmMesh.name = 'arrows-warm';
    coldMesh.name = 'arrows-cold';
    let wi = 0, ci = 0;
    for (const f of flows) for (let i = 0; i < f.n; i++) {
      const warm = f.kind === 'warm' || (f.kind === 'meet' && i % 2 === 0);
      if (warm) f.warmIdx.push(wi++); else f.coldIdx.push(ci++);
    }
    warmMesh.count = wi;
    coldMesh.count = ci;
    group.add(ribbons, warmMesh, coldMesh);

    // 海溝（小さな文字）
    for (const t of TRENCHES) {
      if (!t.view.includes(id)) continue;
      if (id === 'world' && !/日本|マリアナ|ペルー/.test(t.name)) continue;
      const at = t.path[Math.floor(t.path.length / 2)];
      const el = document.createElement('div');
      el.className = 'trench-label';
      el.textContent = t.name;
      labels.push({ el, pos: this.lonLatToWorld(at[0], at[1], 0.2, { land, proj } as ViewBuild), prio: 2, kind: 'sea' });
    }
    for (const s of SEA_LABELS) {
      if (s.view !== id) continue;
      const el = document.createElement('div');
      el.className = 'sea-label';
      el.style.fontSize = `${(s.size ?? 1) * 13}px`;
      el.textContent = s.name;
      labels.push({ el, pos: this.lonLatToWorld(s.at[0], s.at[1], s.name === '日本' ? LAND_H + 0.2 : 0.2, { land, proj } as ViewBuild), prio: 6, kind: 'sea' });
    }

    group.visible = false;
    this.scene.add(group);
    const v: ViewBuild = { id, land, proj, group, flows, warmMesh, coldMesh, ribbons, labels, size: { w: W, h: H }, water };
    this.views.set(id, v);
    return v;
  }

  /** 表示する地図を切り替える */
  async setView(id: ViewId, animate = true) {
    const v = this.views.get(id) ?? (await this.build(id));
    const prev = this.current;
    if (prev === v) return;
    const canvas = this.renderer.domElement;
    if (prev && animate && !this.reduced) {
      canvas.classList.add('fade');
      await new Promise((r) => setTimeout(r, 220));
    }
    if (prev) { prev.group.visible = false; prev.labels.forEach((l) => l.el.remove()); }
    this.current = v;
    v.group.visible = true;
    for (const l of v.labels) this.labelLayer.appendChild(l.el);
    this.applyLayers();
    this.clearPins();
    this.home(false);
    if (prev && animate && !this.reduced) {
      // 少し引いた位置から寄る
      const target = this.camera.position.clone();
      this.camera.position.multiplyScalar(1.35);
      this.tweenCamera(target, this.controls.target.clone(), 900);
    }
    canvas.classList.remove('fade');
    if (!this.raf) this.loop();
  }

  /** 地図全体が収まる視点 */
  home(animate = true) {
    const v = this.current;
    if (!v) return;
    const aspect = this.camera.aspect;
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const portrait = aspect < 1;
    const visW = v.id === 'japan' ? v.size.w * (portrait ? 0.74 : 0.85) : v.size.w * (portrait ? 0.52 : 0.95);
    const visH = v.size.h * (v.id === 'japan' ? (portrait ? 0.6 : 0.85) : 0.9);
    const tilt = v.id === 'japan' ? 0.42 : 0.36;
    const dW = visW / 2 / Math.tan(hfov / 2);
    const dH = (visH / 2) / Math.tan(vfov / 2) * 0.9;
    const dist = Math.min(this.controls.maxDistance, Math.max(dW, dH));
    // 世界地図はスマホ縦向きだと日本〜太平洋を中心に
    const target = v.id === 'japan' ? this.lonLatToWorld(137.6, 37.4, 0, v) : portrait ? this.lonLatToWorld(160, 20, 0, v) : new THREE.Vector3(0, 0, 0);
    const pos = target.clone().add(new THREE.Vector3(0, Math.cos(tilt) * dist, Math.sin(tilt) * dist));
    if (animate && !this.reduced) this.tweenCamera(pos, target, 800);
    else { this.camera.position.copy(pos); this.controls.target.copy(target); this.controls.update(); }
  }

  flyTo(lon: number, lat: number, zoom = 0.55) {
    if (!this.current) return;
    const target = this.lonLatToWorld(lon, lat, 0);
    const off = this.camera.position.clone().sub(this.controls.target);
    const len = Math.max(this.controls.minDistance * 1.6, off.length() * zoom);
    const pos = target.clone().add(off.normalize().multiplyScalar(len));
    this.tweenCamera(pos, target, 900);
  }

  private tween: { from: THREE.Vector3; to: THREE.Vector3; tf: THREE.Vector3; tt: THREE.Vector3; t0: number; dur: number } | null = null;
  private tweenCamera(pos: THREE.Vector3, target: THREE.Vector3, dur: number) {
    if (this.reduced) { this.camera.position.copy(pos); this.controls.target.copy(target); this.controls.update(); return; }
    this.tween = { from: this.camera.position.clone(), to: pos, tf: this.controls.target.clone(), tt: target, t0: performance.now(), dur };
  }

  setLayers(l: Partial<Layers>) {
    this.layers = { ...this.layers, ...l };
    this.applyLayers();
  }
  private applyLayers() {
    const v = this.current;
    if (!v) return;
    v.warmMesh.visible = v.coldMesh.visible = v.ribbons.visible = this.layers.currents;
    v.group.getObjectByName('ocean')!.visible = this.layers.depth;
    v.group.getObjectByName('ocean-flat')!.visible = !this.layers.depth;
    for (const l of v.labels) {
      const show = this.layers.labels && (l.kind !== 'current' || this.layers.currents);
      l.el.style.display = show ? '' : 'none';
    }
  }

  private clearPins() {
    for (const p of this.pins.values()) { p.el.remove(); this.pinGroup.remove(p.stem, p.ring); }
    this.pins.clear();
  }

  /** ピンを更新。新しいピンは浮き上がり、件数が増えたピンは大きくなる */
  setPins(list: Pin[], dimKeys: Set<string> | null = null) {
    const v = this.current;
    if (!v) return;
    const seen = new Set<string>();
    const now = performance.now();
    for (const pin of list) {
      seen.add(pin.key);
      const scale = pinScale(pin.count);
      const h = (v.id === 'japan' ? 2.2 : 2.6) + 1.3 * Math.sqrt(pin.count);
      let rec = this.pins.get(pin.key);
      const top = pin.fish[0];
      const f = top.id ? FISH_BY_ID.get(top.id) : undefined;
      const color = f?.color ?? '#9fd3ff';
      const html = `<div class="pin-bubble" style="--c:${color}">${iconSvg(f?.icon ?? 'fish', color, 30)}<span class="pin-name">${escapeHtml(top.name)}${pin.fish.length > 1 ? `<small>ほか${pin.fish.length - 1}</small>` : ''}</span><span class="pin-count">${pin.count}</span></div><div class="pin-place">${escapeHtml(pin.name)}</div>`;
      if (!rec) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'pin rise';
        el.dataset.key = pin.key;
        el.addEventListener('click', (e) => { e.stopPropagation(); const r = this.pins.get(pin.key); if (r) this.onPinTap(r.pin); });
        this.pinLayer.appendChild(el);
        const onSea = PLACE_BY_ID.get(pin.key)?.kind === 'sea';
        const base = this.lonLatToWorld(pin.lon, pin.lat, onSea ? 0.35 : LAND_H + 0.02);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
        stem.position.copy(base);
        stem.scale.y = 0.001;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.55, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
        ring.position.copy(base).add(new THREE.Vector3(0, 0.03, 0));
        this.pinGroup.add(stem, ring);
        const label: Label = { el, pos: base.clone(), prio: 100 + pin.count, kind: 'pin' };
        rec = { pin, el, stem, ring, born: now, label, h };
        this.pins.set(pin.key, rec);
        setTimeout(() => el.classList.remove('rise'), 900);
      } else if (rec.pin.count !== pin.count) {
        rec.el.classList.remove('bump');
        void rec.el.offsetWidth;
        rec.el.classList.add('bump');
      }
      rec.el.innerHTML = html;
      rec.el.style.setProperty('--s', String(scale));
      rec.el.setAttribute('aria-label', `${pin.name}：${pin.fish.map((x) => `${x.name}${x.count}件`).join('、')}`);
      (rec.stem.material as THREE.MeshBasicMaterial).color.set(color);
      (rec.ring.material as THREE.MeshBasicMaterial).color.set(color);
      rec.pin = pin;
      rec.h = h;
      rec.label.prio = 100 + pin.count;
      rec.el.classList.toggle('dim', !!dimKeys && !dimKeys.has(pin.key));
    }
    for (const [k, rec] of this.pins) {
      if (seen.has(k)) continue;
      rec.el.remove();
      this.pinGroup.remove(rec.stem, rec.ring);
      this.pins.delete(k);
    }
  }

  /** 図鑑の「地図で見る」：主な産地に輪を出す */
  setGhosts(placeIds: string[]) {
    for (const g of this.ghosts) g.el.remove();
    this.ghosts = [];
    const v = this.current;
    if (!v) return;
    for (const id of placeIds) {
      const p = PLACE_BY_ID.get(id);
      if (!p) continue;
      if (v.id === 'japan' && !p.domestic) continue;
      const lat = v.id === 'world' && p.domestic ? 36.5 : p.lat;
      const lon = v.id === 'world' && p.domestic ? 139.5 : p.lon;
      if (this.ghosts.some((g) => g.el.dataset.k === `${lat},${lon}`)) continue;
      const el = document.createElement('div');
      el.className = 'ghost';
      el.dataset.k = `${lat},${lon}`;
      el.innerHTML = `<i></i><span>${escapeHtml(v.id === 'world' && p.domestic ? '日本' : p.name)}</span>`;
      this.labelLayer.appendChild(el);
      this.ghosts.push({ el, pos: this.lonLatToWorld(lon, lat, LAND_H), prio: 50, kind: 'ghost' });
    }
  }

  private loop = () => {
    if (!this.active) { this.raf = 0; return; }
    this.raf = requestAnimationFrame(this.loop);
    const nowT = performance.now();
    const dt = Math.min(0.05, (nowT - this.lastT) / 1000);
    this.lastT = nowT;
    this.elapsed += dt;
    const t = this.elapsed;
    const v = this.current;
    if (!v) return;

    if (this.tween) {
      const k = Math.min(1, (performance.now() - this.tween.t0) / this.tween.dur);
      const e = 1 - Math.pow(1 - k, 3);
      this.camera.position.lerpVectors(this.tween.from, this.tween.to, e);
      this.controls.target.lerpVectors(this.tween.tf, this.tween.tt, e);
      if (k >= 1) this.tween = null;
    }
    this.controls.update();
    this.clampTarget(v);
    const cd = this.camera.position.distanceTo(this.controls.target);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = cd * 1.25; fog.far = cd * 3.4;

    v.water.uniforms.t.value = t;
    if (this.layers.currents) this.updateArrows(v, this.reduced ? 0 : t);

    // ピン：茎が伸び、輪が脈打つ
    const now = performance.now();
    for (const r of this.pins.values()) {
      const age = Math.min(1, (now - r.born) / 700);
      const e = this.reduced ? 1 : 1 - Math.pow(1 - age, 3);
      r.stem.scale.y += (r.h * e - r.stem.scale.y) * 0.25;
      const pulse = this.reduced ? 0 : (t * 0.8 + r.pin.lat * 0.1) % 1;
      const s = pinScale(r.pin.count) * (1 + pulse * 1.2);
      r.ring.scale.set(s, 1, s);
      (r.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - pulse);
      r.label.pos.copy(r.stem.position).add(new THREE.Vector3(0, r.stem.scale.y, 0));
    }
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    this.adapt(performance.now() - t0, dt);
    this.placeLabels(v);
  };

  /** 重い端末では自動で解像度を下げる（学校の古いタブレット向け） */
  private slow = 0;
  private adapt(renderMs: number, dt: number) {
    if (this.frames < 30) return;
    const heavy = dt > 0.045 || renderMs > 30;
    this.slow = heavy ? this.slow + 1 : Math.max(0, this.slow - 0.5);
    const pr = this.renderer.getPixelRatio();
    if (this.slow > 40 && pr > 1) {
      this.renderer.setPixelRatio(Math.max(1, pr - 0.5));
      this.resize();
      this.slow = 0;
    }
  }

  private clampTarget(v: ViewBuild) {
    const t = this.controls.target;
    const hw = v.size.w / 2, hh = v.size.h / 2;
    const cx = Math.max(-hw, Math.min(hw, t.x)), cz = Math.max(-hh, Math.min(hh, t.z));
    if (cx !== t.x || cz !== t.z) {
      const dx = cx - t.x, dz = cz - t.z;
      t.x = cx; t.z = cz;
      this.camera.position.x += dx; this.camera.position.z += dz;
    }
  }

  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private tmpP = new THREE.Vector3();
  private tmpT = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private updateArrows(v: ViewBuild, t: number) {
    const speed = v.id === 'japan' ? 3.2 : 5.2;
    for (const f of v.flows) {
      let wk = 0, ck = 0;
      for (let i = 0; i < f.n; i++) {
        const d = (i * f.spacing + t * speed) % f.len;
        const u = d / f.len;
        f.curve.getPointAt(u, this.tmpP);
        f.curve.getTangentAt(u, this.tmpT);
        const ang = Math.atan2(-this.tmpT.z, this.tmpT.x);
        this.q.setFromAxisAngle(this.up, ang);
        // 端では小さく（出てきて消える）
        const edge = Math.min(1, u * 8, (1 - u) * 8);
        this.tmpS.set(edge, 1, edge);
        this.m4.compose(this.tmpP, this.q, this.tmpS);
        const warm = f.kind === 'warm' || (f.kind === 'meet' && i % 2 === 0);
        if (warm) v.warmMesh.setMatrixAt(f.warmIdx[wk++], this.m4);
        else v.coldMesh.setMatrixAt(f.coldIdx[ck++], this.m4);
      }
    }
    v.warmMesh.instanceMatrix.needsUpdate = true;
    v.coldMesh.instanceMatrix.needsUpdate = true;
  }

  private proj = new THREE.Vector3();
  private placeLabels(v: ViewBuild) {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const all = [...v.labels, ...this.ghosts, ...[...this.pins.values()].map((p) => p.label)];
    const collide = performance.now() - this.lastCollide > 160;
    const placed: DOMRect[] = [];
    if (collide) {
      this.lastCollide = performance.now();
      all.sort((a, b) => b.prio - a.prio);
    }
    const camDist = this.camera.position.distanceTo(this.controls.target);
    for (const l of all) {
      this.proj.copy(l.pos).project(this.camera);
      const behind = this.proj.z > 1;
      const x = (this.proj.x * 0.5 + 0.5) * w, y = (-this.proj.y * 0.5 + 0.5) * h;
      const off = behind || x < -80 || x > w + 80 || y < -80 || y > h + 80;
      l.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      if (l.kind === 'pin') {
        l.el.style.zIndex = String(Math.round(y));
        l.el.style.visibility = off ? 'hidden' : '';
        continue;
      }
      if (!collide) continue;
      let hide = off;
      if (!hide && l.kind !== 'ghost') {
        const r = l.el.getBoundingClientRect();
        if (r.width) {
          for (const p of placed) if (!(r.right < p.left || r.left > p.right || r.bottom < p.top || r.top > p.bottom)) { hide = true; break; }
          if (!hide) placed.push(r);
        }
        if (l.kind === 'sea' && l.el.classList.contains('trench-label') && camDist > (v.id === 'japan' ? 150 : 260)) hide = true;
      }
      l.el.classList.toggle('hid', hide);
    }
  }

  /** テスト用：画面の一部の画素を読む */
  sample(): number[] {
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(4 * 64 * 64);
    gl.readPixels(Math.floor(w / 2 - 32), Math.floor(h / 2 - 32), 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return Array.from(px);
  }
  info() {
    const v = this.current;
    return {
      view: v?.id, frames: this.frames, arrows: (v?.warmMesh.count ?? 0) + (v?.coldMesh.count ?? 0),
      warm: v?.warmMesh.count ?? 0, cold: v?.coldMesh.count ?? 0, pins: this.pins.size,
      meet: v?.flows.filter((f) => f.kind === 'meet').length ?? 0,
    };
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
