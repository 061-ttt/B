import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BottomSheet } from './Sheet';
import { aiOk, device, entries, focusFish, group, layers, mode, presence, room, serverOk, sheet, showToast, tab, teacherKey } from '../state';
import { addEntry, aiParse, createRoom, deleteEntry, joinRoom } from '../core/sync';
import { parseTag, suggestFish, findFish, type Method } from '../data/parse';
import { findPlace, suggestPlaces, PLACE_BY_ID, type Place } from '../data/places';

// よく使う産地（ワンタップで選べる）
const QUICK_PLACES = ['hokkaido', 'aomori', 'miyagi', 'chiba', 'shizuoka', 'nagasaki', 'kagoshima', 'norway', 'chile', 'china', 'vietnam', 'usa', 'russia'];
import { FISH, FISH_BY_ID, type Fish } from '../data/fish';
import { iconSvg } from './icons';
import { photo } from './photo';

const pic = (id: string | null | undefined, icon: Parameters<typeof iconSvg>[0], color: string, size: number) => {
  const p = photo(id, true);
  return p ? `<img class="chip-photo" src="${p}" alt="" style="width:${size}px;height:${Math.round(size * 0.68)}px">` : iconSvg(icon, color, size);
};
import { G } from './Glyph';
import { uid } from '../core/model';
import { pinsNow, globe } from './MapView';
import { DEPTH_LEGEND } from '../map/depth';
import { openFish } from './Zukan';
import { bigQr, joinUrl, qrSvg, scanning } from './Qr';

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
  const rec = useRef<SR | null>(null);
  const SRC = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;

  const fishList = useMemo(() => (fishQ && !fish ? suggestFish(fishQ, 10) : FISH.slice(0, 12)), [fishQ, fish]);
  const placeList = useMemo(() => (placeQ && !place ? suggestPlaces(placeQ, 10) : []), [placeQ, place]);

  async function runParse(text: string) {
    if (!text.trim()) return;
    const r = parseTag(text);
    let f = r.fish, p = r.place, m = r.method;
    let fishText = r.fishText;
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
    showToast(`${place.name}に「${fishName}」をのせました`);
    if (navigator.vibrate) try { navigator.vibrate([10, 40, 10]); } catch { /* */ }
    sheet.value = null;
  }

  return (
    <div>
      <h3><span class="em">魚</span>と産地を入力</h3>
      <label class="field-l" for="tag"><span class="num" style={{ '--n': 'var(--violet)' }}>01</span>値札の文字をそのまま（なくてもOK）</label>
      <div class="inp-row">
        <input id="tag" class="inp" value={tag} placeholder="例：チリ産 銀鮭 養殖" onInput={(e) => setTag((e.target as HTMLInputElement).value)}
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

      <label class="field-l"><span class="num" style={{ '--n': 'var(--amber)' }}>04</span>とり方</label>
      <div class="seg glass" style={{ display: 'flex' }}>
        <SegThumb idx={['wild', 'farmed', 'unknown'].indexOf(method)} n={3} />
        {(['wild', 'farmed', 'unknown'] as Method[]).map((m) => (
          <button key={m} style={{ flex: 1 }} aria-pressed={method === m} onClick={() => setMethod(m)}>{m === 'wild' ? '天然' : m === 'farmed' ? '養殖' : 'わからない'}</button>
        ))}
      </div>

      <label class="field-l"><span class="num" style={{ '--n': 'var(--pink)' }}>05</span>班</label>
      <div class="groups">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => <button key={g} aria-pressed={group.value === g} onClick={() => (group.value = g)}>{g}</button>)}
      </div>

      <div style={{ height: '16px' }} />
      <button class="btn primary block" disabled={!can} onClick={submit} data-testid="submit">地図にのせる</button>
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
          <p class="hint" style={{ textAlign: 'center' }}>QRコードを読み取るか、コードを入力して参加</p>
          <div class="room-acts">
            <button class="btn primary" onClick={() => (bigQr.value = { code: room.value })} data-testid="qr-big-btn"><G.qr />QRを大きく表示</button>
            <button class="btn" onClick={() => { navigator.clipboard?.writeText(url).then(() => showToast('リンクをコピーしました'), () => showToast(url)); }}>リンクをコピー</button>
            <button class="btn" onClick={() => joinRoom(null)}>この端末だけで使う</button>
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
            {busy ? 'つくっています…' : '先生：クラスをつくる（QRコードが出ます）'}
          </button>
          {serverOk.value === false && <p class="hint">サーバーにつながらないため、この端末だけで使えます。</p>}
          <div class="app-qr">
            <button class="qr small" dangerouslySetInnerHTML={{ __html: qr }} aria-label="このアプリのQRコード（タップで大きく）" onClick={() => (bigQr.value = { code: null })} />
            <p class="hint">このアプリを開くQRコード。タップで大きく表示</p>
          </div>
          <p class="hint">名前などの個人情報は集めません。クラスのデータは30日たつと自動で消えます。</p>
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
      <div class="legend-grid" style={{ marginTop: '16px' }}>
        <div class="legend-row"><span class="legend-arrows" style={{ color: 'var(--warm)' }}><i /><i /><i /></span><ruby>暖流<rt>だんりゅう</rt></ruby>　あたたかい海水の流れ</div>
        <div class="legend-row"><span class="legend-arrows" style={{ color: 'var(--cold)' }}><i /><i /><i /></span><ruby>寒流<rt>かんりゅう</rt></ruby>　つめたい海水の流れ</div>
        <div class="legend-row"><span class="legend-arrows"><i style={{ color: 'var(--warm)' }} /><i style={{ color: 'var(--cold)' }} /><i style={{ color: 'var(--warm)' }} /></span><ruby>潮目<rt>しおめ</rt></ruby>　暖流と寒流がぶつかる所</div>
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
