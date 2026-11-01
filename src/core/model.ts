import { FISH_BY_ID, type Fish } from '../data/fish';
import { PLACE_BY_ID, JAPAN_POINT, type Place } from '../data/places';
import type { Method } from '../data/parse';

export interface Entry {
  id: string;
  fishId: string | null;
  fishName: string;
  placeId: string;
  method: Method;
  group: number;
  at: number;
  device: string;
}

export type ViewId = 'japan' | 'world';
export type FilterId = 'all' | 'domestic' | 'overseas' | 'wild' | 'farmed' | 'warm' | 'cold';

export interface PinFish { id: string | null; name: string; count: number }
export interface Pin {
  key: string;
  name: string;
  lat: number;
  lon: number;
  count: number;
  fish: PinFish[];
  domestic: boolean;
  entries: Entry[];
}

export function fishOf(e: Entry): Fish | undefined {
  return e.fishId ? FISH_BY_ID.get(e.fishId) : undefined;
}
export function placeOf(e: Entry): Place | undefined {
  return PLACE_BY_ID.get(e.placeId);
}

export function matches(e: Entry, f: FilterId, focusFish: string | null): boolean {
  if (focusFish && e.fishId !== focusFish) return false;
  const p = placeOf(e);
  if (!p) return false;
  switch (f) {
    case 'all': return true;
    case 'domestic': return p.domestic;
    case 'overseas': return !p.domestic;
    case 'wild': return e.method === 'wild';
    case 'farmed': return e.method === 'farmed';
    case 'warm': return fishOf(e)?.current === 'warm';
    case 'cold': return fishOf(e)?.current === 'cold';
  }
}

/** 地図のピンをつくる。日本地図は国内だけ、世界地図は国内を「日本」1本にまとめる */
export function aggregate(entries: Entry[], view: ViewId): Pin[] {
  const map = new Map<string, Pin>();
  for (const e of entries) {
    const p = placeOf(e);
    if (!p) continue;
    if (view === 'japan' && !p.domestic) continue;
    const collapse = view === 'world' && p.domestic;
    const key = collapse ? 'japan' : p.id;
    let pin = map.get(key);
    if (!pin) {
      pin = collapse
        ? { key, name: '日本', lat: JAPAN_POINT.lat, lon: JAPAN_POINT.lon, count: 0, fish: [], domestic: true, entries: [] }
        : { key, name: p.name, lat: p.lat, lon: p.lon, count: 0, fish: [], domestic: p.domestic, entries: [] };
      map.set(key, pin);
    }
    pin.count++;
    pin.entries.push(e);
    const fk = e.fishId ?? e.fishName;
    const pf = pin.fish.find((x) => (x.id ?? x.name) === fk);
    if (pf) pf.count++;
    else pin.fish.push({ id: e.fishId, name: fishOf(e)?.name ?? e.fishName, count: 1 });
  }
  const pins = [...map.values()];
  for (const p of pins) p.fish.sort((a, b) => b.count - a.count);
  return pins.sort((a, b) => b.count - a.count);
}

/** ピンの大きさ：件数の平方根で大きくする（面積が件数に比例） */
export function pinScale(count: number): number {
  return Math.min(2.1, 0.8 + 0.22 * Math.sqrt(Math.max(1, count)));
}

export interface Stats {
  total: number;
  domestic: number;
  overseas: number;
  wild: number;
  farmed: number;
  places: { name: string; count: number; domestic: boolean }[];
  fish: { name: string; count: number }[];
  coldNorth: number;
  coldTotal: number;
  inland: number;
}

export function stats(entries: Entry[]): Stats {
  const s: Stats = { total: 0, domestic: 0, overseas: 0, wild: 0, farmed: 0, places: [], fish: [], coldNorth: 0, coldTotal: 0, inland: 0 };
  const pc = new Map<string, { name: string; count: number; domestic: boolean }>();
  const fc = new Map<string, number>();
  const INLAND = new Set(['tochigi', 'gunma', 'saitama', 'yamanashi', 'nagano', 'gifu', 'shiga', 'nara']);
  for (const e of entries) {
    const p = placeOf(e);
    if (!p) continue;
    s.total++;
    if (p.domestic) s.domestic++; else s.overseas++;
    if (e.method === 'wild') s.wild++;
    if (e.method === 'farmed') s.farmed++;
    if (INLAND.has(p.id)) s.inland++;
    const f = fishOf(e);
    if (f?.current === 'cold') { s.coldTotal++; if (p.lat >= 38) s.coldNorth++; }
    const cur = pc.get(p.id) ?? { name: p.name, count: 0, domestic: p.domestic };
    cur.count++;
    pc.set(p.id, cur);
    const fn = f?.name ?? e.fishName;
    fc.set(fn, (fc.get(fn) ?? 0) + 1);
  }
  s.places = [...pc.values()].sort((a, b) => b.count - a.count);
  s.fish = [...fc.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return s;
}

/** ワークシート①に入れる「地図から読み取れる事実」。数えた結果だけを言葉にする */
export function factLines(s: Stats): string[] {
  if (!s.total) return [];
  const out: string[] = [];
  out.push(`ぜんぶで${s.total}件。国内が${s.domestic}件、外国・遠くの海が${s.overseas}件。`);
  const dom = s.places.filter((p) => p.domestic).slice(0, 3).map((p) => `${p.name}（${p.count}）`);
  if (dom.length) out.push(`国内で多いのは ${dom.join('、')}。`);
  const ov = s.places.filter((p) => !p.domestic).slice(0, 3).map((p) => `${p.name}（${p.count}）`);
  if (ov.length) out.push(`外国で多いのは ${ov.join('、')}。`);
  if (s.domestic && s.inland === 0) out.push('国内の産地は、どれも海に面した場所だった。');
  if (s.coldTotal >= 2) out.push(`寒流の魚${s.coldTotal}件のうち、${s.coldNorth}件が東北・北海道より北の産地だった。`);
  if (s.wild + s.farmed > 0) out.push(`天然が${s.wild}件、養殖が${s.farmed}件。`);
  return out;
}

/** AIが使えないときの「問いのたね」。答えは書かず、調べる方向だけを示す */
export function localQuestions(s: Stats): string[] {
  const q: string[] = [];
  const topOv = s.places.find((p) => !p.domestic);
  const topDom = s.places.find((p) => p.domestic);
  const topFish = s.fish[0];
  if (topOv) q.push(`なぜ遠い${topOv.name}から、日本まで魚が届くのだろう？`);
  if (topDom) q.push(`${topDom.name}で水産業がさかんなのは、海流や海の深さとどんな関係があるのだろう？`);
  if (topFish) q.push(`${topFish.name}は、どこで、どのようにとられたり育てられたりしているのだろう？`);
  q.push('養殖の魚と天然の魚では、産地にどんなちがいがあるのだろう？');
  q.push('とれた魚は、どうやって新鮮なままお店まで運ばれてくるのだろう？');
  q.push('潮目（寒流と暖流がぶつかる所）の近くに、よい漁場が多いのはなぜだろう？');
  return [...new Set(q)].slice(0, 5);
}

export function uid(prefix = 'e'): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
