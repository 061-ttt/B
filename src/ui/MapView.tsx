import { useEffect, useRef, useState } from 'preact/hooks';
import { computed } from '@preact/signals';
import type { Globe, GlobeData } from '../map/globe';
import { aggregate, matches, stats, type FilterId, type Pin } from '../core/model';
import { entries, filter, focusFish, lastAdded, layers, ready, sheet, tab, view } from '../state';
import { FISH_BY_ID } from '../data/fish';
import { PLACE_BY_ID } from '../data/places';
import { G } from './Glyph';

const loadData = async (): Promise<GlobeData> => {
  const [g, p] = await Promise.all([import('../data/land-globe.json'), import('../data/land-jpatch.json')]);
  return { globe: g.default as unknown as GlobeData['globe'], patch: p.default as unknown as GlobeData['patch'] };
};

export let globe: Globe | null = null;
export const pinsNow = computed<Pin[]>(() => aggregate(entries.value, view.value));

export function MapView() {
  const host = useRef<HTMLDivElement>(null);
  const [nogl, setNogl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ Globe }, data] = await Promise.all([import('../map/globe'), loadData()]);
      if (!alive || !host.current) return;
      if (!Globe.supported()) {
        // WebGLが使えない端末：深さの図を平面で見せる
        const { buildDepth } = await import('../map/depth');
        setNogl(buildDepth({ polys: data.globe.polys, bbox: [-180, -90, 180, 90], w: 1440, h: 720, shelfKm: 45, slopeKm: 140, wrap: true }).canvas.toDataURL());
        ready.value = true;
        return;
      }
      const g = new Globe(host.current);
      globe = g;
      g.onPinTap = (p) => { sheet.value = { pin: p.key }; };
      g.onModeChange = (m) => { view.value = m; };
      g.setLayers(layers.peek());
      (window as unknown as Record<string, unknown>).__sm = { scene: g };
      await g.build(data);
      redraw();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        ready.value = true;
        // 宇宙から日本へ寄っていく
        setTimeout(() => g.flyJapan(2600), 250);
      }));
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const un = [entries, filter, focusFish, view].map((s) => s.subscribe(() => redraw()));
    return () => un.forEach((u) => u());
  }, []);

  useEffect(() => focusFish.subscribe((id) => {
    const f = id ? FISH_BY_ID.get(id) : null;
    globe?.setGhosts(f ? [...f.domestic, ...f.overseas] : []);
    if (f && globe) {
      // 主な産地が外国にもあれば世界、国内だけなら日本へ
      if (f.overseas.length) globe.flyWorld(); else globe.flyJapan();
    }
  }), []);

  useEffect(() => layers.subscribe((l) => globe?.setLayers(l)), []);
  useEffect(() => tab.subscribe((t) => globe?.setActive(t === 'map')), []);

  // 新しい入力 → その場所へ飛ぶ
  useEffect(() => lastAdded.subscribe((e) => {
    if (!e || !globe) return;
    const p = PLACE_BY_ID.get(e.placeId);
    if (!p) return;
    const g = globe;
    setTimeout(() => g.flyTo(p.lon, p.lat, p.domestic ? g.japanDistance() : Math.max(g.worldDistance() * 0.8, 260)), 150);
  }), []);

  return (
    <div class={`map-wrap ${tab.value !== 'map' ? 'under' : ''}`} ref={host} data-testid="map">
      {nogl && <div class="nogl"><div><img src={nogl} alt="海の深さの図" /><p>この端末では地球儀を表示できません</p></div></div>}
    </div>
  );
}

function redraw() {
  if (!globe) return;
  const pins = aggregate(entries.peek(), view.peek());
  const f = filter.peek(), ff = focusFish.peek();
  const dim = f !== 'all' || ff ? new Set(pins.filter((p) => p.entries.some((e) => matches(e, f, ff))).map((p) => p.key)) : null;
  globe.setPins(pins, dim);
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
  return (
    <>
      <div class="chips" role="toolbar" aria-label="絞り込み">
        {ff && (
          <button class="chip focus-chip" onClick={() => (focusFish.value = null)} aria-label={`${ff.name}の絞り込みを解除`}>
            <G.target />{ff.name}<span aria-hidden="true">×</span>
          </button>
        )}
        {FILTERS.map((f) => (
          <button key={f.id} class="chip" aria-pressed={filter.value === f.id} onClick={() => (filter.value = f.id)} data-filter={f.id}>
            {f.sw && <i class="sw" style={{ background: f.sw }} />}{f.label}
          </button>
        ))}
      </div>
      <div class="summary neon" aria-live="polite" data-testid="summary">
        <div class="sum-main"><span class="k">ぜんぶ</span><b data-testid="total">{s.total}</b></div>
        <div class="sum-split">
          <div><span class="k">国内</span><span class="n dom">{s.domestic}</span></div>
          <div><span class="k">外国</span><span class="n ovs">{s.overseas}</span></div>
          <div class="bar" aria-hidden="true"><i style={{ width: s.total ? `${(s.domestic / s.total) * 100}%` : '0%' }} /></div>
        </div>
      </div>
      <button class="fab" aria-label="魚と産地を入力" onClick={() => (sheet.value = 'add')} data-testid="fab"><G.plus /><span>入力</span></button>
    </>
  );
}
