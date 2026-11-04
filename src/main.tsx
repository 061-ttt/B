import { render } from 'preact';
import './styles.css';

// 丸ゴシックと数字用の書体（端末に保存。1ファイル版は Google Fonts から読む）
if (import.meta.env.VITE_STANDALONE !== '1') {
  import('@fontsource/m-plus-rounded-1c/500.css');
  import('@fontsource/m-plus-rounded-1c/800.css');
  import('@fontsource/outfit/600.css');
  import('@fontsource/outfit/800.css');
}
import { App } from './ui/App';
import { ready, room, entries, worksheet, view, filter, tab, mode, showToast, teacherKey } from './state';
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

// QRコード（?room=コード）から開いた人は、そのクラスに入る。入れたら知らせる
const fromQr = new URLSearchParams(location.search).get('room');
checkServer().then(async () => {
  if (!room.value) return;
  await joinRoom(room.value);
  if (fromQr && room.value && mode.value !== 'local' && !teacherKey.value) showToast(`クラス ${room.value} に入りました`, undefined, 8000);
});

// テストと先生向けの確認用
(window as unknown as Record<string, unknown>).__smState = { ready, room, entries, worksheet, view, filter, tab };
