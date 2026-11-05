import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BottomSheet } from './Sheet';
import { aiOk, device, enhanced, entries, focusFish, group, groupChosen, layers, mode, presence, room, serverOk, sheet, showToast, tab, teacherKey } from '../state';
import { ResetButton } from './ResetButton';
import { addEntry, aiParse, createRoom, deleteEntry, joinRoom, resetData } from '../core/sync';
import { parseTag, suggestFish, findFish, type Method } from '../data/parse';
import { findPlace, suggestPlaces, PLACE_BY_ID, type Place } from '../data/places';

// よく使う産地（ワンタップで選べる）
const QUICK_PLACES = ['hokkaido', 'aomori', 'miyagi', 'chiba', 'shizuoka', 'nagasaki', 'kagoshima', 'norway', 'chile', 'china', 'vietnam', 'usa', 'russia'];
import { FISH, FISH_BY_ID, type Fish } from '../data/fish';
import { iconSvg } from './icons';
import { figure, photo } from './photo';

// 入力候補や産地の一覧のアイコン：地球儀・図鑑と同じ3Dフィギュア（なければ写真、それもなければ絵）
const pic = (id: string | null | undefined, icon: Parameters<typeof iconSvg>[0], color: string, size: number) => {
  const f = figure(id, true);
  if (f) return `<img class="chip-fig" src="${f}" alt="" style="width:${size}px;height:${Math.round(size * 0.68)}px">`;
  const p = photo(id, true);
  return p ? `<img class="chip-photo" src="${p}" alt="" style="width:${size}px;height:${Math.round(size * 0.68)}px">` : iconSvg(icon, color, size);
};
import { G } from './Glyph';
import { uid } from '../core/model';
import { pinsNow, globe } from './MapView';
import { DEPTH_LEGEND } from '../map/depth';
import { openFish } from './Zukan';
import { APP_URL, STANDALONE, bigQr, joinUrl, qrSvg, scanning } from './Qr';

export function Sheets() {
  const s = sheet.value;
  const last = useRef(s);
  if (s) last.current = s;
  const shown = s ?? last.current;
  const close = () => (sheet.value = null);
  return (
    <>
      <BottomSheet open={s === 'add'} onClose={close} label="魚と産地を入力" testid="add-sheet">{shown === 'add' && <AddForm />}</BottomSheet>
      <BottomSheet open={s === 'room'} onClose={close} label="クラス" testid="room-sheet">{shown === 'room' && <RoomForm />}</BottomSheet>
      <BottomSheet open={s === 'legend'} onClose={close} label="表示と凡例" testid="legend-sheet">{shown === 'legend' && <Legend />}</BottomSheet>
      <BottomSheet open={!!s && typeof s === 'object'} onClose={close} label="産地" testid="pin-sheet">{shown && typeof shown === 'object' && <PinDetail k={shown.pin} />}</BottomSheet>
    </>
  );
}

type SR = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };

