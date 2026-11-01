// 負荷テスト：60台が同時に入力しても、全員の画面に即時に届くかを確かめる
// 使い方: node tests/load/realtime.mjs [台数] [1台あたりの件数] [ベースURL]
const N = Number(process.argv[2] ?? 60);
const PER = Number(process.argv[3] ?? 3);
const BASE = process.argv[4] ?? 'http://127.0.0.1:8787';
const WS = BASE.replace(/^http/, 'ws');

const PLACES = ['hokkaido', 'aomori', 'miyagi', 'chiba', 'shizuoka', 'nagasaki', 'kagoshima', 'norway', 'chile', 'vietnam'];
const FISH = ['salmon', 'mackerel', 'saury', 'tuna', 'shrimp', 'squid', 'scallop', 'oyster'];

const room = await (await fetch(`${BASE}/api/rooms`, { method: 'POST', body: '{}' })).json();
console.log(`クラス ${room.code} に ${N} 台がつなぎ、1台 ${PER} 件ずつ同時に入力します`);

const total = N * PER;
const sentAt = new Map();
const clients = [];
const t0 = Date.now();
await Promise.all(Array.from({ length: N }, (_, i) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`${WS}/api/rooms/${room.code}/ws`);
  const c = { ws, got: new Map(), acks: 0, nacks: 0, device: `dload${i}` };
  ws.onopen = () => resolve();
  ws.onerror = (e) => reject(new Error(`接続失敗 ${i}: ${e.message ?? e}`));
  ws.onmessage = (ev) => {
    if (ev.data === 'pong') return;
    const m = JSON.parse(ev.data);
    if (m.type === 'add') c.got.set(m.entry.id, Date.now());
    if (m.type === 'adds') for (const e of m.entries) c.got.set(e.id, Date.now());
    if (m.type === 'ack') c.acks++;
    if (m.type === 'nack') c.nacks++;
  };
  clients.push(c);
})));
console.log(`${N} 台の接続：${Date.now() - t0} ms`);

// 全員が「せーの」で送る
const tSend = Date.now();
clients.forEach((c, i) => {
  for (let k = 0; k < PER; k++) {
    const id = `e${i}x${k}${Math.random().toString(36).slice(2, 6)}`;
    const entry = { id, fishId: FISH[(i + k) % FISH.length], fishName: 'x', placeId: PLACES[(i * 3 + k) % PLACES.length], method: 'unknown', group: (i % 8) + 1, at: Date.now(), device: c.device };
    sentAt.set(id, Date.now());
    c.ws.send(JSON.stringify({ type: 'add', entry }));
  }
});

// 全員に全件が届くまで待つ（最大15秒）
const deadline = Date.now() + 15000;
while (Date.now() < deadline && clients.some((c) => c.got.size < total)) await new Promise((r) => setTimeout(r, 20));
const done = Date.now() - tSend;

const lat = [];
for (const c of clients) for (const [id, t] of c.got) lat.push(t - sentAt.get(id));
lat.sort((a, b) => a - b);
const q = (p) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))];
const complete = clients.filter((c) => c.got.size === total).length;
const acks = clients.reduce((s, c) => s + c.acks, 0), nacks = clients.reduce((s, c) => s + c.nacks, 0);
const state = await (await fetch(`${BASE}/api/rooms/${room.code}`)).json();

console.log(`全件そろった端末：${complete}/${N}　（${total}件 × ${N}台 = ${total * N}通）`);
console.log(`全員にそろうまで：${done} ms`);
console.log(`届くまでの時間：中央値 ${q(0.5)} ms / 95% ${q(0.95)} ms / 最大 ${lat[lat.length - 1]} ms`);
console.log(`受付 ${acks} 件 / 拒否 ${nacks} 件 / サーバーの保存 ${state.entries.length} 件`);
for (const c of clients) c.ws.close();

const ok = complete === N && acks === total && nacks === 0 && state.entries.length === total && q(0.95) < 2000;
console.log(ok ? '合格' : '不合格');
process.exit(ok ? 0 : 1);
