import { effect } from '@preact/signals';
import { mode, room, sheet, tab, toast, view, wide, type Tab } from '../state';
import { MapOverlay, MapView, globe } from './MapView';
import { Sheets, SegThumb } from './Sheets';
import { Zukan } from './Zukan';
import { Worksheet } from './Worksheet';
import { G } from './Glyph';
import { QrBig, QrScanner } from './Qr';
import { Intro, intro } from './Intro';

const TABS: { id: Tab; label: string; icon: () => preact.JSX.Element }[] = [
  { id: 'map', label: '地球儀', icon: G.globe },
  { id: 'zukan', label: '図鑑', icon: G.book },
  { id: 'sheet', label: 'シート', icon: G.pen },
];

// いまのタブと画面の広さを <html> に書いておく（CSS で並べ方を変えるため）
effect(() => {
  document.documentElement.dataset.screen = tab.value;
  document.documentElement.classList.toggle('wide', wide.value);
});

export function App() {
  // 広い画面では、図鑑やシートを開いても地球儀とその操作はそのまま使える
  const showMap = tab.value === 'map' || wide.value;
  return (
    <>
      <MapView />
      {showMap && <MapTop />}
      {showMap && <MapOverlay />}
      <Zukan />
      <Worksheet />
      {tab.value !== 'map' && !wide.value && <><div class="fade-top" aria-hidden="true" /><div class="fade-bottom" aria-hidden="true" /></>}
      <TabBar />
      <Sheets />
      <QrBig />
      <QrScanner />
      <Intro />
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
      <button class="icon-btn glass" aria-label="使い方" onClick={() => (intro.value = true)} data-testid="help-btn"><b style={{ fontSize: '17px' }}>?</b></button>
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
