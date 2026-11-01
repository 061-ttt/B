import { signal, computed, effect, batch } from '@preact/signals';
import type { Entry, FilterId, ViewId } from './core/model';
import { uid } from './core/model';

// ── 永続化の小道具 ──
const ls = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v == null ? d : (JSON.parse(v) as T); } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 容量超過など */ } },
};

export const device = (() => {
  let d = ls.get<string>('sm.device', '');
  if (!d) { d = uid('d'); ls.set('sm.device', d); }
  return d;
})();

// ── 画面 ──
export type Tab = 'map' | 'zukan' | 'sheet';
export const tab = signal<Tab>('map');
export const view = signal<ViewId>('world');
export const filter = signal<FilterId>('all');
export const focusFish = signal<string | null>(null);
export const layers = signal(ls.get('sm.layers', { currents: true, depth: true, labels: true }));
effect(() => ls.set('sm.layers', layers.value));
export const sheet = signal<null | 'add' | 'room' | 'legend' | { pin: string }>(null);
export const ready = signal(false);

export const toast = signal<{ text: string; action?: { label: string; run: () => void }; id: number } | null>(null);
let toastTimer = 0;
export function showToast(text: string, action?: { label: string; run: () => void }) {
  clearTimeout(toastTimer);
  toast.value = { text, action, id: Date.now() };
  toastTimer = window.setTimeout(() => (toast.value = null), action ? 5000 : 2600);
}

// ── クラス（ルーム）とデータ ──
const params = new URLSearchParams(location.search);
export const room = signal<string | null>((params.get('room') || ls.get<string | null>('sm.room', null))?.toUpperCase() ?? null);
export const teacherKey = signal<string | null>(ls.get<string | null>('sm.teacherKey', null));
export const mode = signal<'local' | 'connecting' | 'live' | 'offline'>(room.value ? 'connecting' : 'local');
export const serverOk = signal<boolean | null>(null);
export const aiOk = signal(false);
export const presence = signal(0);
export const group = signal<number>(ls.get('sm.group', 1));
effect(() => ls.set('sm.group', group.value));
effect(() => ls.set('sm.room', room.value));
effect(() => ls.set('sm.teacherKey', teacherKey.value));

const entriesKey = () => `sm.entries:${room.value ?? 'local'}`;
export const entries = signal<Entry[]>(ls.get(entriesKey(), []));
export const pending = signal<Entry[]>(ls.get('sm.pending', []));
effect(() => ls.set(entriesKey(), entries.value));
effect(() => ls.set('sm.pending', pending.value));

export function reloadEntries() {
  entries.value = ls.get(entriesKey(), []);
}

export const lastAdded = signal<Entry | null>(null);

export function upsertEntry(e: Entry) {
  if (entries.value.some((x) => x.id === e.id)) return;
  entries.value = [...entries.value, e];
}
export function removeEntry(id: string) {
  entries.value = entries.value.filter((x) => x.id !== id);
}

// ── メモ（index.html のメモ欄から、JS読み込み前でも追加される） ──
export interface Memo { id: string; text: string; createdAt: number }
function loadMemos(): Memo[] {
  // 以前の版のタスク（やること・とりくみ中・できた）は削除し、メモだけ残す
  const raw = ls.get<(Memo & { status?: string })[]>('sm.cards', []);
  const memos = raw.filter((c) => !c.status || c.status === 'memo').map(({ id, text, createdAt }) => ({ id, text, createdAt }));
  if (memos.length !== raw.length) ls.set('sm.cards', memos);
  try { localStorage.removeItem('sm.seeded'); } catch { /* */ }
  return memos;
}
export const memos = signal<Memo[]>(loadMemos());
effect(() => ls.set('sm.cards', memos.value));
window.addEventListener('sm:cards', () => { memos.value = loadMemos(); });

export function deleteMemo(id: string) {
  const i = memos.value.findIndex((x) => x.id === id);
  if (i < 0) return;
  const m = memos.value[i];
  memos.value = memos.value.filter((x) => x.id !== id);
  showToast('メモを消しました', { label: 'もとにもどす', run: () => { const a = [...memos.value]; a.splice(i, 0, m); memos.value = a; } });
}

// ── ワークシート ──
export interface Worksheet { fact: string; reason: string; next: string; checks: boolean[] }
export const worksheet = signal<Worksheet>(ls.get('sm.sheet', { fact: '', reason: '', next: '', checks: [false, false, false] }));
effect(() => ls.set('sm.sheet', worksheet.value));
export function appendTo(field: 'fact' | 'reason' | 'next', text: string) {
  const cur = worksheet.value[field];
  worksheet.value = { ...worksheet.value, [field]: cur ? `${cur.replace(/\s+$/, '')}\n${text}` : text };
}

export const memoCount = computed(() => memos.value.length);
effect(() => {
  const el = document.getElementById('memo-count');
  if (el) el.textContent = String(memoCount.value);
});

export { batch };
