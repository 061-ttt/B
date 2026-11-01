import { useRef, useState } from 'preact/hooks';
import { appendTo, cards, deleteCard, editCard, moveCard, showToast, STATUS, STATUS_LABEL, tab, type Card, type CardStatus } from '../state';
import { G } from './Glyph';

const COLOR: Record<CardStatus, string> = { memo: '#ffc24d', todo: '#4da3ff', doing: '#b388ff', done: '#3ddc97' };

export function Tasks() {
  const list = cards.value;
  return (
    <section class={`panel ${tab.value === 'tasks' ? 'on' : ''}`} aria-label="メモとタスク" data-testid="tasks" aria-hidden={tab.value !== 'tasks'}>
      <h2>メモとタスク</h2>
      <div class="flick-hint" aria-hidden="true"><span>← もどす</span><span>すすめる →</span></div>
      {STATUS.map((s) => {
        const cs = list.filter((c) => c.status === s).sort((a, b) => b.updatedAt - a.updatedAt);
        return (
          <div class="lane" key={s} data-lane={s}>
            <div class="lane-h"><i style={{ background: COLOR[s] }} />{STATUS_LABEL[s]}<span class="n">{cs.length}</span></div>
            {cs.map((c) => <FlickCard key={`${c.id}:${c.status}`} c={c} />)}
            {!cs.length && <p class="empty" style={{ padding: '6px 0 4px', textAlign: 'left', marginLeft: '6px' }}>{s === 'memo' ? '上のメモ欄に書くと、ここに入ります' : '―'}</p>}
          </div>
        );
      })}
    </section>
  );
}

function FlickCard({ c }: { c: Card }) {
  const el = useRef<HTMLDivElement>(null);
  const under = useRef<HTMLDivElement>(null);
  const st = useRef<{ x: number; y: number; t: number; dx: number; lock: 'h' | 'v' | null; id: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const i = STATUS.indexOf(c.status);
  const next = STATUS[i + 1];
  const prev = i > 0 ? STATUS[i - 1] : null;

  function commit(dir: 1 | -1) {
    const node = el.current;
    if (dir === 1 && !next) { bounce(); return; }
    const w = node?.offsetWidth ?? 300;
    if (node) { node.classList.remove('dragging'); node.style.transform = `translateX(${dir * (w + 40)}px) rotate(${dir * 4}deg)`; node.style.opacity = '0'; }
    if (navigator.vibrate) try { navigator.vibrate(12); } catch { /* */ }
    setTimeout(() => {
      const r = moveCard(c.id, dir);
      if (r && r !== 'deleted') showToast(`「${STATUS_LABEL[r]}」へ`);
    }, 180);
  }
  function bounce() {
    const n = el.current;
    if (!n) return;
    n.style.transform = 'translateX(0)';
    n.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(16px)' }, { transform: 'translateX(0)' }], { duration: 320, easing: 'cubic-bezier(.3,1.5,.5,1)' });
  }

  const down = (e: PointerEvent) => {
    if (editing || (e.target as HTMLElement).closest('button,textarea')) return;
    st.current = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, lock: null, id: e.pointerId };
  };
  const move = (e: PointerEvent) => {
    const s = st.current;
    if (!s || !el.current || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.lock) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.lock = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (s.lock === 'h') { el.current.setPointerCapture(e.pointerId); el.current.classList.add('dragging'); }
    }
    if (s.lock !== 'h') return;
    e.preventDefault();
    // 進めない方向はゴムのように重く
    const limited = (dx > 0 && !next) ? dx * 0.25 : dx;
    s.dx = limited;
    el.current.style.transform = `translateX(${limited}px) rotate(${limited / 60}deg)`;
    const u = under.current!;
    const w = el.current.offsetWidth;
    u.style.opacity = String(Math.min(1, Math.abs(limited) / 50));
    u.style.background = limited > 0 ? `linear-gradient(90deg, ${COLOR[next ?? c.status]}55, transparent)` : `linear-gradient(270deg, ${prev ? COLOR[prev] + '55' : 'rgba(255,74,74,.4)'}, transparent)`;
    u.classList.toggle('go-r', limited > w * 0.28);
    u.classList.toggle('go-l', limited < -w * 0.28);
  };
  const up = (e: PointerEvent) => {
    const s = st.current;
    st.current = null;
    if (!s || !el.current || s.lock !== 'h') return;
    const w = el.current.offsetWidth;
    const v = s.dx / Math.max(1, performance.now() - s.t);
    under.current!.style.opacity = '0';
    under.current!.classList.remove('go-r', 'go-l');
    if (s.dx > w * 0.28 || (v > 0.6 && s.dx > 40)) commit(1);
    else if (s.dx < -w * 0.28 || (v < -0.6 && s.dx < -40)) commit(-1);
    else { el.current.classList.remove('dragging'); el.current.style.transform = ''; }
    void e;
  };

  return (
    <div class="card-wrap" data-card={c.id}>
      <div class="card-under" ref={under} aria-hidden="true">
        <span class="l"><G.left />{prev ? STATUS_LABEL[prev] : 'けす'}</span>
        <span class="r">{next ? STATUS_LABEL[next] : 'できた！'}<G.right /></span>
      </div>
      <div ref={el} class={`card glass card-enter ${c.status === 'done' ? 'done' : ''}`} data-status={c.status}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <i class="st" style={{ background: COLOR[c.status] }} />
        {editing ? (
          <div style={{ flex: 1 }}>
            <textarea class="card-edit" rows={2} value={c.text} ref={(t) => t?.focus()} onBlur={(e) => { const v = (e.target as HTMLTextAreaElement).value.trim(); if (v) editCard(c.id, v); setTimeout(() => setEditing(false), 150); }} />
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
              {([['fact', '①事実へ'], ['reason', '②予想へ'], ['next', '③調べたいへ']] as const).map(([k, t]) => (
                <button key={k} class="btn" style={{ height: '30px', padding: '0 10px', fontSize: '12px' }} onMouseDown={(e) => e.preventDefault()} onClick={() => { appendTo(k, c.text); showToast(`ワークシートの${t.replace('へ', '')}に入れました`); setEditing(false); }}>{t}</button>
              ))}
              <button class="btn" style={{ height: '30px', padding: '0 10px', fontSize: '12px', color: '#ffb3b3' }} onMouseDown={(e) => e.preventDefault()} onClick={() => deleteCard(c.id)}>けす</button>
            </div>
          </div>
        ) : (
          <span class="tx" onClick={() => setEditing(true)}>{c.text}</span>
        )}
        {!editing && (
          <>
            <button class="mv" aria-label={prev ? `「${STATUS_LABEL[prev]}」へもどす` : 'けす'} onClick={() => commit(-1)}><G.left /></button>
            <button class="mv" aria-label={next ? `「${STATUS_LABEL[next]}」へすすめる` : 'できた'} onClick={() => commit(1)} disabled={!next} style={!next ? { opacity: 0.3 } : undefined}><G.right /></button>
          </>
        )}
      </div>
    </div>
  );
}
