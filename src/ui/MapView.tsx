import { useEffect, useRef, useState } from 'preact/hooks';
import { computed } from '@preact/signals';
import type { MapScene } from '../map/scene';
import { aggregate, matches, stats, type FilterId, type Pin } from '../core/model';
import { entries, filter, focusFish, lastAdded, layers, ready, sheet, tab, view } from '../state';
import { FISH_BY_ID } from '../data/fish';
import { PLACE_BY_ID } from '../data/places';
import type { LandData } from '../geo/project';
import { G } from './Glyph';
import { buildBathymetry } from '../map/bathy';
import { makeProjector } from '../geo/project';

const land = {
  japan: () => import('../data/land-japan.json').then((m) => m.default as unknown as LandData),
  world: () => import('../data/land-world.json').then((m) => m.default as unknown as LandData),
};

export let scene: MapScene | null = null;
let pendingFly: { lon: number; lat: number } | null = null;
export const pinsNow = computed<Pin[]>(() => aggregate(entries.value, view.value));

export function MapView() {
  const host = useRef<HTMLDivElement>(null);
  const [nogl, setNogl] = useState<string | null>(null);

  useEffect(() => {
    if (!host.current) return;
    let alive = true;
    (async () => {
    const { MapScene } = await import('../map/scene');
    if (!alive || !host.current) return;
    if (!MapScene.supported()) {
      // WebGLが使えない端末：深さの図だけを平面で見せる
      land.japan().then((d) => {
        const b = buildBathymetry(d, makeProjector(d.proj), 'japan');
        setNogl(b.canvas.toDataURL());
        ready.value = true;
      });
      return;
    }
    const s = new MapScene(host.current, land);
    scene = s;
    s.onPinTap = (p) => { sheet.value = { pin: p.key }; };
    s.setLayers(layers.peek());
    s.setView(view.peek(), false).then(() => {
      redraw();
      requestAnimationFrame(() => requestAnimationFrame(() => { ready.value = true; }));
      // 世界地図は手が空いたときに作っておく
      const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1200));
      idle(() => land.world());
    });
    (window as unknown as Record<string, unknown>).__sm = { scene: s };
    })();
    return () => { alive = false; };
  }, []);

  // 地図の種類
  useEffect(() => view.subscribe(async (v) => {
    if (!scene || scene.view === v || !ready.peek()) return;
    await scene.setView(v);
    redraw();
    if (pendingFly) { const f = pendingFly; pendingFly = null; setTimeout(() => scene?.flyTo(f.lon, f.lat, 1), 950); }
  }), []);

  // データ・絞り込み → ピン
  useEffect(() => {
    const un = [entries, filter, focusFish].map((s) => s.subscribe(() => redraw()));
    return () => un.forEach((u) => u());
  }, []);

  useEffect(() => focusFish.subscribe((id) => {
    const f = id ? FISH_BY_ID.get(id) : null;
    scene?.setGhosts(f ? [...f.domestic, ...f.overseas] : []);
  }), []);

  useEffect(() => layers.subscribe((l) => scene?.setLayers(l)), []);

  // パネルを開いている間は描画を止める（電池の節約）
  useEffect(() => tab.subscribe((t) => scene?.setActive(t === 'map')), []);

  // 新しい入力 → その場所へ寄る
  useEffect(() => lastAdded.subscribe((e) => {
    if (!e || !scene) return;
    const p = PLACE_BY_ID.get(e.placeId);
    if (!p) return;
    const want = p.domestic ? view.peek() : 'world';
    if (!p.domestic && view.peek() === 'japan') { pendingFly = { lon: p.lon, lat: p.lat }; view.value = want; return; }
    if (tab.peek() === 'map') setTimeout(() => scene?.flyTo(p.domestic && view.peek() === 'world' ? 139.5 : p.lon, p.domestic && view.peek() === 'world' ? 36.5 : p.lat, 0.75), 120);
  }), []);

  return (
    <div class={`map-wrap ${tab.value !== 'map' ? 'under' : ''}`} ref={host} data-testid="map">
      {nogl && <div class="nogl"><div><img src={nogl} alt="海の深さの図" /><p>この端末では立体の地図を表示できません</p></div></div>}
    </div>
  );
}

function redraw() {
  if (!scene) return;
  const pins = aggregate(entries.peek(), view.peek());
  const f = filter.peek(), ff = focusFish.peek();
  let dim: Set<string> | null = null;
  if (f !== 'all' || ff) {
    dim = new Set(pins.filter((p) => p.entries.some((e) => matches(e, f, ff))).map((p) => p.key));
  }
  scene.setPins(pins, dim);
}

const FILTERS: { id: FilterId; label: string; sw?: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'domestic', label: '国内' },
  { id: 'overseas', label: '外国・遠くの海' },
  { id: 'wild', label: '天然' },
  { id: 'farmed', label: '養殖' },
  { id: 'warm', label: '暖流の魚', sw: 'var(--warm)' },
  { id: 'cold', label: '寒流の魚', sw: 'var(--cold)' },
];

const statsNow = computed(() => stats(entries.value));

export function MapOverlay() {
  const s = statsNow.value;
  const ff = focusFish.value ? FISH_BY_ID.get(focusFish.value) : null;
  const abroad = view.value === 'japan' ? s.overseas : 0;
  return (
    <>
      <div class="chips" role="toolbar" aria-label="絞り込み">
        {ff && (
          <button class="chip glass focus-chip" onClick={() => (focusFish.value = null)} aria-label={`${ff.name}の絞り込みを解除`}>
            {ff.name}<span aria-hidden="true">×</span>
          </button>
        )}
        {FILTERS.map((f) => (
          <button key={f.id} class="chip glass" aria-pressed={filter.value === f.id} onClick={() => (filter.value = f.id)} data-filter={f.id}>
            {f.sw && <i class="sw" style={{ background: f.sw }} />}{f.label}
          </button>
        ))}
      </div>
      <div class="summary glass" aria-live="polite" data-testid="summary">
        <div><span class="k">ぜんぶ</span><b data-testid="total">{s.total}</b></div>
        <div><span class="k">国内</span><span class="n">{s.domestic}</span></div>
        <div><span class="k">外国</span><span class="n">{s.overseas}</span></div>
      </div>
      {abroad > 0 && (
        <button class="abroad glass" onClick={() => (view.value = 'world')}>外国から {abroad}件 →</button>
      )}
      <button class="fab" aria-label="魚と産地を入力" onClick={() => (sheet.value = 'add')} data-testid="fab"><G.plus /></button>
    </>
  );
}
