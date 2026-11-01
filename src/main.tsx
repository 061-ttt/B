import { render } from 'preact';
import './styles.css';
import { App } from './ui/App';
import { ready, room, entries, cards, worksheet, view, filter, tab } from './state';
import { checkServer, joinRoom } from './core/sync';

render(<App />, document.getElementById('app')!);

// 地図の準備ができたらスケルトンを消す
const sk = document.getElementById('skeleton');
ready.subscribe((r) => {
  if (!r || !sk) return;
  sk.classList.add('done');
  setTimeout(() => sk.remove(), 600);
});
// 万一のときも10秒で消す（メモや図鑑は使えるように）
setTimeout(() => { ready.value = true; }, 10000);

checkServer().then(() => { if (room.value) joinRoom(room.value); });

// テストと先生向けの確認用
(window as unknown as Record<string, unknown>).__smState = { ready, room, entries, cards, worksheet, view, filter, tab };
