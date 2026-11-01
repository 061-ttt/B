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
export type Tab = 'map' | 'zukan' | 'tasks' | 'sheet';
export const tab = signal<Tab>('map');
export const view = signal<ViewId>('japan');
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

// ── メモ・タスク（フリックで進める） ──
export type CardStatus = 'memo' | 'todo' | 'doing' | 'done';
export interface Card { id: string; text: string; status: CardStatus; createdAt: number; updatedAt: number }
export const STATUS: CardStatus[] = ['memo', 'todo', 'doing', 'done'];
export const STATUS_LABEL: Record<CardStatus, string> = { memo: 'メモ', todo: 'やること', doing: 'とりくみ中', done: 'できた' };

const SEED: [string, CardStatus][] = [
  ['値札の産地を確かめる', 'todo'],
  ['魚と産地を地図に入力する', 'todo'],
  ['分布を比べて分ける（国内・外国／天然・養殖）', 'todo'],
  ['なぜその地域に集まるのか考える', 'todo'],
  ['次に調べたいことを書く', 'todo'],
];
function initialCards(): Card[] {
  const raw = localStorage.getItem('sm.cards');
  if (raw == null || !ls.get('sm.seeded', false)) {
    const now = Date.now();
    const cur = ls.get<Card[]>('sm.cards', []);
    const seeded = [...cur, ...SEED.map(([text, status], i) => ({ id: `seed${i}`, text, status, createdAt: now - (SEED.length - i), updatedAt: now }))];
    ls.set('sm.cards', seeded);
    ls.set('sm.seeded', true);
    return seeded;
  }
  return ls.get<Card[]>('sm.cards', []);
}
export const cards = signal<Card[]>(initialCards());
effect(() => ls.set('sm.cards', cards.value));
// index.html のメモ欄（JS読み込み前から動く）からの追加を取り込む
window.addEventListener('sm:cards', () => { cards.value = ls.get('sm.cards', cards.value); });

export function setCardStatus(id: string, status: CardStatus) {
  cards.value = cards.value.map((c) => (c.id === id ? { ...c, status, updatedAt: Date.now() } : c));
  window.dispatchEvent(new CustomEvent('sm:cards-count'));
}
export function moveCard(id: string, dir: 1 | -1): CardStatus | 'deleted' | null {
  const c = cards.value.find((x) => x.id === id);
  if (!c) return null;
  const i = STATUS.indexOf(c.status) + dir;
  if (i < 0) { deleteCard(id); return 'deleted'; }
  if (i >= STATUS.length) return null;
  setCardStatus(id, STATUS[i]);
  return STATUS[i];
}
export function deleteCard(id: string) {
  const c = cards.value.find((x) => x.id === id);
  cards.value = cards.value.filter((x) => x.id !== id);
  if (c) showToast('メモを消しました', { label: 'もとにもどす', run: () => (cards.value = [c, ...cards.value]) });
}
export function addCard(text: string, status: CardStatus = 'memo') {
  const now = Date.now();
  cards.value = [{ id: uid('c'), text, status, createdAt: now, updatedAt: now }, ...cards.value];
}
export function editCard(id: string, text: string) {
  cards.value = cards.value.map((c) => (c.id === id ? { ...c, text, updatedAt: Date.now() } : c));
}

// ── ワークシート ──
export interface Worksheet { fact: string; reason: string; next: string; checks: boolean[] }
export const worksheet = signal<Worksheet>(ls.get('sm.sheet', { fact: '', reason: '', next: '', checks: [false, false, false] }));
effect(() => ls.set('sm.sheet', worksheet.value));
export function appendTo(field: 'fact' | 'reason' | 'next', text: string) {
  const cur = worksheet.value[field];
  worksheet.value = { ...worksheet.value, [field]: cur ? `${cur.replace(/\s+$/, '')}\n${text}` : text };
}

export const activeCards = computed(() => cards.value.filter((c) => c.status !== 'done').length);
effect(() => {
  const el = document.getElementById('memo-count');
  if (el) el.textContent = String(activeCards.value);
});

export { batch };
