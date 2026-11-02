import { describe, expect, it } from 'vitest';
import { parseTag, findFish } from '../../src/data/parse';
import { findPlace, PLACES, suggestPlaces } from '../../src/data/places';
import { FISH } from '../../src/data/fish';
import { CURRENTS } from '../../src/data/ocean';
import { aggregate, factLines, localQuestions, matches, pinScale, stats, type Entry } from '../../src/core/model';
import { lonLatTo, toLonLat, R } from '../../src/map/globe';
import globe from '../../src/data/land-globe.json';
import jpatch from '../../src/data/land-jpatch.json';
import credits from '../../src/data/photo-credits.json';
const assets = import.meta.glob('../../src/assets/fish/*.webp');
import { sanitize } from '../../worker/sanitize';

const E = (id: string, fishId: string | null, placeId: string, method: Entry['method'] = 'unknown', fishName = fishId ?? '?'): Entry =>
  ({ id, fishId, fishName, placeId, method, group: 1, at: 0, device: 'd1' });

describe('値札の解析（AIなし）', () => {
  it.each([
    ['チリ産 銀鮭 養殖 解凍', 'salmon', 'chile', 'farmed'],
    ['ノルウェー産 塩さば', 'mackerel', 'norway', 'unknown'],
    ['北海道産 生さんま', 'saury', 'hokkaido', 'unknown'],
    ['宮城県石巻 銀ざけ', 'salmon', 'ishinomaki', 'unknown'],
    ['まだい 愛媛県産 養殖', 'seabream', 'ehime', 'farmed'],
    ['タイ産 バナメイえび', 'shrimp', 'thailand', 'unknown'],
    ['ベトナム産 ブラックタイガー', 'shrimp', 'vietnam', 'unknown'],
    ['モロッコ産 ゆでだこ', 'octopus', 'morocco', 'unknown'],
    ['アメリカ産 からすがれい', 'flatfish', 'usa', 'unknown'],
    ['静岡県産 釜揚げしらす', 'shirasu', 'shizuoka', 'unknown'],
    ['ちりめんじゃこ 兵庫県', 'shirasu', 'hyogo', 'unknown'],
    ['北太平洋 めばちまぐろ', 'tuna', 'north-pacific', 'unknown'],
    ['インドネシア産 えび', 'shrimp', 'indonesia', 'unknown'],
    ['天然 ぶり 富山県氷見', 'yellowtail', 'himi', 'wild'],
    ['長崎県産 ひらまさ 天然', 'hiramasa', 'nagasaki', 'wild'],
    ['ヒラス 鹿児島 養殖', 'hiramasa', 'kagoshima', 'farmed'],
    ['オーストラリア産 ヒラマサ', 'hiramasa', 'australia', 'unknown'],
    ['ＣＨＩＬＥ チリ産 トラウト', 'salmon', 'chile', 'unknown'],
  ])('%s', (text, fish, place, method) => {
    const r = parseTag(text);
    expect(r.fish?.id).toBe(fish);
    expect(r.place?.id).toBe(place);
    expect(r.method).toBe(method);
  });

  it('「国産」だけでは産地を決めない', () => {
    expect(parseTag('国産 さば').place).toBeNull();
  });
  it('知らない魚は文字を残す', () => {
    const r = parseTag('長崎県産 のどぐろ');
    expect(r.fish).toBeNull();
    expect(r.fishText).toBe('のどぐろ');
    expect(r.place?.id).toBe('nagasaki');
  });
  it('「たい」（魚）を国のタイと取り違えない', () => {
    expect(findPlace('たい')?.id).toBe('thailand'); // 単独で国名欄に入れた場合
    expect(parseTag('まだい 長崎').place?.id).toBe('nagasaki');
    expect(findFish('たい')?.id).toBe('seabream');
  });
  it('候補検索', () => {
    expect(suggestPlaces('ほっ')[0].id).toBe('hokkaido');
    expect(suggestPlaces('ノル')[0].id).toBe('norway');
  });
});

