// 改良版の演出（「新しい演出」がオンのときだけ使う）
// ・天秤カウンター：国内と外国、どちらが多いかを天秤の傾きで見せる（数を「重さ」で感じる）
// ・着地の1語：入力した魚の産地を大きく1語で出し、外国なら日本までの距離を数え上げる
// ・「これ」カード：図鑑で選んだ魚の海流だけを光らせ、なぜ？の問いをシートへ送れる
// ・さわれるキャラ：キャラの絵をタップすると、むにっとへこんで戻る
import { useEffect, useRef, useState } from 'preact/hooks';
import { computed, signal } from '@preact/signals';
import { stats } from '../core/model';
import { appendTo, enhanced, entries, focusFish, lastAdded, showToast, tab } from '../state';
import { FISH_BY_ID, CURRENT_LABEL } from '../data/fish';
import { JAPAN_POINT, PLACE_BY_ID } from '../data/places';
import hero from '../assets/art/hero.webp';
import { figure } from './photo';
import { iconSvg } from './icons';
import { G } from './Glyph';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 数字が目標まで数え上がる（動きを減らす設定ではすぐ目標に） */
export function useCountUp(target: number, ms = 650): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const a = from.current;
    if (a === target || reduced()) { from.current = target; setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(2, -10 * k);   // easeOutExpo
      const x = Math.round(a + (target - a) * (k >= 1 ? 1 : e));
      setV(x);
      from.current = x;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

const statsNow = computed(() => stats(entries.value));

// ── 天秤カウンター ──
export function Balance() {
  const s = statsNow.value;
  const total = useCountUp(s.total);
  const dom = useCountUp(s.domestic);
  const ovs = useCountUp(s.overseas);
  // 傾き：外国が多いほど右（外国）が下がる。最大14度
  const ratio = s.total ? (s.overseas - s.domestic) / s.total : 0;
  const deg = Math.max(-1, Math.min(1, ratio)) * 14;
  // 件数が変わったら、キャラがはずむ
  const [boing, setBoing] = useState(0);
  const prev = useRef(s.total);
  useEffect(() => { if (s.total !== prev.current) { prev.current = s.total; setBoing((b) => b + 1); } }, [s.total]);
  const heavy = s.total >= 4 && Math.abs(ratio) >= 0.5;
  const msg = !s.total ? 'どっちが多いかな？' : Math.abs(ratio) < 0.15 ? 'つりあってる' : ratio > 0 ? '外国が重い！' : '国内が重い！';
  return (
    <div class="balance neon" aria-live="polite" data-testid="summary" style={{ '--deg': `${deg}deg` }}>
      <div class="bal-head">
        <span class="k">ぜんぶ</span>
        <b class="bal-total" data-testid="total">{total}</b>
        <span class="bal-msg">{msg}</span>
      </div>
      <div class="bal-scale" aria-hidden="true">
        <div class="bal-beam">
          <span class={`bal-mascot ${heavy ? 'tilt' : ''}`} key={boing}><img src={hero} alt="" draggable={false} /></span>
        </div>
        <div class="bal-pan dom"><span class="pk">国内</span><span class="pn">{dom}</span></div>
        <div class="bal-pan ovs"><span class="pk">外国</span><span class="pn">{ovs}</span></div>
        <span class="bal-post" />
      </div>
      <span class="sr">国内{s.domestic}件、外国{s.overseas}件</span>
    </div>
  );
}

// ── 着地の1語 ──
const arrival = signal<{ id: string; name: string; sub: string; km: number | null; far: boolean } | null>(null);
let arrTimer = 0;

/** 2点の大圏距離（km） */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
/** 子どもが読みやすい丸めた距離（1000km 以上は100km単位、それより近ければ10km単位） */
export function roundKm(km: number): number { return km >= 1000 ? Math.round(km / 100) * 100 : Math.round(km / 10) * 10; }

lastAdded.subscribe((e) => {
  if (!e || !enhanced.peek()) return;
  const p = PLACE_BY_ID.get(e.placeId);
  if (!p) return;
  const fish = (e.fishId && FISH_BY_ID.get(e.fishId)?.name) || e.fishName;
  const far = !p.domestic;
  const km = far ? roundKm(distanceKm(p.lat, p.lon, JAPAN_POINT.lat, JAPAN_POINT.lon)) : null;
  clearTimeout(arrTimer);
  arrival.value = { id: e.id, name: p.name, sub: far ? `の「${fish}」が日本まで` : `の「${fish}」をのせた`, km, far };
  arrTimer = window.setTimeout(() => (arrival.value = null), far ? 3400 : 2200);
});

export function Arrival() {
  const a = arrival.value;
  if (!a || !enhanced.value) return null;
  return (
    <div class={`arrival ${a.far ? 'far' : 'near'}`} key={a.id} role="status" data-testid="arrival" onClick={() => (arrival.value = null)}>
      <span class="arr-name">{a.name}</span>
      <span class="arr-sub">{a.sub}</span>
      {a.km != null && <span class="arr-km">約<KmCount km={a.km} />km</span>}
    </div>
  );
}
function KmCount({ km }: { km: number }) {
  const v = useCountUp(km, 1400);
  return <b>{v.toLocaleString('ja-JP')}</b>;
}

// ── 「これ」カード（図鑑で選んだ魚） ──
export function FocusCard() {
  const id = focusFish.value;
  const f = id ? FISH_BY_ID.get(id) : null;
  if (!f || !enhanced.value) return null;
  const fig = figure(f.id, true);
  const cls = f.current === 'warm' ? 'warm' : f.current === 'cold' ? 'cold' : f.current === 'both' ? 'both' : 'inland';
  const lead = f.current === 'warm' ? '赤い暖流が光っています' : f.current === 'cold' ? '青い寒流が光っています' : f.current === 'both' ? '暖流と寒流のどちらにもいます' : '川や池の魚です';
  return (
    <div class={`focus-card glass ${cls}`} key={f.id} data-testid="focus-card">
      <span class="fc-fig">{fig ? <img src={fig} alt="" /> : <span dangerouslySetInnerHTML={{ __html: iconSvg(f.icon, f.color, 52) }} />}</span>
      <div class="fc-body">
        <div class="fc-h"><b>{f.name}</b><span class={`tag ${f.current === 'inland' ? 'cls' : f.current}`}>{CURRENT_LABEL[f.current]}</span></div>
        <p class="fc-lead">{lead}。輪のある所が主な産地。</p>
        <p class="fc-why"><b>なぜ？</b>{f.why}</p>
        <div class="fc-acts">
          <button class="btn" onClick={() => { appendTo('next', f.why); showToast('シートに入れました', { label: 'ひらく', run: () => (tab.value = 'sheet') }); }} data-testid="focus-to-sheet"><G.pen />シートに書く</button>
        </div>
      </div>
      <button class="fc-x" aria-label="もどる" onClick={() => (focusFish.value = null)}>×</button>
    </div>
  );
}

// ── さわれるキャラ（キャラの絵をタップすると、むにっ） ──
const SQUISH = '.ph-art, .intro-art img, .bal-mascot img, .fc-fig img, .throw-fig img';
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => {
    if (!enhanced.peek()) return;
    const el = (e.target as Element | null)?.closest?.(SQUISH) as HTMLElement | null;
    if (!el || reduced() || typeof el.animate !== 'function') return;
    // もとのふわふわの動き（transform）とけんかしないよう、scale だけを動かす
    el.animate(
      [{ scale: '1 1' }, { scale: '1.16 .8', offset: 0.18 }, { scale: '.9 1.12', offset: 0.42 }, { scale: '1.05 .96', offset: 0.68 }, { scale: '1 1' }],
      { duration: 620, easing: 'cubic-bezier(.3,.7,.4,1)' },
    );
    if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* */ }
  }, { passive: true });
}
