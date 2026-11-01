// 値札の文字列を「魚・産地・天然/養殖」に分ける規則ベースの解析。
// Workers AI が使えないとき（オフライン・サーバー未接続）でもこれで動く。
import { FISH, type Fish } from './fish';
import { PLACES, findPlace, norm, type Place } from './places';

export type Method = 'wild' | 'farmed' | 'unknown';

export interface Parsed {
  fish: Fish | null;
  fishText: string;
  place: Place | null;
  method: Method;
}

let FISH_KEYS: { key: string; fish: Fish }[] | null = null;
function fishKeys() {
  if (FISH_KEYS) return FISH_KEYS;
  const ks: { key: string; fish: Fish }[] = [];
  for (const f of FISH) for (const a of [f.name, f.kanji, ...f.aliases]) {
    const k = norm(a);
    if (k.length >= 2) ks.push({ key: k, fish: f });
  }
  ks.sort((a, b) => b.key.length - a.key.length);
  FISH_KEYS = ks;
  return ks;
}

export function findFish(text: string): Fish | null {
  const t = norm(text);
  for (const { key, fish } of fishKeys()) if (t.includes(key)) return fish;
  return null;
}

export function suggestFish(q: string, limit = 8): Fish[] {
  const t = norm(q);
  if (!t) return FISH.slice(0, limit);
  const out: { f: Fish; s: number }[] = [];
  for (const f of FISH) {
    let s = 0;
    for (const a of [f.name, f.kanji, ...f.aliases].map(norm)) {
      if (a.startsWith(t)) s = Math.max(s, 3);
      else if (a.includes(t)) s = Math.max(s, 2);
      else if (t.includes(a) && a.length >= 2) s = Math.max(s, 1);
    }
    if (s) out.push({ f, s });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, limit).map((o) => o.f);
}

export function detectMethod(text: string): Method {
  const t = norm(text);
  if (/養殖|ようしょく/.test(t)) return 'farmed';
  if (/天然|てんねん/.test(t)) return 'wild';
  return 'unknown';
}

/** 値札全体（例：「チリ産 銀鮭 養殖 解凍」）を解析する */
export function parseTag(text: string): Parsed {
  const place = findPlace(text);
  let rest = norm(text);
  if (place) {
    for (const n of [place.name, ...(place.aliases ?? [])].map(norm).sort((a, b) => b.length - a.length)) {
      if (rest.includes(n)) { rest = rest.replace(n, ' '); break; }
    }
  }
  const fish = findFish(rest);
  const fishText = fish ? fish.name : extractFishWord(rest);
  return { fish, fishText, place, method: detectMethod(text) };
}

const NOISE = /(産|県|府|都|道|国産|輸入|養殖|天然|解凍|生食用|加熱用|切身|切り身|刺身|用|原産地|産地|名称|価格|円|税込|税抜|g|グラム|消費期限|\d+)/g;
function extractFishWord(rest: string): string {
  const w = rest.replace(NOISE, ' ').split(/\s+/).filter((s) => s.length >= 2);
  return w[0] ?? '';
}

export { PLACES };
