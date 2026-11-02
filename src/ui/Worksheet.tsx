import { useState } from 'preact/hooks';
import { appendTo, entries, showToast, tab, worksheet } from '../state';
import { factLines, localQuestions, stats } from '../core/model';
import { aiQuestions } from '../core/sync';
import { G } from './Glyph';

const STARTERS = [
  '〇〇が多いのは、〜だからだと思う。',
  '海流が〜しているから、',
  '大陸棚（浅い海）が広いので、',
  '外国から来るのは、〜だからだと思う。',
  '養殖がさかんなのは、〜だからだと思う。',
];

const FIELDS = [
  { k: 'fact', no: '01', n: 'var(--blue)', t: '事実', q: 'どこに多かった？（国内／外国、海側、天然・養殖）' },
  { k: 'reason', no: '02', n: 'var(--green)', t: '理由の予想', q: 'なぜそこに集まると思う？' },
  { k: 'next', no: '03', n: 'var(--amber)', t: '次に調べたいこと', q: 'もっと知りたい「なぜ？」「どうやって？」' },
] as const;

export function Worksheet() {
  const w = worksheet.value;
  const [seeds, setSeeds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: 'fact' | 'reason' | 'next', v: string) => (worksheet.value = { ...worksheet.value, [k]: v });

  function pickFacts() {
    const lines = factLines(stats(entries.value));
    if (!lines.length) { showToast('まだ地球儀にデータがありません'); return; }
    appendTo('fact', lines.join('\n'));
  }
  async function makeSeeds() {
    setBusy(true);
    const s = stats(entries.value);
    const summary = factLines(s).join(' ');
    const ai = summary ? await aiQuestions(summary) : null;
    setSeeds(ai ?? localQuestions(s));
    setBusy(false);
  }

  return (
    <section class={`panel ${tab.value === 'sheet' ? 'on' : ''}`} aria-label="ワークシート" data-testid="sheet" aria-hidden={tab.value !== 'sheet'}>
      <div class="ph"><h2>ワーク<span class="em">シート</span></h2></div>
      <div class="rule"><i /><span>地球儀を見て、<b>根拠</b>をもって考える</span><s /></div>

      {FIELDS.map((f) => (
        <div class="ws neon" key={f.k} style={{ '--n': f.n }}>
          <div class="ws-h"><span class="num" style={{ '--n': f.n }}>{f.no}</span><div><div class="tt">{f.t}</div><div class="q">{f.q}</div></div></div>
          <textarea id={`ws-${f.k}`} value={w[f.k]} onInput={(e) => set(f.k, (e.target as HTMLTextAreaElement).value)} aria-label={f.t} data-testid={`ws-${f.k}`} />
          {f.k === 'fact' && <div class="ws-tools"><button class="btn" onClick={pickFacts} data-testid="pick-facts"><G.globe />地球儀から読み取る</button></div>}
          {f.k === 'reason' && <div class="starters">{STARTERS.map((s) => <button key={s} onClick={() => appendTo('reason', s)}>{s}</button>)}</div>}
          {f.k === 'next' && (
            <>
              <div class="ws-tools"><button class="btn" onClick={makeSeeds} disabled={busy} data-testid="seeds"><G.spark />{busy ? '考えています…' : '問いのたね'}</button></div>
              {seeds && (
                <div class="seeds" data-testid="seed-list">
                  {seeds.map((s) => <button key={s} onClick={() => { appendTo('next', s); setSeeds(seeds.filter((x) => x !== s)); }}>{s}</button>)}
                </div>
              )}
            </>
          )}
        </div>
      ))}

      <div class="ws neon checks" style={{ '--n': 'var(--pink)' }}>
        <div class="ws-h"><span class="num" style={{ '--n': 'var(--pink)' }}>✓</span><div class="tt">ふり返り</div></div>
        {['産地の分布の特徴を読み取れた', '資料（地球儀・海流・深さ）を根拠に理由を考えた', '次の時間につながる問いをもてた'].map((t, i) => (
          <label key={t}><input type="checkbox" checked={w.checks[i]} onChange={(e) => { const c = [...w.checks]; c[i] = (e.target as HTMLInputElement).checked; worksheet.value = { ...worksheet.value, checks: c }; }} />{t}</label>
        ))}
      </div>
      <p class="hint" style={{ textAlign: 'center' }}>シートに書いたことは、このタブレットだけに保存されます（ほかの人には見えません）</p>
    </section>
  );
}
