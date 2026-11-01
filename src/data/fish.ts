// 図鑑データ。教科書・水産庁の公開資料で一般に扱われる範囲の内容に限り、細かな順位や数値は書かない。
// why は「答え」ではなく、子どもが次に調べる問いのたね。

export type Icon = 'fish' | 'tuna' | 'flat' | 'shrimp' | 'squid' | 'octopus' | 'shell' | 'crab' | 'seaweed' | 'roe' | 'eel';
export type Current = 'warm' | 'cold' | 'both' | 'inland';

export interface Fish {
  id: string;
  name: string;
  kanji: string;
  aliases: string[];
  icon: Icon;
  color: string;
  current: Current;
  method: 'wild' | 'farmed' | 'both';
  domestic: string[];
  overseas: string[];
  season: string;
  how: string;
  point: string;
  why: string;
}

export const FISH: Fish[] = [
  {
    id: 'salmon', name: 'さけ・サーモン', kanji: '鮭', aliases: ['さけ', 'しゃけ', 'サーモン', '銀鮭', 'ぎんざけ', '秋鮭', '紅鮭', 'べにざけ', 'トラウト', '鱒', 'アトランティックサーモン', 'サーモントラウト', 'シロザケ'],
    icon: 'fish', color: '#ff8a65', current: 'cold', method: 'both',
    domestic: ['hokkaido', 'iwate', 'miyagi'], overseas: ['chile', 'norway', 'russia', 'usa'],
    season: '秋', how: '川に帰ってくる秋さけを定置網でとる。宮城では銀ざけの養殖も',
    point: 'お店のサーモンには、チリやノルウェーで養殖されたものが多い。北海道の秋さけは天然のもの。',
    why: 'チリやノルウェーのサーモンは、どんな場所で育てられ、どうやって日本まで運ばれてくるのだろう？',
  },
  {
    id: 'mackerel', name: 'さば', kanji: '鯖', aliases: ['さば', 'まさば', 'ごまさば', 'しめさば', '塩さば', 'ノルウェーさば'],
    icon: 'fish', color: '#64b5f6', current: 'warm', method: 'wild',
    domestic: ['ibaraki', 'nagasaki', 'chiba', 'miyagi', 'shizuoka'], overseas: ['norway'],
    season: '秋〜冬', how: '大きな網で群れを囲むまき網漁',
    point: '日本近海のまさばのほか、塩さばやしめさばにはノルウェーでとれたたいせいようさばも多い。',
    why: '日本の近くでもとれるのに、なぜ遠いノルウェーのさばも食べているのだろう？',
  },
  {
    id: 'horse-mackerel', name: 'あじ', kanji: '鯵', aliases: ['あじ', 'まあじ', 'あじ開き', 'アジ'],
    icon: 'fish', color: '#90caf9', current: 'warm', method: 'wild',
    domestic: ['nagasaki', 'shimane', 'tottori'], overseas: ['netherlands'],
    season: '夏', how: 'まき網漁。干物（開き）に加工されることも多い',
    point: '暖流が流れる東シナ海や日本海でたくさんとれる。開きにはオランダなどでとれたあじも使われる。',
    why: 'あじがよくとれる場所は、地図の上でどの海流の近くにあるだろう？',
  },
  {
    id: 'sardine', name: 'いわし', kanji: '鰯', aliases: ['いわし', 'まいわし', 'かたくちいわし', 'うるめいわし', 'めざし'],
    icon: 'fish', color: '#b0bec5', current: 'warm', method: 'wild',
    domestic: ['chiba', 'ibaraki', 'nagasaki', 'miyazaki'], overseas: [],
    season: '夏〜秋', how: 'まき網漁',
    point: '大きな群れで泳ぐ魚。とれる量が年によって大きく変わる。',
    why: 'いわしのとれる量が、年によって大きく変わるのはなぜだろう？',
  },
  {
    id: 'saury', name: 'さんま', kanji: '秋刀魚', aliases: ['さんま'],
    icon: 'fish', color: '#80deea', current: 'cold', method: 'wild',
    domestic: ['hokkaido', 'iwate', 'miyagi'], overseas: ['taiwan', 'china'],
    season: '秋', how: '夜に光で集めてすくい取る棒受け網漁',
    point: '親潮（寒流）に乗って北から南へ下ってくる。近年はとれる量が大きく減っている。',
    why: 'さんまがとれる場所が北海道や三陸に集まっているのは、海流とどんな関係があるのだろう？',
  },
  {
    id: 'tuna', name: 'まぐろ', kanji: '鮪', aliases: ['まぐろ', '本まぐろ', 'くろまぐろ', 'めばち', 'きはだ', 'びんちょう', 'みなみまぐろ', 'ねぎとろ', 'トロ'],
    icon: 'tuna', color: '#ef5350', current: 'warm', method: 'both',
    domestic: ['shizuoka', 'miyagi', 'aomori', 'nagasaki', 'kagoshima'], overseas: ['taiwan', 'korea', 'malta', 'spain', 'mexico', 'australia'],
    season: '冬（くろまぐろ）', how: '遠くの海まで出かける遠洋漁業（はえなわ・まき網）。いけすで育てる養殖も',
    point: '広い海を回遊する大きな魚。焼津や気仙沼には遠洋漁業の船が多く集まる。',
    why: '日本の船は、なぜ遠い海までまぐろをとりに行くのだろう？',
  },
  {
    id: 'bonito', name: 'かつお', kanji: '鰹', aliases: ['かつお', 'かつおのたたき', 'かつおぶし', '初がつお', '戻りがつお'],
    icon: 'tuna', color: '#e57373', current: 'warm', method: 'wild',
    domestic: ['shizuoka', 'miyagi', 'kochi', 'kagoshima'], overseas: [],
    season: '春（初がつお）・秋（戻りがつお）', how: '一本釣り・まき網',
    point: '黒潮（暖流）に乗って春に北へ上り、秋に南へ戻る。枕崎や焼津ではかつおぶしもつくられる。',
    why: '春と秋で、かつおがとれる場所が変わるのはなぜだろう？',
  },
  {
    id: 'yellowtail', name: 'ぶり・はまち', kanji: '鰤', aliases: ['ぶり', 'はまち', 'いなだ', 'わらさ', 'かんぱち', 'ひらまさ'],
    icon: 'fish', color: '#ffd54f', current: 'warm', method: 'both',
    domestic: ['kagoshima', 'oita', 'ehime', 'toyama'], overseas: [],
    season: '冬', how: '定置網でとる天然ものと、いけすで育てる養殖ものがある',
    point: '大きくなるにつれて名前が変わる出世魚。九州や四国では養殖がさかん。冬の富山湾の天然ぶりも有名。',
    why: '養殖が九州や四国の海でさかんなのは、どんな理由があるのだろう？',
  },
  {
    id: 'seabream', name: 'たい', kanji: '鯛', aliases: ['たい', 'まだい', '真鯛', 'れんこだい', 'ちだい'],
    icon: 'fish', color: '#f48fb1', current: 'warm', method: 'both',
    domestic: ['ehime', 'kumamoto', 'nagasaki', 'fukuoka'], overseas: [],
    season: '春', how: '養殖が多い。天然ものは釣りや網でとる',
    point: 'お店のまだいの多くは養殖。愛媛や熊本など、波がおだやかな入り江の多い海で育てられている。',
    why: '養殖に向いている海は、どんな形をした海岸だろう？',
  },
  {
    id: 'cod', name: 'たら', kanji: '鱈', aliases: ['たら', 'まだら', 'すけとうだら', 'すけそうだら', '真鱈'],
    icon: 'fish', color: '#cfd8dc', current: 'cold', method: 'wild',
    domestic: ['hokkaido', 'aomori', 'iwate', 'miyagi'], overseas: ['usa', 'russia'],
    season: '冬', how: '底びき網・はえなわ・刺し網',
    point: '冷たい海の底近くにすむ魚。すけとうだらは、かまぼこなどのすり身の原料にもなる。',
    why: 'たらがとれる場所が北の海に集まっているのはなぜだろう？',
  },
  {
    id: 'atka', name: 'ほっけ', kanji: '𩸽', aliases: ['ほっけ', 'しまほっけ', '開きほっけ'],
    icon: 'fish', color: '#bcaaa4', current: 'cold', method: 'wild',
    domestic: ['hokkaido'], overseas: ['usa', 'russia'],
    season: '春・秋', how: '刺し網・底びき網',
    point: '北海道の魚。干物の「しまほっけ」には、アラスカなどでとれたものが多い。',
    why: '北海道でもとれるのに、なぜアメリカやロシアからも買っているのだろう？',
  },
  {
    id: 'flatfish', name: 'かれい・ひらめ', kanji: '鰈', aliases: ['かれい', 'ひらめ', 'からすがれい', '赤魚', 'あかうお'],
    icon: 'flat', color: '#a1887f', current: 'cold', method: 'both',
    domestic: ['hokkaido', 'aomori', 'miyagi'], overseas: ['usa', 'russia', 'greenland'],
    season: '冬', how: '底びき網・刺し網。ひらめは養殖もある',
    point: '海の底でくらす平たい魚。切り身や干物のかれいは、北の遠い海でとれたものも多い。',
    why: '海の底にすむ魚がたくさんとれるのは、どんな深さの海だろう？',
  },
  {
    id: 'capelin', name: 'ししゃも', kanji: '柳葉魚', aliases: ['ししゃも', 'からふとししゃも', 'カペリン'],
    icon: 'fish', color: '#ffcc80', current: 'cold', method: 'wild',
    domestic: ['hokkaido'], overseas: ['norway', 'iceland', 'canada'],
    season: '秋〜冬', how: '網でとる',
    point: '本物のししゃもは北海道の太平洋側だけでとれる。お店に多いのは「からふとししゃも」で、ノルウェーやアイスランドなどから来る。',
    why: '本物のししゃもと、お店に多いからふとししゃもは、どこがちがうのだろう？',
  },
  {
    id: 'shrimp', name: 'えび', kanji: '海老', aliases: ['えび', 'ブラックタイガー', 'バナメイ', 'あまえび', '甘えび', 'くるまえび', 'ぼたんえび', 'むきえび'],
    icon: 'shrimp', color: '#ff7043', current: 'both', method: 'both',
    domestic: ['hokkaido', 'ishikawa', 'okinawa', 'kagoshima'], overseas: ['vietnam', 'india', 'indonesia', 'thailand'],
    season: '一年中', how: '海外では池での養殖が多い。国内のあまえびは底びき網など',
    point: '日本で食べるえびの多くは、東南アジアや南アジアの国で養殖されたもの。',
    why: 'えびを育てている国が、あたたかい国に多いのはなぜだろう？',
  },
  {
    id: 'squid', name: 'いか', kanji: '烏賊', aliases: ['いか', 'するめいか', 'やりいか', 'あおりいか', 'もんごういか', 'するめ'],
    icon: 'squid', color: '#e1bee7', current: 'both', method: 'wild',
    domestic: ['hokkaido', 'aomori', 'ishikawa', 'nagasaki'], overseas: ['china', 'peru', 'chile'],
    season: '夏〜秋', how: '夜に明かりで集めて釣るいか釣り漁',
    point: '函館や八戸はいか漁で知られる。いか釣り船の明かりは宇宙からも見えるほど明るい。',
    why: 'いか釣りは、なぜ夜に明かりをつけて行うのだろう？',
  },
  {
    id: 'octopus', name: 'たこ', kanji: '蛸', aliases: ['たこ', 'まだこ', 'みずだこ', 'ゆでだこ', '真だこ'],
    icon: 'octopus', color: '#e57373', current: 'both', method: 'wild',
    domestic: ['hokkaido', 'hyogo', 'akashi'], overseas: ['morocco', 'mauritania'],
    season: '夏', how: 'たこつぼ漁・底びき網',
    point: 'お店のまだこには、アフリカのモロッコやモーリタニアの沖でとれたものが多い。',
    why: '日本から遠いアフリカのたこが、なぜ日本の食卓に届くのだろう？',
  },
  {
    id: 'scallop', name: 'ほたて', kanji: '帆立', aliases: ['ほたて', 'ほたてがい', '帆立貝', 'ベビーほたて'],
    icon: 'shell', color: '#ffe082', current: 'cold', method: 'farmed',
    domestic: ['hokkaido', 'aomori', 'mutsu-bay'], overseas: [],
    season: '冬〜春', how: '稚貝を育てる養殖や、海に放して育ててとる方法',
    point: '北海道と青森が中心。海外へもたくさん輸出されている。',
    why: 'ほたての産地が北海道と青森に集まっているのはなぜだろう？',
  },
  {
    id: 'oyster', name: 'かき', kanji: '牡蠣', aliases: ['かき', 'まがき', '生かき', '牡蛎'],
    icon: 'shell', color: '#d7ccc8', current: 'both', method: 'farmed',
    domestic: ['hiroshima', 'miyagi', 'okayama'], overseas: [],
    season: '冬', how: 'いかだにつるして育てる養殖',
    point: '広島が特に有名。波がおだやかで、山からの栄養が川で運ばれてくる海で育てられる。',
    why: 'かきの養殖に、山や川が関係しているのはなぜだろう？',
  },
  {
    id: 'clam', name: 'あさり・しじみ', kanji: '浅蜊', aliases: ['あさり', 'しじみ', 'はまぐり'],
    icon: 'shell', color: '#a5d6a7', current: 'both', method: 'wild',
    domestic: ['aichi', 'shinjiko', 'jusanko', 'kumamoto'], overseas: ['china', 'korea'],
    season: '春', how: '干潟や浅い海、川の水と海水がまじる湖でとる',
    point: 'あさりは干潟、しじみは宍道湖などの川の水と海水がまじる場所でとれる。',
    why: '干潟が少なくなると、貝のとれる量はどうなるだろう？',
  },
  {
    id: 'eel', name: 'うなぎ', kanji: '鰻', aliases: ['うなぎ', '蒲焼', 'かばやき'],
    icon: 'eel', color: '#8d6e63', current: 'inland', method: 'farmed',
    domestic: ['kagoshima', 'aichi', 'miyazaki', 'shizuoka'], overseas: ['china', 'taiwan'],
    season: '夏（土用）', how: '川に上ってくる稚魚（しらすうなぎ）をとって池で育てる養殖',
    point: '卵から育てるのはとても難しく、ほとんどが稚魚をとって育てる方法。稚魚が減っていることが心配されている。',
    why: 'うなぎを卵から育てるのは、なぜむずかしいのだろう？',
  },
  {
    id: 'crab', name: 'かに', kanji: '蟹', aliases: ['かに', 'ずわいがに', 'たらばがに', '毛がに', 'けがに', '紅ずわい', '越前がに', '松葉がに'],
    icon: 'crab', color: '#ff5252', current: 'cold', method: 'wild',
    domestic: ['hokkaido', 'tottori', 'hyogo', 'fukui'], overseas: ['russia', 'canada', 'usa'],
    season: '冬', how: 'かにかご漁・底びき網。とってよい期間や大きさが決められている',
    point: '冷たい海のかにが多い。資源を守るため、とってよい時期やオス・メスのきまりがある。',
    why: 'かにをとってよい時期や大きさが決められているのはなぜだろう？',
  },
  {
    id: 'ikura', name: 'いくら・すじこ', kanji: 'イクラ', aliases: ['いくら', 'すじこ', '筋子'],
    icon: 'roe', color: '#ff6e40', current: 'cold', method: 'wild',
    domestic: ['hokkaido'], overseas: ['russia', 'usa'],
    season: '秋', how: 'さけの卵をほぐして味付けする',
    point: 'さけの卵。さけがとれる北の地域や国が産地になる。',
    why: 'いくらの産地とさけの産地を地図でくらべると、何が分かるだろう？',
  },
  {
    id: 'pollock-roe', name: 'たらこ・めんたいこ', kanji: '鱈子', aliases: ['たらこ', 'めんたいこ', '明太子', '辛子明太子'],
    icon: 'roe', color: '#ec407a', current: 'cold', method: 'wild',
    domestic: ['hokkaido', 'fukuoka'], overseas: ['usa', 'russia'],
    season: '冬', how: 'すけとうだらの卵を塩や唐辛子で味付けする',
    point: 'すけとうだらは北の海の魚。めんたいこは福岡で加工されるものが有名。',
    why: 'とれる場所と、加工される場所がちがうのはなぜだろう？',
  },
  {
    id: 'urchin', name: 'うに', kanji: '雲丹', aliases: ['うに', '生うに', 'ばふんうに', 'むらさきうに'],
    icon: 'shell', color: '#ffb300', current: 'cold', method: 'wild',
    domestic: ['hokkaido', 'iwate'], overseas: ['chile', 'russia', 'usa', 'canada'],
    season: '夏', how: '海にもぐる素もぐり漁や、箱めがねでのぞいてとる',
    point: 'こんぶなどの海藻を食べて育つ。海藻の多い北の海が産地になる。',
    why: 'うにの産地とこんぶの産地が重なるのはなぜだろう？',
  },
  {
    id: 'wakame', name: 'わかめ', kanji: '若布', aliases: ['わかめ', 'めかぶ', '茎わかめ'],
    icon: 'seaweed', color: '#66bb6a', current: 'cold', method: 'farmed',
    domestic: ['iwate', 'miyagi', 'naruto'], overseas: ['china', 'korea'],
    season: '春', how: 'ロープに種をつけて海で育てる養殖',
    point: '三陸の海で養殖がさかん。鳴門わかめも有名。',
    why: '三陸の海は、なぜ海藻や貝の養殖に向いているのだろう？',
  },
  {
    id: 'nori', name: 'のり', kanji: '海苔', aliases: ['のり', '焼きのり', '味付けのり', 'あおさ'],
    icon: 'seaweed', color: '#2e7d32', current: 'both', method: 'farmed',
    domestic: ['saga', 'ariake', 'hyogo', 'fukuoka', 'kumamoto'], overseas: ['korea', 'china'],
    season: '冬', how: '浅い海に網を張って育てる養殖',
    point: '有明海は潮の満ち引きの差が大きく、のりの養殖がさかん。',
    why: '潮の満ち引きの差が大きいと、のりの養殖にどんなよいことがあるのだろう？',
  },
  {
    id: 'kombu', name: 'こんぶ', kanji: '昆布', aliases: ['こんぶ', '真昆布', '利尻昆布', '日高昆布', '羅臼昆布'],
    icon: 'seaweed', color: '#558b2f', current: 'cold', method: 'both',
    domestic: ['hokkaido', 'aomori', 'iwate'], overseas: [],
    season: '夏', how: '天然のものをとるほか、養殖もある',
    point: 'ほとんどが北海道産。冷たい海でよく育つ。',
    why: 'こんぶが冷たい海でよく育つのはなぜだろう？',
  },
  {
    id: 'shirasu', name: 'しらす', kanji: '白子', aliases: ['しらす', 'ちりめん', 'ちりめんじゃこ', 'じゃこ', '釜揚げしらす'],
    icon: 'fish', color: '#eceff1', current: 'warm', method: 'wild',
    domestic: ['shizuoka', 'hyogo', 'aichi', 'kanagawa'], overseas: [],
    season: '春〜秋', how: '船で網を引いてとる',
    point: 'いわしの赤ちゃん。陸に近い海でとれる。',
    why: 'しらすがとれる海と、大人のいわしがとれる海はどうちがうのだろう？',
  },
  {
    id: 'herring', name: 'にしん・数の子', kanji: '鰊', aliases: ['にしん', '数の子', 'かずのこ'],
    icon: 'fish', color: '#90a4ae', current: 'cold', method: 'wild',
    domestic: ['hokkaido'], overseas: ['canada', 'usa', 'russia'],
    season: '春', how: '刺し網・定置網',
    point: '昔は北海道でたくさんとれたが、今は大きく減った。数の子はにしんの卵で、カナダやアメリカのものが多い。',
    why: '北海道でにしんがたくさんとれなくなったのはなぜだろう？',
  },
];

export const FISH_BY_ID = new Map(FISH.map((f) => [f.id, f]));

export const CURRENT_LABEL: Record<Current, string> = {
  warm: '暖流の魚', cold: '寒流の魚', both: '暖流・寒流どちらにも', inland: '川・池',
};
export const METHOD_LABEL = { wild: '天然', farmed: '養殖', unknown: 'わからない' } as const;
