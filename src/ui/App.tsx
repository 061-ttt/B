import { useEffect } from 'preact/hooks';
import { memoCount, mode, room, sheet, tab, toast, view, type Tab } from '../state';
import { MapOverlay, MapView, globe } from './MapView';
import { Sheets, SegThumb } from './Sheets';
import { Zukan } from './Zukan';
import { Worksheet } from './Worksheet';
import { G } from './Glyph';
import { QrBig, QrScanner } from './Qr';

const TABS: { id: Tab; label: string; icon: () => preact.JSX.Element }[] = [
  { id: 'map', label: '地球儀', icon: G.globe },
  { id: 'zukan', label: '図鑑', icon: G.book },
  { id: 'sheet', label: 'シート', icon: G.pen },
];

export function App() {
  useEffect(() => {
    // 上のメモ欄の件数ボタン → シートのメモ
    const mc = document.getElementById('memo-count');
    const go = () => {
      tab.value = 'sheet';
      setTimeout(() => document.getElementById('memo-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 380);
    };
    mc?.addEventListener('click', go);
    return () => mc?.removeEventListener('click', go);
  }, []);

  return (
    <>
      <MapView />
      {tab.value === 'map' && <MapTop />}
      {tab.value === 'map' && <MapOverlay />}
      <Zukan />
      <Worksheet />
      {tab.value !== 'map' && <><div class="fade-top" aria-hidden="true" /><div class="fade-bottom" aria-hidden="true" /></>}
      <TabBar />
      <Sheets />
      <QrBig />
      <QrScanner />
      <Toast />
    </>
  );
}

function MapTop() {
  const v = view.value;
  return (
    <div class="topbar">
      <div class="seg glass" role="group" aria-label="見る範囲">
        <SegThumb idx={v === 'detail' ? 0 : 1} n={2} />
        <button aria-pressed={v === 'detail'} onClick={() => globe?.flyJapan()} data-testid="view-japan">日本</button>
        <button aria-pressed={v === 'world'} onClick={() => globe?.flyWorld()} data-testid="view-world">世界</button>
      </div>
      <span class="spacer" />
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
          {t.id === 'sheet' && memoCount.value > 0 && <span class="badge">{memoCount.value}</span>}
        </button>
      ))}
    </nav>
  );
}

function Toast() {
  const t = toast.value;
  if (!t) return null;
  return (
    <div class="toast" key={t.id} role="status" data-testid="toast">
      {t.text}
      {t.action && <button onClick={() => { t.action!.run(); toast.value = null; }}>{t.action.label}</button>}
    </div>
  );
}
