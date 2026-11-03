import { signal } from '@preact/signals';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { FISH, CURRENT_LABEL, type Fish } from '../data/fish';
import { PLACE_BY_ID } from '../data/places';
import { entries, focusFish, tab } from '../state';
import { iconSvg } from './icons';
import art from '../assets/art/zukan.webp';
import { CREDITS, figure, photo } from './photo';
import { G } from './Glyph';

const openId = signal<string | null>(null);

export function openFish(id: string) {
  tab.value = 'zukan';
  openId.value = id;
  setTimeout(() => document.getElementById(`fish-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 380);
}

type Cur = 'all' | 'class' | 'warm' | 'cold' | 'farmed';

export function Zukan() {
  const [q, setQ] = useState('');
  const [cur, setCur] = useState<Cur>('all');
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries.value) if (e.fishId) m.set(e.fishId, (m.get(e.fishId) ?? 0) + 1);
    return m;
  }, [entries.value]);
  const list = FISH.filter((f) => {
    if (cur === 'warm' && f.current !== 'warm') return false;
    if (cur === 'cold' && f.current !== 'cold') return false;
    if (cur === 'farmed' && f.method === 'wild') return false;
    if (cur === 'class' && !counts.get(f.id)) return false;
    const t = q.trim();
    return !t || [f.name, f.kanji, ...f.aliases].some((a) => a.includes(t));
  });
  return (
    <section class={`panel ${tab.value === 'zukan' ? 'on' : ''}`} aria-label="図鑑" data-testid="zukan" aria-hidden={tab.value !== 'zukan'}>
      <div class="ph"><h2><span class="em">魚</span>の図鑑</h2><span class="cnt">{list.length} / {FISH.length}</span><img class="ph-art" src={art} alt="" /></div>
      <div class="rule"><i /><span>タップで<b>くわしく</b>開く</span><s /></div>
      <input class="search glass" type="search" placeholder="魚の名前でさがす" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="魚の名前でさがす" />
      <div class="chips">
        {([['all', 'すべて'], ['class', 'クラスで集まった魚'], ['warm', '暖流'], ['cold', '寒流'], ['farmed', '養殖がある']] as [Cur, string][]).map(([k, t]) => (
          <button key={k} class="chip" aria-pressed={cur === k} onClick={() => setCur(k)}>{t}</button>
        ))}
      </div>
      {list.map((f) => <Item key={f.id} f={f} n={counts.get(f.id) ?? 0} />)}
      {!list.length && <p class="empty">見つかりませんでした</p>}
      {Object.keys(CREDITS).length > 0 && (
        <details class="credits">
          <summary>写真の出典（Wikimedia Commons）</summary>
          <ul>
            {FISH.filter((f) => CREDITS[f.id]).map((f) => (
              <li key={f.id}>{f.name}：<a href={CREDITS[f.id].page} target="_blank" rel="noopener">{CREDITS[f.id].author || CREDITS[f.id].file}</a>（{CREDITS[f.id].license}）</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Item({ f, n }: { f: Fish; n: number }) {
  const open = openId.value === f.id;
  const [seen, setSeen] = useState(open);
  useEffect(() => { if (open) setSeen(true); }, [open]);
  const cls = f.current === 'inland' ? 'inland' : f.current;
  const tagCls = f.current === 'inland' ? 'cls' : f.current;
  return (
    <article id={`fish-${f.id}`} class={`acc neon ${cls} ${open ? 'open' : ''}`} data-fish={f.id}>
      <button class="acc-head" aria-expanded={open} aria-controls={`fb-${f.id}`} onClick={() => (openId.value = open ? null : f.id)}>
        {figure(f.id, true)
          ? <span class="ic fig"><img src={figure(f.id, true)!} alt="" loading="lazy" decoding="async" /></span>
          : <span class="ic" dangerouslySetInnerHTML={{ __html: iconSvg(f.icon, f.color, 50) }} />}
        <span class="t">
          <span class="nm">{f.name}</span><span class="kj">{f.kanji}</span>
          <span class="tags">
            <span class={`tag ${tagCls}`}>{CURRENT_LABEL[f.current]}</span>
            {f.method !== 'wild' && <span class="tag farmed">{f.method === 'farmed' ? '養殖' : '天然・養殖'}</span>}
            {n > 0 && <span class="tag mine">クラスで{n}件</span>}
          </span>
        </span>
        <G.chev />
      </button>
      <div class="acc-body" id={`fb-${f.id}`} role="region" aria-label={`${f.name}のくわしい説明`}>
        <div>
          {(open || seen) && (
            <div class="acc-inner">
              {photo(f.id) && (
                <figure class="hero">
                  <img src={photo(f.id)!} alt={`${f.name}の写真`} loading="lazy" decoding="async" />
                  {CREDITS[f.id] && <figcaption>写真：<a href={CREDITS[f.id].page} target="_blank" rel="noopener">{CREDITS[f.id].author || 'Wikimedia Commons'}</a>（{CREDITS[f.id].license}）</figcaption>}
                </figure>
              )}
              <div class="facts">
                <div class="fact"><span class="k">国内の産地</span><span class="place-chips">{f.domestic.map((id) => <span key={id}>{PLACE_BY_ID.get(id)?.name}</span>)}</span></div>
                <div class="fact"><span class="k">外国の産地</span>{f.overseas.length ? <span class="place-chips">{f.overseas.map((id) => <span class="ov" key={id}>{PLACE_BY_ID.get(id)?.name}</span>)}</span> : <p class="sub">ほとんど国内</p>}</div>
                <div class="fact wide"><span class="k">とり方・育て方</span><p>{f.how}</p></div>
                <div class="fact"><span class="k">旬</span><p>{f.season}</p></div>
                <div class="fact"><span class="k">海流</span><p>{CURRENT_LABEL[f.current]}</p></div>
                <div class="fact wide"><span class="k">ポイント</span><p>{f.point}</p></div>
              </div>
              <div class="why"><b>なぜ？</b><br />{f.why}</div>
              <button class="btn primary block" onClick={() => { focusFish.value = f.id; tab.value = 'map'; }} data-testid={`show-${f.id}`}>
                <G.target />地球儀で産地を見る
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
