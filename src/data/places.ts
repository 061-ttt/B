// 産地辞書。値札に書かれる「都道府県」「港・地域名」「水域名」「国名」を地図上の代表点に結びつける。
// 代表点は魚がとれる・育てられる場所の近く（内陸県は県の中心）。教材用の目安であり厳密な位置ではない。

export type PlaceKind = 'pref' | 'area' | 'sea' | 'country';

export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  domestic: boolean;
  lat: number;
  lon: number;
  aliases?: string[];
  ruby?: string;
}

const P = (id: string, name: string, lat: number, lon: number, aliases: string[] = []): Place => ({ id, name, kind: 'pref', domestic: true, lat, lon, aliases });
const A = (id: string, name: string, lat: number, lon: number, aliases: string[] = []): Place => ({ id, name, kind: 'area', domestic: true, lat, lon, aliases });
const S = (id: string, name: string, lat: number, lon: number, domestic: boolean, aliases: string[] = []): Place => ({ id, name, kind: 'sea', domestic, lat, lon, aliases });
const C = (id: string, name: string, lat: number, lon: number, aliases: string[] = []): Place => ({ id, name, kind: 'country', domestic: false, lat, lon, aliases });

export const PLACES: Place[] = [
  // 都道府県
  P('hokkaido', '北海道', 43.1, 143.2, ['道産', 'ほっかいどう']),
  P('aomori', '青森', 40.83, 140.74, ['あおもり']),
  P('iwate', '岩手', 39.64, 141.95, ['いわて']),
  P('miyagi', '宮城', 38.43, 141.3, ['みやぎ']),
  P('akita', '秋田', 39.72, 140.05, ['あきた']),
  P('yamagata', '山形', 38.92, 139.82, ['やまがた']),
  P('fukushima', '福島', 36.95, 140.9, ['ふくしま']),
  P('ibaraki', '茨城', 36.37, 140.62, ['いばらき']),
  P('tochigi', '栃木', 36.56, 139.88, ['とちぎ']),
  P('gunma', '群馬', 36.39, 139.06, ['ぐんま']),
  P('saitama', '埼玉', 35.86, 139.65, ['さいたま']),
  P('chiba', '千葉', 35.3, 140.4, ['ちば']),
  P('tokyo', '東京', 35.63, 139.8, ['とうきょう']),
  P('kanagawa', '神奈川', 35.2, 139.6, ['かながわ']),
  P('niigata', '新潟', 37.92, 139.05, ['にいがた']),
  P('toyama', '富山', 36.8, 137.2, ['とやま']),
  P('ishikawa', '石川', 36.95, 136.75, ['いしかわ']),
  P('fukui', '福井', 35.95, 136.1, ['ふくい']),
  P('yamanashi', '山梨', 35.66, 138.57, ['やまなし']),
  P('nagano', '長野', 36.23, 138.18, ['ながの']),
  P('gifu', '岐阜', 35.6, 136.9, ['ぎふ']),
  P('shizuoka', '静岡', 34.85, 138.3, ['しずおか']),
  P('aichi', '愛知', 34.75, 137.15, ['あいち']),
  P('mie', '三重', 34.3, 136.75, ['みえ']),
  P('shiga', '滋賀', 35.2, 136.1, ['しが']),
  P('kyoto', '京都', 35.5, 135.25, ['きょうと']),
  P('osaka', '大阪', 34.6, 135.4, ['おおさか']),
  P('hyogo', '兵庫', 34.66, 134.95, ['ひょうご']),
  P('nara', '奈良', 34.6, 135.8, ['なら']),
  P('wakayama', '和歌山', 33.75, 135.3, ['わかやま']),
  P('tottori', '鳥取', 35.5, 133.7, ['とっとり']),
  P('shimane', '島根', 35.0, 132.3, ['しまね']),
  P('okayama', '岡山', 34.55, 133.9, ['おかやま']),
  P('hiroshima', '広島', 34.3, 132.5, ['ひろしま']),
  P('yamaguchi', '山口', 34.0, 131.1, ['やまぐち']),
  P('tokushima', '徳島', 34.05, 134.6, ['とくしま']),
  P('kagawa', '香川', 34.3, 134.0, ['かがわ']),
  P('ehime', '愛媛', 33.4, 132.6, ['えひめ']),
  P('kochi', '高知', 33.4, 133.5, ['こうち']),
  P('fukuoka', '福岡', 33.65, 130.35, ['ふくおか']),
  P('saga', '佐賀', 33.15, 130.25, ['さが']),
  P('nagasaki', '長崎', 32.85, 129.8, ['ながさき']),
  P('kumamoto', '熊本', 32.55, 130.5, ['くまもと']),
  P('oita', '大分', 33.05, 131.85, ['おおいた']),
  P('miyazaki', '宮崎', 32.0, 131.5, ['みやざき']),
  P('kagoshima', '鹿児島', 31.45, 130.4, ['かごしま']),
  P('okinawa', '沖縄', 26.3, 127.8, ['おきなわ']),

  // 港・地域
  A('kushiro', '釧路', 42.98, 144.38, ['くしろ']),
  A('nemuro', '根室', 43.33, 145.58, ['ねむろ']),
  A('wakkanai', '稚内', 45.41, 141.67, ['わっかない']),
  A('hakodate', '函館', 41.77, 140.73, ['はこだて']),
  A('abashiri', '網走', 44.02, 144.27, ['あばしり']),
  A('monbetsu', '紋別', 44.35, 143.35, ['もんべつ']),
  A('rausu', '羅臼', 44.02, 145.19, ['らうす']),
  A('akkeshi', '厚岸', 43.05, 144.85, ['あっけし']),
  A('hachinohe', '八戸', 40.53, 141.53, ['はちのへ']),
  A('oma', '大間', 41.53, 140.91, ['おおま']),
  A('mutsu-bay', '陸奥湾', 41.0, 140.9, ['むつ湾']),
  A('sanriku', '三陸', 39.3, 141.95, ['さんりく']),
  A('miyako', '宮古', 39.64, 141.95, []),
  A('ofunato', '大船渡', 39.07, 141.72, []),
  A('kesennuma', '気仙沼', 38.9, 141.57, ['けせんぬま']),
  A('ishinomaki', '石巻', 38.43, 141.3, ['いしのまき']),
  A('onagawa', '女川', 38.44, 141.45, []),
  A('shiogama', '塩釜', 38.32, 141.02, ['塩竈']),
  A('choshi', '銚子', 35.73, 140.83, ['ちょうし']),
  A('onahama', '小名浜', 36.95, 140.9, []),
  A('misaki', '三崎', 35.14, 139.62, ['みさき']),
  A('yaizu', '焼津', 34.87, 138.32, ['やいづ']),
  A('numazu', '沼津', 35.08, 138.86, ['ぬまづ']),
  A('suruga-bay', '駿河湾', 34.85, 138.6, []),
  A('toyama-bay', '富山湾', 36.85, 137.25, []),
  A('himi', '氷見', 36.86, 136.99, ['ひみ']),
  A('noto', '能登', 37.3, 137.0, ['のと', '輪島']),
  A('echizen', '越前', 35.97, 135.96, ['えちぜん']),
  A('maizuru', '舞鶴', 35.47, 135.38, []),
  A('sakaiminato', '境港', 35.54, 133.23, ['さかいみなと']),
  A('hamada', '浜田', 34.9, 132.08, []),
  A('shimonoseki', '下関', 33.96, 130.94, ['しものせき']),
  A('karatsu', '唐津', 33.45, 129.97, []),
  A('matsuura', '松浦', 33.34, 129.7, []),
  A('goto', '五島', 32.7, 128.84, ['ごとう']),
  A('tsushima', '対馬', 34.4, 129.33, []),
  A('makurazaki', '枕崎', 31.27, 130.3, ['まくらざき']),
  A('tosashimizu', '土佐清水', 32.78, 132.95, []),
  A('uwajima', '宇和島', 33.22, 132.56, []),
  A('akashi', '明石', 34.65, 135.0, ['あかし']),
  A('kuwana', '桑名', 35.05, 136.72, ['くわな']),
  A('naruto', '鳴門', 34.18, 134.6, ['なると']),
  A('shinjiko', '宍道湖', 35.45, 132.95, ['しんじこ']),
  A('jusanko', '十三湖', 41.0, 140.35, []),
  A('ariake', '有明海', 33.0, 130.3, ['ありあけ']),
  A('setouchi', '瀬戸内海', 34.2, 133.2, ['瀬戸内']),
  A('tokyo-bay', '東京湾', 35.4, 139.8, []),
  A('ise-bay', '伊勢湾', 34.8, 136.8, []),
  A('mikawa-bay', '三河湾', 34.7, 137.1, []),
  A('wakasa-bay', '若狭湾', 35.6, 135.8, []),

  // 水域（日本の近く＝国内、遠い海＝遠洋）
  S('sea-of-japan', '日本海', 40.0, 135.0, true, ['にほんかい']),
  S('east-china-sea', '東シナ海', 29.5, 125.5, true, []),
  S('okhotsk', 'オホーツク海', 45.8, 146.0, true, []),
  S('sanriku-oki', '三陸沖', 39.0, 142.8, true, []),
  S('joban-oki', '常磐沖', 36.8, 141.6, true, ['常磐']),
  S('north-pacific', '北太平洋', 45.0, 175.0, false, ['北西太平洋', '太平洋北部']),
  S('pacific', '太平洋', 30.0, 165.0, false, ['中西部太平洋']),
  S('south-pacific', '南太平洋', -25.0, -150.0, false, []),
  S('east-pacific', '東部太平洋', 0.0, -120.0, false, []),
  S('north-atlantic', '北大西洋', 52.0, -30.0, false, []),
  S('atlantic', '大西洋', 30.0, -40.0, false, ['たいせいよう']),
  S('south-atlantic', '南大西洋', -30.0, -15.0, false, []),
  S('indian', 'インド洋', -15.0, 80.0, false, []),
  S('bering', 'ベーリング海', 58.0, -178.0, false, []),
  S('southern', '南極海', -57.0, -40.0, false, []),
  S('mediterranean', '地中海', 36.0, 18.0, false, []),

  // 国・地域
  C('norway', 'ノルウェー', 62.5, 6.2, ['ノルウェイ']),
  C('chile', 'チリ', -41.5, -73.0, []),
  C('iceland', 'アイスランド', 64.2, -22.5, []),
  C('russia', 'ロシア', 53.0, 158.6, ['ロシア連邦']),
  C('usa', 'アメリカ', 53.9, -166.5, ['米国', 'アメリカ合衆国', 'USA', 'アラスカ', '合衆国']),
  C('canada', 'カナダ', 47.6, -52.7, []),
  C('china', '中国', 36.07, 120.38, ['中華人民共和国']),
  C('korea', '韓国', 35.1, 129.04, ['大韓民国']),
  C('taiwan', '台湾', 22.6, 120.3, []),
  C('vietnam', 'ベトナム', 10.0, 105.8, ['ヴェトナム']),
  C('thailand', 'タイ', 13.55, 100.27, ['タイ王国']),
  C('indonesia', 'インドネシア', -7.2, 112.7, []),
  C('india', 'インド', 16.5, 82.2, []),
  C('philippines', 'フィリピン', 10.7, 122.6, []),
  C('malaysia', 'マレーシア', 4.0, 100.6, []),
  C('myanmar', 'ミャンマー', 16.8, 96.2, []),
  C('bangladesh', 'バングラデシュ', 22.3, 91.8, []),
  C('srilanka', 'スリランカ', 6.9, 79.85, []),
  C('australia', 'オーストラリア', -34.73, 135.86, ['豪州']),
  C('newzealand', 'ニュージーランド', -41.3, 174.8, []),
  C('tonga', 'トンガ', -21.2, -175.2, ['トンガ王国']),
  C('png', 'パプアニューギニア', -9.4, 147.2, []),
  C('fiji', 'フィジー', -18.1, 178.4, []),
  C('kiribati', 'キリバス', 1.4, 173.0, []),
  C('micronesia', 'ミクロネシア', 6.9, 158.2, []),
  C('marshall', 'マーシャル諸島', 7.1, 171.4, ['マーシャル']),
  C('denmark', 'デンマーク', 57.5, 9.9, []),
  C('faroe', 'フェロー諸島', 62.0, -6.8, ['フェロー']),
  C('uk', 'イギリス', 57.0, -5.8, ['英国', 'スコットランド']),
  C('ireland', 'アイルランド', 53.3, -9.3, []),
  C('netherlands', 'オランダ', 52.46, 4.6, []),
  C('france', 'フランス', 47.8, -4.3, []),
  C('spain', 'スペイン', 42.24, -8.72, []),
  C('portugal', 'ポルトガル', 38.7, -9.2, []),
  C('malta', 'マルタ', 35.9, 14.5, []),
  C('croatia', 'クロアチア', 43.5, 16.4, []),
  C('greece', 'ギリシャ', 37.9, 23.6, []),
  C('turkey', 'トルコ', 38.4, 26.9, ['トルコ共和国']),
  C('morocco', 'モロッコ', 23.7, -15.9, []),
  C('mauritania', 'モーリタニア', 20.9, -17.0, []),
  C('senegal', 'セネガル', 14.7, -17.4, []),
  C('namibia', 'ナミビア', -22.95, 14.5, []),
  C('southafrica', '南アフリカ', -33.9, 18.4, []),
  C('peru', 'ペルー', -12.0, -77.1, []),
  C('ecuador', 'エクアドル', -2.2, -80.9, []),
  C('argentina', 'アルゼンチン', -38.0, -57.5, []),
  C('brazil', 'ブラジル', -23.0, -43.2, []),
  C('mexico', 'メキシコ', 31.8, -116.6, []),
  C('panama', 'パナマ', 8.9, -79.5, []),
  C('greenland', 'グリーンランド', 64.2, -51.7, []),
  C('seychelles', 'セーシェル', -4.6, 55.5, []),
  C('maldives', 'モルディブ', 4.2, 73.5, []),
];

