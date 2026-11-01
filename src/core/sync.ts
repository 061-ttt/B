// クラスのデータをCloudflare（Durable Object）とリアルタイムにそろえる。
// サーバーに届かないときは端末内に保存し、つながったら送り直す。
import type { Entry } from './model';
import { aiOk, device, entries, mode, pending, presence, reloadEntries, removeEntry, room, serverOk, showToast, teacherKey, upsertEntry, lastAdded } from '../state';

// 他の人の入力では地球儀を動かさない（60人分あちこちに飛ばないように）。自分の入力のときだけ飛ぶ

const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
let ws: WebSocket | null = null;
let retry = 0;
let retryTimer = 0;

async function j<T>(path: string, init?: RequestInit, timeout = 6000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(API + path, { ...init, signal: ctl.signal, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
    if (!r.ok) throw new Error(`${r.status}`);
    return (await r.json()) as T;
  } finally { clearTimeout(t); }
}

export async function checkServer(): Promise<boolean> {
  if (location.protocol === 'file:' || (import.meta.env.VITE_STANDALONE as string | undefined) === '1') { serverOk.value = false; return false; }
  try {
    const h = await j<{ ok: boolean; ai: boolean }>('/api/health', undefined, 3500);
    serverOk.value = !!h.ok;
    aiOk.value = !!h.ai;
  } catch { serverOk.value = false; aiOk.value = false; }
  return !!serverOk.value;
}

export async function createRoom(): Promise<string | null> {
  try {
    const r = await j<{ code: string; teacherKey: string }>('/api/rooms', { method: 'POST', body: '{}' });
    teacherKey.value = r.teacherKey;
    await joinRoom(r.code);
    return r.code;
  } catch {
    showToast('クラスをつくれませんでした。ネットワークを確かめてください');
    return null;
  }
}

export async function joinRoom(code: string | null) {
  const c = code ? code.trim().toUpperCase() : null;
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  clearTimeout(retryTimer);
  room.value = c;
  reloadEntries();
  const u = new URL(location.href);
  if (c) u.searchParams.set('room', c); else u.searchParams.delete('room');
  history.replaceState(null, '', u);
  if (!c) { mode.value = 'local'; presence.value = 0; return; }
  mode.value = 'connecting';
  await connect();
}

async function connect() {
  const c = room.value;
  if (!c) return;
  if (serverOk.value === null) await checkServer();
  if (!serverOk.value) { mode.value = 'offline'; schedule(); return; }
  try {
    const r = await j<{ entries: Entry[] }>(`/api/rooms/${c}`);
    if (room.value !== c) return;
    // サーバーの内容＋まだ送れていないもの
    const mine = pending.value.filter((p) => !r.entries.some((e) => e.id === p.id));
    entries.value = [...r.entries, ...mine];
    await flush();
    openSocket(c);
  } catch (e) {
    if (String((e as Error).message) === '404') {
      showToast('そのクラスコードは見つかりません');
      joinRoom(null);
      return;
    }
    mode.value = 'offline';
    schedule();
  }
}

function schedule() {
  clearTimeout(retryTimer);
  retry = Math.min(retry + 1, 6);
  retryTimer = window.setTimeout(() => { serverOk.value = null; connect(); }, 1000 * 2 ** retry);
}

// 受け取った入力は30ミリ秒ごとにまとめて画面に反映する（60人が同時に送っても描き直しは少なく）
let inbox: Entry[] = [];
let inboxDel: string[] = [];
let inboxTimer = 0;
function scheduleInbox() {
  if (inboxTimer) return;
  inboxTimer = window.setTimeout(() => {
    inboxTimer = 0;
    const add = inbox, del = new Set(inboxDel);
    inbox = []; inboxDel = [];
    const have = new Set(entries.peek().map((e) => e.id));
    const fresh = add.filter((e) => !have.has(e.id) && !del.has(e.id));
    if (!fresh.length && !del.size) return;
    entries.value = [...entries.peek().filter((e) => !del.has(e.id)), ...fresh];
    // 自分の入力の確認が来たら送信待ちから外す
    if (pending.peek().length) {
      const ids = new Set(add.map((e) => e.id));
      pending.value = pending.peek().filter((p) => !ids.has(p.id));
    }
  }, 30);
}

function openSocket(code: string) {
  const base = API ? new URL(API) : new URL(location.href);
  const proto = base.protocol === 'https:' ? 'wss:' : 'ws:';
  const s = new WebSocket(`${proto}//${base.host}/api/rooms/${code}/ws`);
  ws = s;
  s.onopen = () => { mode.value = 'live'; retry = 0; flushWs(); };
  s.onmessage = (ev) => {
    if (ev.data === 'pong') return;
    let m: { type: string; entry?: Entry; id?: string; entries?: Entry[]; n?: number; error?: string };
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'add' && m.entry) { inbox.push(m.entry); scheduleInbox(); }
    else if (m.type === 'adds' && m.entries) { inbox.push(...m.entries); scheduleInbox(); }
    else if (m.type === 'del' && m.id) { inboxDel.push(m.id); scheduleInbox(); }
    else if (m.type === 'ack' && m.id) { pending.value = pending.peek().filter((p) => p.id !== m.id); }
    else if (m.type === 'nack' && m.id) {
      pending.value = pending.peek().filter((p) => p.id !== m.id);
      if (m.error === 'too many') showToast('入力が多すぎます。少し待ってからもう一度');
      else if (m.error === 'full') showToast('このクラスはいっぱいです');
    }
    else if (m.type === 'snapshot' && m.entries) {
      const mine = pending.peek().filter((p) => !m.entries!.some((e) => e.id === p.id));
      entries.value = [...m.entries, ...mine];
    }
    else if (m.type === 'presence' && typeof m.n === 'number') presence.value = m.n;
  };
  s.onclose = () => { if (ws === s) { ws = null; mode.value = 'offline'; schedule(); } };
  const ping = setInterval(() => { if (s.readyState === 1) s.send('ping'); else clearInterval(ping); }, 25000);
}