describe('教材データの整合性', () => {
  it('図鑑の産地はすべて辞書にある', () => {
    const ids = new Set(PLACES.map((p) => p.id));
    for (const f of FISH) for (const id of [...f.domestic, ...f.overseas]) expect(ids.has(id), `${f.id}:${id}`).toBe(true);
  });
  it('産地のIDと名前は重複しない', () => {
    expect(new Set(PLACES.map((p) => p.id)).size).toBe(PLACES.length);
    expect(new Set(PLACES.map((p) => p.name)).size).toBe(PLACES.length);
  });
  it('図鑑の「なぜ？」は問いの形', () => {
    for (const f of FISH) expect(f.why).toMatch(/[？?]$/);
  });
  it('日本の寒流・暖流と潮目がある', () => {
    const jp = CURRENTS.filter((c) => c.view.includes('japan'));
    expect(jp.some((c) => c.kind === 'warm' && c.name.includes('黒潮'))).toBe(true);
    expect(jp.some((c) => c.kind === 'cold' && c.name.includes('親潮'))).toBe(true);
    expect(jp.some((c) => c.kind === 'meet')).toBe(true);
  });
});

describe('魚の写真', () => {
  it('図鑑の全種に写真があり、教材に使えるライセンスで出典がある', () => {
    const c = credits as Record<string, { file: string; license: string; page: string }>;
    for (const f of FISH) {
      expect(c[f.id], f.id).toBeTruthy();
      expect(c[f.id].license, f.id).toMatch(/public domain|cc0|cc by/i);
      expect(c[f.id].page).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
      for (const s of ['', '-s']) expect(`../../src/assets/fish/${f.id}${s}.webp` in assets, `${f.id}${s}`).toBe(true);
    }
  });
});

describe('集計', () => {
  const es = [E('a', 'salmon', 'hokkaido', 'wild'), E('b', 'salmon', 'hokkaido'), E('c', 'saury', 'kushiro'), E('d', 'salmon', 'chile', 'farmed'), E('e', 'shrimp', 'vietnam', 'farmed'), E('f', 'mackerel', 'norway')];
  it('同じ産地でも魚の種類ごとに別のピン、同じ魚はまとまる', () => {
    const p = aggregate(es, 'detail');
    const hk = p.filter((x) => x.placeKey === 'hokkaido');
    expect(hk.map((x) => x.key).sort()).toEqual(['hokkaido|salmon']);
    expect(hk[0].count).toBe(2);
    const more = aggregate([...es, E('g', 'scallop', 'hokkaido')], 'detail').filter((x) => x.placeKey === 'hokkaido');
    expect(more.map((x) => x.fishKey).sort()).toEqual(['salmon', 'scallop']);
    expect(p.length).toBe(5);
  });
  it('引いて見るときは国内を「日本」にまとめ、魚の種類ごとには分けたまま', () => {
    const p = aggregate(es, 'world');
    const jp = p.filter((x) => x.placeKey === 'japan');
    expect(jp.map((x) => x.fishKey).sort()).toEqual(['salmon', 'saury']);
    expect(jp.find((x) => x.fishKey === 'salmon')!.count).toBe(2);
    expect(p.length).toBe(5);
  });
  it('図鑑にない魚も名前ごとに分かれる', () => {
    const p = aggregate([E('n1', null, 'nagasaki', 'unknown', 'のどぐろ'), E('n2', null, 'nagasaki', 'unknown', 'きびなご')], 'detail');
    expect(p.length).toBe(2);
  });
  it('件数が多いほどピンは大きい（上限あり）', () => {
    expect(pinScale(4)).toBeGreaterThan(pinScale(1));
    expect(pinScale(1000)).toBeLessThanOrEqual(2.8);
    expect(pinScale(9) / pinScale(1)).toBeGreaterThan(1.5);
  });
  it('絞り込み', () => {
    expect(es.filter((e) => matches(e, 'overseas', null)).length).toBe(3);
    expect(es.filter((e) => matches(e, 'farmed', null)).length).toBe(2);
    expect(es.filter((e) => matches(e, 'cold', null)).length).toBe(4);
    expect(es.filter((e) => matches(e, 'all', 'salmon')).length).toBe(3);
  });
  it('事実と問いのたね', () => {
    const s = stats(es);
    expect(s.domestic).toBe(3);
    const f = factLines(s).join('\n');
    expect(f).toContain('国内が3件');
    expect(f).toContain('海に面した');
    const q = localQuestions(s);
    expect(q.length).toBeGreaterThanOrEqual(3);
    q.forEach((x) => expect(x).toMatch(/？$/));
  });
});

