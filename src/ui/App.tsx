import { useEffect } from 'preact/hooks';
import { activeCards, mode, room, sheet, tab, toast, view, type Tab } from '../state';
import { MapOverlay, MapView, scene } from './MapView';
import { Sheets, SegThumb } from './Sheets';
import { Zukan } from './Zukan';
import { Tasks } from './Tasks';
import { Worksheet } from './Worksheet';
import { G } from './Glyph';

const TABS: { id: Tab; label: string; icon: () => preact.JSX.Element }[] = [
  { id: 'map', label: '地図', icon: G.map },
  { id: 'zukan', label: '図鑑', icon: G.book },
  { id: 'tasks', label: 'タスク', icon: G.check },
  { id: 'sheet', label: 'シート', icon: G.pen },
];

export function App() {
  // ガラスの反射を指の位置に少し寄せる
  useEffect(() => {
    const f = (e: PointerEvent) => {
      const t = (e.target as HTMLElement).closest?.('.glass') as HTMLElement | null;
      if (!t) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    };
    addEventListener('pointermove', f, { passive: true });
    addEventListener('pointerdown', f, { passive: true });
    // 上のメモ欄の件数ボタン → タスク
    const mc = document.getElementById('memo-count');
    const go = () => (tab.value = 'tasks');
    mc?.addEventListener('click', go);
    return () => { removeEventListener('pointermove', f); mc?.removeEventListener('click', go); };
  }, []);

  return (
    <>
      <MapView />
      {tab.value === 'map' && <MapTop />}
      {tab.value === 'map' && <MapOverlay />}
      <Zukan />
      <Tasks />
      <Worksheet />
      <TabBar />
      <Sheets />
      <Toast />
    </>
  );
}

function MapTop() {
  const v = view.value;
  return (
    <div class="topbar">
      <div class="seg glass" role="group" aria-label="地図の切りかえ">
        <SegThumb idx={v === 'japan' ? 0 : 1} n={2} />
        <button aria-pressed={v === 'japan'} onClick={() => (view.value = 'japan')} data-testid="view-japan">日本</button>
        <button aria-pressed={v === 'world'} onClick={() => (view.value = 'world')} data-testid="view-world">世界</button>
      </div>
      <span class="spacer" />
      <button class="icon-btn glass" aria-label="全体を見る" onClick={() => scene?.home()}><G.home /></button>
      <button class="icon-btn glass" aria-label="表示と凡例" onClick={() => (sheet.value = 'legend')} data-testid="legend-btn"><G.layers /></button>
      <button class="icon-btn glass" aria-label="クラス" onClick={() => (sheet.value = 'room')} data-testid="room-btn">
        <span class={`status-dot ${mode.value}`} />{room.value ?? <G.users />}
      </button>
    </div>
  );
}

function TabBar() {
  const i = TABS.findIndex((t) => t.id === tab.value);
  return (
    <nav class="tabbar glass" aria-label="画面">
      <span class="lens" style={{ transform: `translateX(${i * 100}%)` }} />
      {TABS.map((t) => (
        <button key={t.id} aria-current={tab.value === t.id ? 'page' : undefined} onClick={() => (tab.value = t.id)} data-tab={t.id}>
          <t.icon />{t.label}
          {t.id === 'tasks' && activeCards.value > 0 && <span class="badge">{activeCards.value}</span>}
        </button>
      ))}
    </nav>
  );
}

function Toast() {
  const t = toast.value;
  if (!t) return null;
  return (
    <div class="toast glass strong" key={t.id} role="status" data-testid="toast">
      {t.text}
      {t.action && <button onClick={() => { t.action!.run(); toast.value = null; }}>{t.action.label}</button>}
    </div>
  );
}