/** つながっているWebSocketで、送信待ちをまとめて送る */
function flushWs() {
  if (!ws || ws.readyState !== 1) return false;
  for (const e of pending.peek()) ws.send(JSON.stringify({ type: 'add', entry: e }));
  return true;
}

async function flush() {
  const c = room.value;
  if (!c) return;
  for (const e of [...pending.value]) {
    try {
      await j(`/api/rooms/${c}/entries`, { method: 'POST', body: JSON.stringify(e) });
      pending.value = pending.value.filter((p) => p.id !== e.id);
    } catch { break; }
  }
}

/** 入力を追加。画面にはすぐ出し、サーバーには裏で送る */
export async function addEntry(e: Entry) {
  upsertEntry(e);
  lastAdded.value = e;
  if (!room.value) return;
  pending.value = [...pending.peek(), e];
  // ふだんはWebSocketで即送信。つながっていなければHTTPで送る
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'add', entry: e }));
  else if (mode.value !== 'offline') await flush();
}

export async function deleteEntry(e: Entry) {
  removeEntry(e.id);
  pending.value = pending.value.filter((p) => p.id !== e.id);
  if (!room.value) return;
  if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ type: 'del', id: e.id, device, key: teacherKey.value })); return; }
  try {
    await j(`/api/rooms/${room.value}/entries/${e.id}`, { method: 'DELETE', body: JSON.stringify({ device, key: teacherKey.value }) });
  } catch { /* オフライン時は手元だけ */ }
}

export async function aiParse(text: string): Promise<{ fish?: string; place?: string; method?: string } | null> {
  if (!aiOk.value) return null;
  try { return await j('/api/ai/parse', { method: 'POST', body: JSON.stringify({ text }) }, 9000); } catch { return null; }
}

export async function aiQuestions(summary: string): Promise<string[] | null> {
  if (!aiOk.value) return null;
  try {
    const r = await j<{ questions: string[] }>('/api/ai/questions', { method: 'POST', body: JSON.stringify({ summary }) }, 12000);
    return r.questions?.length ? r.questions : null;
  } catch { return null; }
}

window.addEventListener('online', () => { if (room.value && mode.value !== 'live') { serverOk.value = null; connect(); } });
