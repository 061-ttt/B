import { signal, effect, batch, computed } from '@preact/signals';
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

// ── 画面の広さ ──
// PC・横向きのタブレットなど広い画面では、図鑑やシートを右側に出して地球儀を見ながら使えるようにする
const WIDE_Q = '(min-width: 1024px) and (min-aspect-ratio: 5/4)';
const mq = typeof matchMedia === 'function' ? matchMedia(WIDE_Q) : null;
export const wide = signal(!!mq?.matches);
mq?.addEventListener?.('change', (e) => { wide.value = e.matches; });
/** 右側に出す図鑑・シートの幅（px）。CSS の --drawer と同じ計算 */
export function drawerWidth() { return Math.round(Math.min(480, innerWidth * 0.4)); }

export const toast = signal<{ text: string; action?: { label: string; run: () => void }; id: number } | null>(null);
let toastTimer = 0;
export function showToast(text: string, action?: { label: string; run: () => void }, ms?: number) {
  clearTimeout(toastTimer);
  toast.value = { text, action, id: Date.now() };
  toastTimer = window.setTimeout(() => (toast.value = null), ms ?? (action ? 5000 : 2600));
}

// ── クラス（ルーム）とデータ ──
const params = new URLSearchParams(location.search);
export const room = signal<string | null>((params.get('room') || ls.get<string | null>('sm.room', null))?.toUpperCase() ?? null);
// 先生のかぎはクラスごとに持つ（ほかのクラスに参加したときに取り違えない）。以前の版の1つだけのかぎは引きつぐ
export const teacherKeys = signal<Record<string, string>>((() => {
  const m = ls.get<Record<string, string>>('sm.teacherKeys', {});
  const old = ls.get<string | null>('sm.teacherKey', null);
  if (old && room.value && !m[room.value]) m[room.value] = old;
  try { localStorage.removeItem('sm.teacherKey'); } catch { /* */ }
  return m;
})());
export const teacherKey = computed(() => (room.value ? teacherKeys.value[room.value] ?? null : null));
export const mode = signal<'local' | 'connecting' | 'live' | 'offline'>(room.value ? 'connecting' : 'local');
export const serverOk = signal<boolean | null>(null);
export const aiOk = signal(false);
export const presence = signal(0);
export const group = signal<number>(ls.get('sm.group', 1));
effect(() => ls.set('sm.group', group.value));
effect(() => ls.set('sm.room', room.value));
effect(() => ls.set('sm.teacherKeys', teacherKeys.value));

// クラスを切りかえたとき、前のクラスのデータを新しいクラスの保存場所に書かないよう、room は peek で読む
const entriesKey = () => `sm.entries:${room.peek() ?? 'local'}`;
export const entries = signal<Entry[]>(ls.get(entriesKey(), []));
export const pending = signal<Entry[]>(ls.get('sm.pending', []));
effect(() => ls.set(entriesKey(), entries.value));
effect(() => ls.set('sm.pending', pending.value));

export function reloadEntries() {
  entries.value = ls.get(entriesKey(), []);
  resetGen.value = ls.get(genKey(), 0);
}

// クラスで最後にリセットした時刻。入力に付けて送る（リセット前の入力が後から届いても戻さない）
const genKey = () => `sm.gen:${room.peek() ?? 'local'}`;
export const resetGen = signal<number>(ls.get(genKey(), 0));
effect(() => ls.set(genKey(), resetGen.value));

export const lastAdded = signal<Entry | null>(null);

export function upsertEntry(e: Entry) {
  if (entries.value.some((x) => x.id === e.id)) return;
  entries.value = [...entries.value, e];
}
export function removeEntry(id: string) {
  entries.value = entries.value.filter((x) => x.id !== id);
}

// 以前の版のメモ・タスクのデータは使わないので消す
for (const k of ['sm.cards', 'sm.seeded', 'sm.draft']) { try { localStorage.removeItem(k); } catch { /* */ } }

// ── ワークシート ──
// シートの内容はこのタブレットの中（localStorage）だけに保存し、サーバーには送らない。
// 共有されるのは地球儀に入力した魚と産地だけ（core/sync.ts）
export interface Worksheet { fact: string; reason: string; next: string; checks: boolean[] }
export const worksheet = signal<Worksheet>(ls.get('sm.sheet', { fact: '', reason: '', next: '', checks: [false, false, false] }));
effect(() => ls.set('sm.sheet', worksheet.value));
export function clearWorksheet() {
  worksheet.value = { fact: '', reason: '', next: '', checks: [false, false, false] };
}
export function appendTo(field: 'fact' | 'reason' | 'next', text: string) {
  const cur = worksheet.value[field];
  worksheet.value = { ...worksheet.value, [field]: cur ? `${cur.replace(/\s+$/, '')}\n${text}` : text };
}

export { batch };