describe('地球儀', () => {
  it('経緯度と球面の座標を行き来できる', () => {
    for (const [lon, lat] of [[139.7, 35.7], [-73, -41.5], [6.2, 62.5], [179.5, 10], [-179.5, -10]] as [number, number][]) {
      const v = lonLatTo(lon, lat);
      expect(v.length()).toBeCloseTo(R, 6);
      const [lo, la] = toLonLat(v);
      expect(lo).toBeCloseTo(lon, 6);
      expect(la).toBeCloseTo(lat, 6);
    }
  });
  it('北極は上、経度0度は手前（球の模様の向きと一致）', () => {
    expect(lonLatTo(0, 90).y).toBeCloseTo(R, 6);
    const v = lonLatTo(0, 0);
    expect(v.x).toBeCloseTo(R, 6); // 経度-180度が左端の画像を球にはると、経度0度は +X
  });
  it('陸地データ：日本は細かいデータに差しかわっている', () => {
    expect(globe.polys.length).toBeGreaterThan(500);
    const jp = globe.polys.slice(globe.japanFrom);
    expect(jp.length).toBeGreaterThan(20);
    // 本州（東経135〜142度・北緯34〜41度あたり）が日本側にある
    const honshu = jp.some((p) => { const r = p[0]; let x = 0, y = 0; for (let i = 0; i < r.length; i += 2) { x += r[i]; y += r[i + 1]; } x /= r.length / 2; y /= r.length / 2; return x > 135 && x < 141 && y > 34 && y < 40 && r.length > 400; });
    expect(honshu).toBe(true);
    // 世界側に日本の島は残っていない
    const dup = globe.polys.slice(0, globe.japanFrom).some((p) => { const r = p[0]; let x = 0, y = 0; for (let i = 0; i < r.length; i += 2) { x += r[i]; y += r[i + 1]; } x /= r.length / 2; y /= r.length / 2; return x > 132 && x < 141 && y > 33 && y < 40; });
    expect(dup).toBe(false);
  });
  it('日本付近の細かい深さ図の範囲', () => {
    expect(jpatch.bbox).toEqual([118, 20, 156, 50]);
    expect(jpatch.polys.length).toBeGreaterThan(50);
  });
});

describe('サーバーの入力検査', () => {
  it('正しい入力は通す', () => {
    const e = sanitize({ id: 'eabc12', fishId: 'salmon', fishName: 'さけ', placeId: 'chile', method: 'farmed', group: 3, at: 1, device: 'd1' });
    expect(e?.placeId).toBe('chile');
  });
  it('不正な入力ははじく', () => {
    expect(sanitize({ id: 'x', fishName: 'a', placeId: 'chile', device: 'd' })).toBeNull();
    expect(sanitize({ id: 'eabc12', fishName: 'a', placeId: 'mars', device: 'd' })).toBeNull();
    expect(sanitize({ id: 'eabc12', fishId: 'dragon', fishName: 'a', placeId: 'chile', device: 'd' })).toBeNull();
    const e = sanitize({ id: 'eabc12', fishId: null, fishName: '<img src=x>のどぐろ' + 'あ'.repeat(40), placeId: 'nagasaki', group: 99, device: 'd' })!;
    expect(e.fishName).not.toContain('<');
    expect(e.fishName.length).toBeLessThanOrEqual(24);
    expect(e.group).toBe(8);
  });
});
