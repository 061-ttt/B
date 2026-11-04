import { useEffect, useRef, useState } from 'preact/hooks';
import { computed, effect } from '@preact/signals';
import type { Globe, GlobeData } from '../map/globe';
import { aggregate, matches, stats, type FilterId, type Pin } from '../core/model';
import { drawerWidth, enhanced, entries, filter, focusFish, lastAdded, layers, ready, sheet, tab, view, wide } from '../state';
import { Balance, FocusCard } from './Fx';
import { FISH_BY_ID } from '../data/fish';
import { JAPAN_POINT, PLACE_BY_ID } from '../data/places';
import { G } from './Glyph';
import { DEPTH_LEGEND } from '../map/depth';

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
    const un = [entries, filter, focusFish, view].map((s) => s.subscribe(() => scheduleRedraw()));
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
  // 狭い画面では、図鑑やシートを開いている間は地球儀を止める（CPUを使わない）。
  // 広い画面では地球儀を出したまま、右側の図鑑・シートの分だけ地球儀の中心を左へずらす
  useEffect(() => {
    const apply = () => {
      const g = globe;
      if (!g) return;
      const t = tab.peek(), w = wide.peek();
      g.setActive(t === 'map' || w);
      g.setInset(w && t !== 'map' ? drawerWidth() : 0);
    };
    const un = [tab.subscribe(apply), wide.subscribe(apply), ready.subscribe(apply)];
    addEventListener('resize', apply);
    return () => { un.forEach((u) => u()); removeEventListener('resize', apply); };
  }, []);

  // 改良版：図鑑で選んだ魚・暖流／寒流の絞り込みに合わせて、関係する海流だけを光らせる
  useEffect(() => effect(() => {
    const on = enhanced.value, ff = focusFish.value, f = filter.value;
    if (!ready.value || !globe) return;
    if (!on) { globe.setEmphasis(null); return; }
    const fish = ff ? FISH_BY_ID.get(ff) : null;
    if (fish) globe.setEmphasis(fish.current === 'warm' || fish.current === 'cold' ? fish.current : fish.current === 'inland' ? 'none' : 'both');
    else globe.setEmphasis(f === 'warm' || f === 'cold' ? f : null);
  }), []);

  // 改良版：産地から日本へ光の弧を描く（自分の入力も、クラスのほかの人の入力も）
  useEffect(() => {
    const known = new Set(entries.peek().map((e) => e.id));
    return entries.subscribe((list) => {
      const fresh = list.filter((e) => !known.has(e.id));
      for (const e of list) known.add(e.id);
      // クラスに入った直後などのまとめての読みこみでは描かない
      if (!fresh.length || fresh.length > 4 || !enhanced.peek() || !globe || !ready.peek()) return;
      fresh.forEach((e, i) => {
        const p = PLACE_BY_ID.get(e.placeId);
        if (!p || p.id === 'japan') return;
        setTimeout(() => globe?.arc(p.lon, p.lat, JAPAN_POINT.lon, JAPAN_POINT.lat, p.domestic ? 'domestic' : 'overseas'), 500 + i * 220);
      });
    });
  }, []);

  // 新しい入力 → その場所へ飛ぶ
  useEffect(() => lastAdded.subscribe((e) => {
    if (!e || !globe) return;
    const p = PLACE_BY_ID.get(e.placeId);
    if (!p) return;
    const g = globe;
    // 改良版：外国の産地は、産地と日本の真ん中から見て、光の弧が端から端まで見えるようにする
    if (enhanced.peek() && !p.domestic) {
      const m = midLonLat(p.lon, p.lat, JAPAN_POINT.lon, JAPAN_POINT.lat);
      setTimeout(() => g.flyTo(m.lon, m.lat, g.worldDistance()), 150);
      return;
    }
    setTimeout(() => g.flyTo(p.lon, p.lat, p.domestic ? g.japanDistance() : Math.max(g.worldDistance() * 0.8, 260)), 150);
  }), []);

  return (
    <div class={`map-wrap ${tab.value !== 'map' && !wide.value ? 'under' : ''}`} ref={host} data-testid="map">
      {nogl && <div class="nogl"><div><img src={nogl} alt="海の深さの図" /><p>この端末では地球儀を表示できません</p></div></div>}
    </div>
  );
}

/** 2点を結ぶ大円の真ん中（経度・緯度） */
function midLonLat(lon1: number, lat1: number, lon2: number, lat2: number) {
  const r = Math.PI / 180;
  const v = (lo: number, la: number) => [Math.cos(la * r) * Math.cos(lo * r), Math.cos(la * r) * Math.sin(lo * r), Math.sin(la * r)];
  const a = v(lon1, lat1), b = v(lon2, lat2);
  const x = a[0] + b[0], y = a[1] + b[1], z = a[2] + b[2];
  return { lon: Math.atan2(y, x) / r, lat: Math.atan2(z, Math.hypot(x, y)) / r };
}

// 描き直しは1フレームに1回まで
let redrawPending = false;
function scheduleRedraw() {
  if (redrawPending) return;
  redrawPending = true;
  requestAnimationFrame(() => { redrawPending = false; redraw(); });
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
      {layers.value.depth && (
        <button class="depth-scale glass" onClick={() => (sheet.value = 'legend')} aria-label="海の深さの色の見方（タップでくわしく）" data-testid="depth-scale">
          <span class="ds-t">海の深さ</span>
          <span class="ds-bar">{DEPTH_LEGEND.map((d) => <i key={d.label} style={{ background: d.color }} />)}</span>
          <span class="ds-l">{DEPTH_LEGEND.map((d) => <span key={d.label}>{d.label === '深い海' ? '深海' : d.label === '大陸斜面' ? '斜面' : d.label}</span>)}</span>
          <span class="ds-n"><span>200m</span><span>3000m</span><span>6000m</span></span>
        </button>
      )}
      {enhanced.value ? (ff ? <FocusCard /> : <Balance />) : (
      <div class="summary neon" aria-live="polite" data-testid="summary">
        <div class="sum-main"><span class="k">ぜんぶ</span><b data-testid="total">{s.total}</b></div>
        <div class="sum-split">
          <div><span class="k">国内</span><span class="n dom">{s.domestic}</span></div>
          <div><span class="k">外国</span><span class="n ovs">{s.overseas}</span></div>
          <div class="bar" aria-hidden="true"><i style={{ width: s.total ? `${(s.domestic / s.total) * 100}%` : '0%' }} /></div>
        </div>
      </div>
      )}
      <button class="fab" aria-label="魚と産地を入力" onClick={() => (sheet.value = 'add')} data-testid="fab"><G.plus /><span>入力</span></button>
    </>
  );
}
