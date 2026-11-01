// クラスのデータをCloudflare（Durable Object）とリアルタイムにそろえる。
// サーバーに届かないときは端末内に保存し、つながったら送り直す。
import type { Entry } from './model';
import { aiOk, device, entries, mode, pending, presence, reloadEntries, removeEntry, room, serverOk, showToast, teacherKey, upsertEntry, lastAdded } from '../state';

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

function openSocket(code: string) {
  const base = API ? new URL(API) : new URL(location.href);
  const proto = base.protocol === 'https:' ? 'wss:' : 'ws:';
  const s = new WebSocket(`${proto}//${base.host}/api/rooms/${code}/ws`);
  ws = s;
  s.onopen = () => { mode.value = 'live'; retry = 0; };
  s.onmessage = (ev) => {
    let m: { type: string; entry?: Entry; id?: string; entries?: Entry[]; n?: number };
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'add' && m.entry) {
      const isNew = !entries.value.some((x) => x.id === m.entry!.id);
      upsertEntry(m.entry);
      if (isNew && m.entry.device !== device) lastAdded.value = m.entry;
    }
    if (m.type === 'del' && m.id) removeEntry(m.id);
    if (m.type === 'snapshot' && m.entries) {
      const mine = pending.value.filter((p) => !m.entries!.some((e) => e.id === p.id));
      entries.value = [...m.entries, ...mine];
    }
    if (m.type === 'presence' && typeof m.n === 'number') presence.value = m.n;
  };
  s.onclose = () => { if (ws === s) { ws = null; mode.value = 'offline'; schedule(); } };
  // 定期的に生存確認（Durable Objectのハイバネーション中も自動応答される）
  const ping = setInterval(() => { if (s.readyState === 1) s.send('ping'); else clearInterval(ping); }, 25000);
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
  pending.value = [...pending.value, e];
  if (mode.value === 'live' || mode.value === 'connecting') await flush();
}

export async function deleteEntry(e: Entry) {
  removeEntry(e.id);
  pending.value = pending.value.filter((p) => p.id !== e.id);
  if (!room.value) return;
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