function AddForm() {
  const [tag, setTag] = useState('');
  const [fishQ, setFishQ] = useState('');
  const [fish, setFish] = useState<Fish | null>(null);
  const [placeQ, setPlaceQ] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [method, setMethod] = useState<Method>('unknown');
  const [note, setNote] = useState<{ ok: string[]; miss: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const rec = useRef<SR | null>(null);
  const live = useRef(0);
  const fx = enhanced.value;
  const SRC = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;

  const fishList = useMemo(() => (fishQ && !fish ? suggestFish(fishQ, 10) : FISH.slice(0, 12)), [fishQ, fish]);
  const placeList = useMemo(() => (placeQ && !place ? suggestPlaces(placeQ, 10) : []), [placeQ, place]);

  async function runParse(text: string, rulesOnly = false) {
    if (!text.trim()) return;
    const r = parseTag(text);
    let f = r.fish, p = r.place, m = r.method;
    let fishText = r.fishText;
    // 打っている途中の読み取り（改良版）は、見つかったものだけ入れる。まちがいの表示はボタンを押したときだけ
    if (rulesOnly) {
      if (f) { setFish(f); setFishQ(f.name); }
      if (p) { setPlace(p); setPlaceQ(p.name); }
      if (m !== 'unknown') setMethod(m);
      if (f || p) setNote({ ok: [f && `魚：${f.name}`, p && `産地：${p.name}`, m !== 'unknown' && (m === 'farmed' ? '養殖' : '天然')].filter(Boolean) as string[], miss: [] });
      return;
    }
    if ((!f || !p) && aiOk.value) {
      setBusy(true);
      const a = await aiParse(text);
      setBusy(false);
      if (a) {
        if (!f && a.fish) { f = findFish(a.fish); fishText = fishText || a.fish; }
        if (!p && a.place) p = findPlace(a.place);
        if (m === 'unknown' && (a.method === 'farmed' || a.method === 'wild')) m = a.method;
      }
    }
    if (f) { setFish(f); setFishQ(f.name); } else if (fishText) { setFish(null); setFishQ(fishText); }
    if (p) { setPlace(p); setPlaceQ(p.name); }
    if (m !== 'unknown') setMethod(m);
    const ok: string[] = [], miss: string[] = [];
    (f || fishText) ? ok.push(`魚：${f?.name ?? fishText}`) : miss.push('魚が分かりませんでした');
    p ? ok.push(`産地：${p.name}`) : miss.push('産地が分かりませんでした');
    if (m !== 'unknown') ok.push(m === 'farmed' ? '養殖' : '天然');
    setNote({ ok, miss });
  }

  function listen() {
    if (!SRC) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new SRC();
    r.lang = 'ja-JP';
    r.interimResults = false;
    r.onresult = (e) => { const t = e.results[0][0].transcript; setTag(t); runParse(t); };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }

  const fishName = fish?.name ?? fishQ.trim();
  const can = !!fishName && !!place;

  function submit() {
    if (!can || !place) return;
    addEntry({ id: uid('e'), fishId: fish?.id ?? null, fishName, placeId: place.id, method, group: group.value, at: Date.now(), device });
    // 改良版は、地球儀の上に大きな文字で知らせる（Arrival）
    if (!enhanced.peek()) showToast(`${place.name}に「${fishName}」をのせました`);
    if (navigator.vibrate) try { navigator.vibrate([10, 40, 10]); } catch { /* */ }
    sheet.value = null;
  }

  return (
    <div class="add-form">
      <div class="af-a">
      <h3><span class="em">魚</span>と産地を入力</h3>
      <label class="field-l" for="tag"><span class="num" style={{ '--n': 'var(--violet)' }}>01</span>値札の文字をそのまま（なくてもOK）</label>
      <div class="inp-row">
        <input id="tag" class="inp" value={tag} placeholder="例：チリ産 銀鮭 養殖" onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          setTag(v);
          if (fx) { clearTimeout(live.current); live.current = window.setTimeout(() => runParse(v, true), 380); }
        }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) runParse(tag); }} data-testid="tag-input" />
        {SRC && <button class={`btn mic ${listening ? 'on' : ''}`} aria-label="声で入力" onClick={listen} style={{ width: '48px', padding: 0, height: '48px', borderRadius: '16px' }}><G.mic /></button>}
        <button class="btn" onClick={() => runParse(tag)} disabled={!tag.trim() || busy} style={{ height: '48px', borderRadius: '16px' }} data-testid="parse">{busy ? '…' : '読み取る'}</button>
      </div>
      {note && (
        <div class="parse-out" data-testid="parse-out">
          {note.ok.map((t) => <span key={t}>{t}</span>)}
          {note.miss.map((t) => <span key={t} class="miss">{t}</span>)}
        </div>
      )}

      <label class="field-l" for="fishq"><span class="num" style={{ '--n': 'var(--blue)' }}>02</span>魚の種類</label>
      <input id="fishq" class="inp" value={fishQ} placeholder="さけ、さば、えび…" onInput={(e) => { setFishQ((e.target as HTMLInputElement).value); setFish(null); }} data-testid="fish-input" autocomplete="off" />
      <div class="sugg" role="listbox" aria-label="魚の候補">
        {fishList.map((f) => (
          <button key={f.id} role="option" aria-selected={fish?.id === f.id} class={fish?.id === f.id ? 'sel' : ''} onClick={() => { setFish(f); setFishQ(f.name); }}
            dangerouslySetInnerHTML={{ __html: `${pic(f.id, f.icon, f.color, 30)}${f.name}` }} />
        ))}
      </div>

      <label class="field-l" for="placeq"><span class="num" style={{ '--n': 'var(--green)' }}>03</span>産地</label>
      <input id="placeq" class="inp" value={placeQ} placeholder="北海道、銚子、ノルウェー、太平洋…" onInput={(e) => { const v = (e.target as HTMLInputElement).value; setPlaceQ(v); setPlace(null); }}
        onBlur={() => { if (!place && placeQ) { const p = findPlace(placeQ); if (p) { setPlace(p); setPlaceQ(p.name); } } }} data-testid="place-input" autocomplete="off" />
      {!placeQ && (
        <div class="sugg places" role="listbox" aria-label="よく使う産地">
          {QUICK_PLACES.map((id) => PLACE_BY_ID.get(id)!).map((p) => (
            <button key={p.id} role="option" aria-selected={false} onClick={() => { setPlace(p); setPlaceQ(p.name); }}>{p.name}<span class="kd">{p.domestic ? '国内' : '外国'}</span></button>
          ))}
        </div>
      )}
      {placeList.length > 0 && (
        <div class="sugg" role="listbox" aria-label="産地の候補">
          {placeList.map((p) => (
            <button key={p.id} role="option" aria-selected={false} onClick={() => { setPlace(p); setPlaceQ(p.name); }}>
              {p.name}<span class="kd">{p.kind === 'country' ? '外国' : p.kind === 'sea' ? (p.domestic ? '日本の近くの海' : '遠くの海') : '国内'}</span>
            </button>
          ))}
        </div>
      )}
      {placeQ && !place && placeList.length === 0 && <p class="hint">見つからないときは、県の名前や国の名前で入れてみよう。</p>}
      {place && <p class="hint ok-line" data-testid="place-ok">✓ {place.name}（{place.kind === 'country' ? '外国' : place.domestic ? '国内' : '遠くの海'}）</p>}

      </div>
      <div class="af-b">
      <label class="field-l"><span class="num" style={{ '--n': 'var(--amber)' }}>04</span>とり方</label>
      <div class="seg glass" style={{ display: 'flex' }}>
        <SegThumb idx={['wild', 'farmed', 'unknown'].indexOf(method)} n={3} />
        {(['wild', 'farmed', 'unknown'] as Method[]).map((m) => (
          <button key={m} style={{ flex: 1 }} aria-pressed={method === m} onClick={() => setMethod(m)}>{m === 'wild' ? '天然' : m === 'farmed' ? '養殖' : 'わからない'}</button>
        ))}
      </div>

      {fx && groupChosen.value && !groupOpen ? (
        <div class="group-line" data-testid="group-line">
          <span class="num" style={{ '--n': 'var(--pink)' }}>05</span>班：<b>{group.value}班</b>
          <button class="btn" onClick={() => setGroupOpen(true)}>かえる</button>
        </div>
      ) : (
        <>
          <label class="field-l"><span class="num" style={{ '--n': 'var(--pink)' }}>05</span>班</label>
          <div class="groups">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => <button key={g} aria-pressed={group.value === g} onClick={() => { group.value = g; groupChosen.value = true; setGroupOpen(false); }}>{g}</button>)}
          </div>
        </>
      )}

      <div style={{ height: '16px' }} />
      {fx
        ? <ThrowCard can={can} fish={fish} fishName={fishName} place={place} onThrow={submit} />
        : <button class="btn primary block" disabled={!can} onClick={submit} data-testid="submit">地図にのせる</button>}
      </div>
    </div>
  );
}

