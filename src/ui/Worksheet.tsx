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

export function Worksheet() {
  const w = worksheet.value;
  const [seeds, setSeeds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: 'fact' | 'reason' | 'next', v: string) => (worksheet.value = { ...worksheet.value, [k]: v });

  function pickFacts() {
    const lines = factLines(stats(entries.value));
    if (!lines.length) { showToast('まだ地図にデータがありません'); return; }
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
    <section class={`panel ${tab.value === 'sheet' ? 'on print-me' : ''}`} aria-label="ワークシート" data-testid="sheet" aria-hidden={tab.value !== 'sheet'}>
      <h2>ワークシート</h2>

      <div class="ws glass">
        <div class="ws-h"><span class="no" style={{ background: '#4da3ff' }}>1</span><div><div class="tt">事実</div><div class="q">どこに多かった？（国内／外国、海側、天然・養殖）</div></div></div>
        <textarea value={w.fact} onInput={(e) => set('fact', (e.target as HTMLTextAreaElement).value)} aria-label="事実" data-testid="ws-fact" />
        <div class="ws-tools"><button class="btn" onClick={pickFacts} data-testid="pick-facts"><G.map />地図から読み取る</button></div>
      </div>

      <div class="ws glass">
        <div class="ws-h"><span class="no" style={{ background: '#3ddc97' }}>2</span><div><div class="tt">理由の予想</div><div class="q">なぜそこに集まると思う？</div></div></div>
        <textarea value={w.reason} onInput={(e) => set('reason', (e.target as HTMLTextAreaElement).value)} aria-label="理由の予想" data-testid="ws-reason" />
        <div class="starters">{STARTERS.map((s) => <button key={s} onClick={() => appendTo('reason', s)}>{s}</button>)}</div>
      </div>

      <div class="ws glass">
        <div class="ws-h"><span class="no" style={{ background: '#ffc24d' }}>3</span><div><div class="tt">次に調べたいこと</div><div class="q">もっと知りたい「なぜ？」「どうやって？」</div></div></div>
        <textarea value={w.next} onInput={(e) => set('next', (e.target as HTMLTextAreaElement).value)} aria-label="次に調べたいこと" data-testid="ws-next" />
        <div class="ws-tools"><button class="btn" onClick={makeSeeds} disabled={busy} data-testid="seeds"><G.spark />{busy ? '考えています…' : '問いのたね'}</button></div>
        {seeds && (
          <div class="seeds" data-testid="seed-list">
            {seeds.map((s) => <button key={s} onClick={() => { appendTo('next', s); setSeeds(seeds.filter((x) => x !== s)); }}>{s}</button>)}
          </div>
        )}
      </div>

      <div class="ws glass checks">
        <div class="ws-h"><div class="tt">ふり返り</div></div>
        {['産地の分布の特徴を読み取れた', '資料（地図・海流・深さ）を根拠に理由を考えた', '次の時間につながる問いをもてた'].map((t, i) => (
          <label key={t}><input type="checkbox" checked={w.checks[i]} onChange={(e) => { const c = [...w.checks]; c[i] = (e.target as HTMLInputElement).checked; worksheet.value = { ...worksheet.value, checks: c }; }} />{t}</label>
        ))}
      </div>
      <button class="btn block no-print" onClick={() => print()}><G.printer />印刷</button>
    </section>
  );
}