export const PLACE_BY_ID = new Map(PLACES.map((p) => [p.id, p]));

/** 世界地図で国内分をまとめて置く点 */
export const JAPAN_POINT = { lat: 36.5, lon: 139.5 };

/** 全角→半角、カタカナ→ひらがな、空白除去 */
export function norm(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・,，、。()（）「」『』【】\[\]]/g, '')
    .toLowerCase();
}

interface Key { key: string; place: Place }
let KEYS: Key[] | null = null;
function keys(): Key[] {
  if (KEYS) return KEYS;
  const ks: Key[] = [];
  for (const p of PLACES) {
    for (const n of [p.name, ...(p.aliases ?? [])]) ks.push({ key: norm(n), place: p });
  }
  // 長い名前を優先（「宮城県石巻」→石巻、「北太平洋」→太平洋より先）
  ks.sort((a, b) => b.key.length - a.key.length);
  KEYS = ks;
  return ks;
}

/** 自由な文字列から産地を1つ見つける。都道府県名の「県」「府」「都」は無視される */
export function findPlace(text: string): Place | null {
  const t = norm(text);
  if (!t) return null;
  // より具体的なもの（港・地域）を優先するため、長さ優先で最初に当たったもの
  let best: { p: Place; len: number; rank: number } | null = null;
  const rank: Record<PlaceKind, number> = { area: 3, country: 2, sea: 2, pref: 1 };
  for (const { key, place } of keys()) {
    if (key.length < 2 && key !== norm('タイ')) continue;
    if (!t.includes(key)) continue;
    // 「タイ」は魚の「たい」と区別するため、「産」「国」が続くときか単独のときだけ国とみなす
    if (place.id === 'thailand' && !/たい(産|国|王国)|^たい$/.test(t)) continue;
    // 「ちり」は「ちりめん」に含まれるので除外
    if (place.id === 'chile' && /ちりめん/.test(t)) continue;
    const r = rank[place.kind] * 100 + key.length;
    if (!best || r > best.rank) best = { p: place, len: key.length, rank: r };
  }
  return best?.p ?? null;
}

export function suggestPlaces(q: string, limit = 8): Place[] {
  const t = norm(q);
  if (!t) return [];
  const hits: { p: Place; s: number }[] = [];
  for (const p of PLACES) {
    const names = [p.name, ...(p.aliases ?? [])].map(norm);
    let s = -1;
    for (const n of names) {
      if (n.startsWith(t)) s = Math.max(s, 3);
      else if (n.includes(t)) s = Math.max(s, 2);
      else if (t.includes(n) && n.length >= 2) s = Math.max(s, 1);
    }
    if (s > 0) hits.push({ p, s });
  }
  return hits.sort((a, b) => b.s - a.s).slice(0, limit).map((h) => h.p);
}
