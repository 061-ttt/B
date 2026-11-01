import { signal } from '@preact/signals';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { FISH, CURRENT_LABEL, type Fish } from '../data/fish';
import { PLACE_BY_ID } from '../data/places';
import { entries, focusFish, tab, view } from '../state';
import { iconSvg } from './icons';
import { G } from './Glyph';

const openId = signal<string | null>(null);

export function openFish(id: string) {
  tab.value = 'zukan';
  openId.value = id;
  setTimeout(() => document.getElementById(`fish-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 380);
}

type Cur = 'all' | 'warm' | 'cold' | 'farmed' | 'class';

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
    if (!q) return true;
    const t = q.trim();
    return [f.name, f.kanji, ...f.aliases].some((a) => a.includes(t));
  });
  return (
    <section class={`panel ${tab.value === 'zukan' ? 'on' : ''}`} aria-label="図鑑" data-testid="zukan" aria-hidden={tab.value !== 'zukan'}>
      <h2>図鑑</h2>
      <input class="search glass" type="search" placeholder="魚の名前でさがす" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="chips" style={{ position: 'static', padding: '0 0 12px' }}>
        {([['all', 'すべて'], ['class', 'クラスで集まった魚'], ['warm', '暖流'], ['cold', '寒流'], ['farmed', '養殖がある']] as [Cur, string][]).map(([k, t]) => (
          <button key={k} class="chip glass" aria-pressed={cur === k} onClick={() => setCur(k)}>{t}</button>
        ))}
      </div>
      {list.map((f) => <Item key={f.id} f={f} n={counts.get(f.id) ?? 0} />)}
      {!list.length && <p class="empty">見つかりませんでした</p>}
    </section>
  );
}

function Item({ f, n }: { f: Fish; n: number }) {
  const open = openId.value === f.id;
  const [seen, setSeen] = useState(open);
  useEffect(() => { if (open) setSeen(true); }, [open]);
  const curCls = f.current === 'inland' ? 'cls' : f.current;
  return (
    <article id={`fish-${f.id}`} class={`acc glass ${open ? 'open' : ''}`} data-fish={f.id}>
      <button class="acc-head" aria-expanded={open} aria-controls={`fb-${f.id}`} onClick={() => (openId.value = open ? null : f.id)}>
        <span class="ic" dangerouslySetInnerHTML={{ __html: iconSvg(f.icon, f.color, 38) }} />
        <span class="t">
          <span class="nm">{f.name}</span><span class="kj">{f.kanji}</span>
          <span class="tags">
            <span class={`tag ${curCls}`}>{CURRENT_LABEL[f.current]}</span>
            {f.method !== 'wild' && <span class="tag farmed">{f.method === 'farmed' ? '養殖' : '天然・養殖'}</span>}
            {n > 0 && <span class="tag" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}>クラスで{n}件</span>}
          </span>
        </span>
        <G.chev />
      </button>
      <div class="acc-body" id={`fb-${f.id}`} role="region">
        <div>
          {(open || seen) && (
            <div class="acc-inner">
              <div class="row"><span class="k">国内</span><span class="place-chips">{f.domestic.map((id) => <span key={id}>{PLACE_BY_ID.get(id)?.name}</span>)}</span></div>
              {f.overseas.length > 0 && <div class="row"><span class="k">外国</span><span class="place-chips">{f.overseas.map((id) => <span class="ov" key={id}>{PLACE_BY_ID.get(id)?.name}</span>)}</span></div>}
              <div class="row"><span class="k">とり方</span><span>{f.how}</span></div>
              <div class="row"><span class="k">旬</span><span>{f.season}</span></div>
              <div class="row"><span class="k">ポイント</span><span>{f.point}</span></div>
              <div class="why"><b>なぜ？</b>{f.why}</div>
              <button class="btn primary" onClick={() => { focusFish.value = f.id; if (f.overseas.length && !f.domestic.length) view.value = 'world'; tab.value = 'map'; }} data-testid={`show-${f.id}`}>
                <G.target />地図で産地を見る
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