/** 改良版の「のせる」：カードを上へはじくと地球儀へ飛んでいく（タップでもよい） */
function ThrowCard({ can, fish, fishName, place, onThrow }: { can: boolean; fish: Fish | null; fishName: string; place: Place | null; onThrow: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef<{ y: number; t: number; dy: number; drag: boolean; id: number } | null>(null);
  const [gone, setGone] = useState(false);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fly = () => {
    if (!can || gone) return;
    setGone(true);
    if (navigator.vibrate) try { navigator.vibrate(12); } catch { /* */ }
    setTimeout(onThrow, reduced ? 0 : 340);
  };
  const reset = () => { ref.current?.classList.remove('dragging'); ref.current?.style.setProperty('--dy', '0px'); st.current = null; };
  const down = (e: PointerEvent) => { if (can && !gone) st.current = { y: e.clientY, t: performance.now(), dy: 0, drag: false, id: e.pointerId }; };
  const move = (e: PointerEvent) => {
    const s = st.current, el = ref.current;
    if (!s || !el) return;
    const raw = e.clientY - s.y;
    s.dy = raw < 0 ? raw : raw * 0.2;   // 下へはあまり動かない
    if (!s.drag && raw < -8) { s.drag = true; s.t = performance.now(); s.y = e.clientY; s.dy = 0; try { el.setPointerCapture(s.id); } catch { /* */ } el.classList.add('dragging'); }
    if (s.drag) el.style.setProperty('--dy', `${s.dy}px`);
  };
  const up = () => {
    const s = st.current;
    if (!s) return;
    if (!s.drag) { st.current = null; return; }
    const v = s.dy / Math.max(1, performance.now() - s.t);   // px/ms（上がマイナス）
    ref.current?.classList.remove('dragging');
    if (s.dy < -70 || v < -0.55) { st.current = null; fly(); } else reset();
  };
  const fig = figure(fish?.id, true);
  return (
    <div ref={ref} class={`throw ${can ? 'ready' : ''} ${gone ? 'gone' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={reset} data-testid="throw">
      <div class="throw-card" aria-hidden="true">
        <span class="throw-fig">{fig ? <img src={fig} alt="" /> : <span dangerouslySetInnerHTML={{ __html: iconSvg(fish?.icon ?? 'fish', fish?.color ?? '#9fd3ff', 44) }} />}</span>
        <span class="throw-t"><b>{fishName || '魚'}</b>を<br /><b class="pl">{place?.name ?? '？'}</b>へ</span>
        <span class="throw-up"><G.chev /></span>
      </div>
      <p class="throw-hint">{can ? '上にはじいて、地球儀にのせよう（タップでもOK）' : '魚と産地がきまると、のせられます'}</p>
      <button class="btn primary block" disabled={!can || gone} onClick={fly} data-testid="submit">地図にのせる</button>
    </div>
  );
}

export function SegThumb({ idx, n }: { idx: number; n: number }) {
  return <span class="thumb" style={{ left: `calc(4px + (100% - 8px) * ${idx} / ${n})`, width: `calc((100% - 8px) / ${n})` }} />;
}

function PinDetail({ k }: { k: string }) {
  const tapped = pinsNow.value.find((p) => p.key === k);
  const placeKey = tapped?.placeKey ?? k.split('|')[0];
  const same = pinsNow.value.filter((p) => p.placeKey === placeKey);
  if (!same.length) return <p class="empty">データがありません</p>;
  const total = same.reduce((n, p) => n + p.count, 0);
  const place = PLACE_BY_ID.get(placeKey);
  const all = same.flatMap((p) => p.entries);
  const canDel = (e: { device: string }) => e.device === device || !!teacherKey.value;
  return (
    <div>
      <h3>{same[0].name} <span class="sub">{same.length}種類・{total}件</span></h3>
      {place && <p class="hint" style={{ marginTop: '-6px', marginBottom: '10px' }}>{place.kind === 'country' ? '外国' : place.kind === 'sea' ? (place.domestic ? '日本の近くの海' : '遠くの海（遠洋）') : '国内'}</p>}
      {placeKey === 'japan' && <p class="hint" style={{ marginTop: '-6px', marginBottom: '10px' }}>近づくと都道府県や港ごとに分かれます</p>}
      <div class="pin-list">
        {same.map((p) => {
          const f = p.fish[0];
          const d = f.id ? FISH_BY_ID.get(f.id) : undefined;
          return (
            <div class={`pin-item ${p.key === k ? 'on' : ''}`} key={p.key} data-pin-item={p.fishKey}>
              <span dangerouslySetInnerHTML={{ __html: pic(f.id, d?.icon ?? 'fish', d?.color ?? '#9fd3ff', 44) }} />
              <span class="nm">{f.name}</span>
              <span class="ct">{p.count}</span>
              {d && <button class="btn" style={{ height: '30px', padding: '0 10px', fontSize: '12px' }} onClick={() => { sheet.value = null; openFish(d.id); }}>図鑑</button>}
            </div>
          );
        })}
      </div>
      {placeKey === 'japan' && <button class="btn block" style={{ marginTop: '12px' }} onClick={() => { sheet.value = null; globe?.flyJapan(); }}>日本に近づいて見る</button>}
      <details style={{ marginTop: '14px' }}>
        <summary class="sub" style={{ cursor: 'pointer' }}>入力の一覧</summary>
        <div class="pin-list" style={{ marginTop: '8px' }}>
          {all.map((e) => (
            <div class="pin-item" key={e.id}>
              <span class="nm" style={{ fontWeight: 600 }}>{e.fishName}<span class="sub">　{e.group}班・{e.method === 'farmed' ? '養殖' : e.method === 'wild' ? '天然' : '―'}</span></span>
              {canDel(e) && <button class="del" onClick={() => deleteEntry(e)}>けす</button>}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function RoomForm() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const url = joinUrl(room.value);
  const qr = useMemo(() => qrSvg(url), [url]);
  const st = mode.value;
  return (
    <div>
      <h3><span class="em">クラス</span>で集める</h3>
      {room.value ? (
        <>
          <div class="code" data-testid="room-code">{room.value}</div>
          <p class="hint" style={{ textAlign: 'center' }}>
            <span class={`status-dot ${st}`} style={{ display: 'inline-block', marginRight: '6px' }} />
            {st === 'live' ? `つながっています（${presence.value}台）` : st === 'connecting' ? 'つないでいます…' : 'オフライン：この端末に保存し、つながったら送ります'}
          </p>
          <button class="qr" dangerouslySetInnerHTML={{ __html: qr }} aria-label="参加用のQRコード（タップで大きく）" onClick={() => (bigQr.value = { code: room.value })} data-testid="room-qr" />
          <p class="hint" style={{ textAlign: 'center' }}>このQRコードを読み取った人は、全員がこのクラスに入ります（コードの入力でも参加できます）</p>
          <div class="room-acts">
            <button class="btn primary" onClick={() => (bigQr.value = { code: room.value })} data-testid="qr-big-btn"><G.qr />QRを大きく表示</button>
            <button class="btn" onClick={() => { navigator.clipboard?.writeText(url).then(() => showToast('リンクをコピーしました'), () => showToast(url)); }}>リンクをコピー</button>
            <button class="btn" onClick={() => joinRoom(null)}>この端末だけで使う</button>
          </div>
          <div class="reset-box">
            {teacherKey.value ? (
              <ResetButton testid="reset-class" label="クラスのデータをリセット"
                warn={`地球儀に集まった${entries.value.length}件の魚が、クラス全員の画面から消えます。元にはもどせません。（ワークシートは消えません）`}
                onReset={async () => { const ok = await resetData(); if (ok) showToast('クラスのデータをリセットしました'); return ok; }} />
            ) : null}
            <p class="hint" style={{ textAlign: 'center' }}>{teacherKey.value ? 'データは、ここでリセットするまで残ります。' : 'データは、先生がリセットするまで残ります。'}</p>
          </div>
        </>
      ) : (
        <>
          <p class="sub" style={{ margin: '0 4px 8px' }}>いまは、この端末だけに保存しています。</p>
          <button class="btn primary block" onClick={() => { sheet.value = null; scanning.value = true; }} data-testid="scan-btn"><G.qr />QRコードを読み取って参加</button>
          <label class="field-l" for="code"><span class="num" style={{ '--n': 'var(--cyan)' }}>01</span>またはクラスコードを入力</label>
          <div class="inp-row">
            <input id="code" class="inp" value={code} maxLength={6} placeholder="6文字" style={{ textTransform: 'uppercase', letterSpacing: '.2em', fontWeight: 800 }}
              onInput={(e) => setCode((e.target as HTMLInputElement).value.replace(/[^0-9a-z]/gi, '').toUpperCase())} data-testid="code-input" />
            <button class="btn primary" style={{ height: '50px', borderRadius: '16px' }} disabled={code.length !== 6 || serverOk.value === false} onClick={() => joinRoom(code)} data-testid="join">参加</button>
          </div>
          <div style={{ height: '16px' }} />
          <button class="btn block" disabled={busy || serverOk.value === false} onClick={async () => { setBusy(true); const c = await createRoom(); setBusy(false); if (c) bigQr.value = { code: c }; }} data-testid="create-room">
            {busy ? 'つくっています…' : '先生：クラスをつくってQRコードを出す'}
          </button>
          {!STANDALONE && <p class="hint" style={{ textAlign: 'center' }}>出てきたQRコードを読み取った人は、全員が同じクラスに入ります</p>}
          {STANDALONE ? (
            <p class="hint" data-testid="go-app">この画面はお試し用の版で、データはこの端末だけに保存されます。クラスで共有するときは、先生が{APP_URL ? <a href={APP_URL} target="_blank" rel="noopener" style={{ color: 'var(--cyan)', fontWeight: 800 }}>本番のアプリ</a> : '本番のアプリ'}を開いて「クラスをつくってQRコードを出す」を押し、そのQRコードをみんなで読み取ってください。</p>
          ) : serverOk.value === false && <p class="hint">サーバーにつながらないため、この端末だけで使えます。</p>}
          <p class="hint">名前などの個人情報は集めません。データは、リセットするまで残ります。</p>
          <div class="reset-box">
            <ResetButton testid="reset-local" label="この端末のデータをリセット"
              warn={`この端末に保存している${entries.value.length}件の魚が消えます。元にはもどせません。（ワークシートは消えません）`}
              onReset={async () => { await resetData(); showToast('この端末のデータをリセットしました'); return true; }} />
          </div>
        </>
      )}
    </div>
  );
}

function Legend() {
  const l = layers.value;
  const set = (k: keyof typeof l) => (layers.value = { ...l, [k]: !l[k] });
  return (
    <div>
      <h3>表示と<span class="em">凡例</span></h3>
      {([['currents', '海流'], ['depth', '海の深さ'], ['labels', '海や海流の名前']] as const).map(([k, t]) => (
        <div class="toggle-row" key={k}>
          <span>{t}</span>
          <button class="switch" role="switch" aria-checked={l[k]} aria-label={t} onClick={() => set(k)} data-testid={`layer-${k}`} />
        </div>
      ))}
      <div class="toggle-row fx-toggle">
        <span>新しい演出<small>天秤・着地の文字・海流の強調・はじいて入力。オフで元の画面にもどる</small></span>
        <button class="switch" role="switch" aria-checked={enhanced.value} aria-label="新しい演出" onClick={() => (enhanced.value = !enhanced.value)} data-testid="fx-toggle" />
      </div>
      <div class="legend-grid" style={{ marginTop: '16px' }}>
        <div class="legend-row"><span class="legend-arrows" style={{ color: 'var(--warm)' }}><i /><i /><i /></span><ruby>暖流<rt>だんりゅう</rt></ruby>　あたたかい海水の流れ</div>
        <div class="legend-row"><span class="legend-arrows" style={{ color: 'var(--cold)' }}><i /><i /><i /></span><ruby>寒流<rt>かんりゅう</rt></ruby>　つめたい海水の流れ</div>
        <div class="legend-row"><span class="legend-arrows"><i style={{ color: 'var(--warm)' }} /><i style={{ color: 'var(--cold)' }} /><i style={{ color: 'var(--warm)' }} /></span><ruby>潮目<rt>しおめ</rt></ruby>　暖流と寒流がぶつかる所</div>
        <div class="legend-row"><span class="legend-ground"><span class="ground-label"><i />三陸沖</span></span><span>主な<ruby>漁場<rt>ぎょじょう</rt></ruby><small style={{ display: 'block', fontSize: '11px', color: 'var(--sub)' }}>日本を見ているときに出ます</small></span></div>
        <div style={{ height: '6px' }} />
        <div class="legend-depth" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', fontSize: '11px', color: 'var(--sub)' }}>
          {DEPTH_LEGEND.map((d) => <div key={d.label}><b style={{ color: '#fff' }}>{d.ruby ? <ruby>{d.label}<rt>{d.ruby}</rt></ruby> : d.label}</b><br />{d.range}</div>)}
        </div>
        <p class="hint">ピンは入力が多い産地ほど大きくなります。地球儀を引いて見ると、国内の産地は「日本」にまとまります。海流と深さは、地図帳などをもとにした目安の図です。</p>
      </div>
    </div>
  );
}

export function useEntriesCount() { return entries.value.length; }
export { focusFish, tab };
