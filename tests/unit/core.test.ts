import { describe, expect, it } from 'vitest';
import { geoEquirectangular, geoMercator } from 'd3-geo';
import { parseTag, findFish } from '../../src/data/parse';
import { findPlace, PLACES, suggestPlaces } from '../../src/data/places';
import { FISH } from '../../src/data/fish';
import { CURRENTS } from '../../src/data/ocean';
import { aggregate, factLines, localQuestions, matches, pinScale, stats, type Entry } from '../../src/core/model';
import { makeProjector } from '../../src/geo/project';
import japan from '../../src/data/land-japan.json';
import world from '../../src/data/land-world.json';
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

describe('集計', () => {
  const es = [E('a', 'salmon', 'hokkaido', 'wild'), E('b', 'salmon', 'hokkaido'), E('c', 'saury', 'kushiro'), E('d', 'salmon', 'chile', 'farmed'), E('e', 'shrimp', 'vietnam', 'farmed'), E('f', 'mackerel', 'norway')];
  it('日本地図は国内だけ、同じ産地はまとまる', () => {
    const p = aggregate(es, 'japan');
    expect(p.map((x) => x.key).sort()).toEqual(['hokkaido', 'kushiro']);
    expect(p.find((x) => x.key === 'hokkaido')!.count).toBe(2);
  });
  it('世界地図は国内を「日本」1本にまとめる', () => {
    const p = aggregate(es, 'world');
    expect(p.find((x) => x.key === 'japan')!.count).toBe(3);
    expect(p.length).toBe(4);
  });
  it('件数が多いほどピンは大きい（上限あり）', () => {
    expect(pinScale(4)).toBeGreaterThan(pinScale(1));
    expect(pinScale(1000)).toBeLessThanOrEqual(2.1);
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

describe('投影', () => {
  it('日本：d3のメルカトルと一致', () => {
    const p = makeProjector(japan.proj as never);
    const m = geoMercator().scale(japan.proj.scale).translate(japan.proj.translate as [number, number]).center(japan.proj.center as [number, number]);
    const [x, y] = p.point(139.7, 35.7);
    const [mx, my] = m([139.7, 35.7])!;
    expect(x).toBeCloseTo(mx, 6);
    expect(y).toBeCloseTo(my, 6);
  });
  it('世界：太平洋中心、d3と一致', () => {
    const p = makeProjector(world.proj as never);
    const d = geoEquirectangular().rotate(world.proj.rotate as [number, number, number]).scale(world.proj.scale).translate(world.proj.translate as [number, number]);
    for (const ll of [[139.7, 35.7], [-70, -30], [10, 60], [-150, 20]] as [number, number][]) {
      const [x, y] = p.point(...ll);
      const [dx, dy] = d(ll)!;
      expect(x).toBeCloseTo(dx, 4);
      expect(y).toBeCloseTo(dy, 4);
    }
    expect(p.point(150, 0)[0]).toBeCloseTo(world.W / 2, 4);
  });
  it('世界：西経30度の継ぎ目で海流の線を分ける', () => {
    const p = makeProjector(world.proj as never);
    const segs = p.path([[318, 46], [328, 50], [340, 54], [350, 57]]);
    expect(segs.length).toBe(2);
    expect(segs[0].at(-1)![0]).toBeGreaterThan(world.W - 2);
    expect(segs[1][0][0]).toBeLessThan(2);
    // 継ぎ目をまたがない線は1本のまま
    expect(p.path([[120, 20], [180, 30], [220, 40]]).length).toBe(1);
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
