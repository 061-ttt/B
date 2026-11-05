// 模擬サーバー（mock-server.mjs）で、Apps Script 版の2台の同期を確かめる
//   node tests/gas/mock-server.mjs 8931 &  node tests/gas/sync-check.mjs 8931
import { chromium } from 'playwright';
const PORT = Number(process.argv[2] || 8931);
const BASE = `http://127.0.0.1:${PORT}/exec`;
const exe = process.env.PW_CHROME_PATH;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], ...(exe ? { executablePath: exe } : {}) });
const errs = [];
async function open(url) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load|ERR_/.test(m.text())) errs.push(m.text()); });
  await p.goto(url);
  await p.waitForSelector('#skeleton', { state: 'detached', timeout: 90000 });
  const s = p.getByTestId('intro-start');
  if (await s.isVisible()) await s.click();
  return p;
}
const ok = (c, m) => { if (!c) throw new Error('NG: ' + m); console.log('OK ', m); };
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 300)); } return false; };
const total = (p) => p.getByTestId('total').textContent();
async function add(p, tag) {
  await p.getByTestId('fab').click();
  await p.getByTestId('tag-input').fill(tag);
  await p.getByTestId('place-ok').waitFor({ timeout: 10000 });
  await p.getByTestId('submit').click();
  await p.getByTestId('add-sheet').waitFor({ state: 'attached' });
  await until(async () => !(await p.getByTestId('add-sheet').getAttribute('class')).includes(' on'));
}

const A = await open(BASE);
await A.evaluate(() => window.__sm?.scene?.setActive(false));
// 先生：クラスをつくる
await A.getByTestId('room-btn').click();
await A.getByTestId('create-room').click();
await A.getByTestId('room-code').waitFor({ timeout: 20000 });
const code = (await A.getByTestId('room-code').textContent()).trim();
ok(/^[A-Z0-9]{6}$/.test(code), `クラスができた ${code}`);
ok(await until(async () => (await A.getByTestId('room-sheet').textContent()).includes('つながっています')), '先生の端末がつながった');
const qrUrl = await A.evaluate(() => document.querySelector('[data-testid=room-sheet]')?.textContent);
await A.keyboard.press('Escape');
// 参加用のリンク（QRコードの中身）は exec?room=○○
const link = await A.evaluate(async () => { const m = await import('/nothing').catch(() => null); return null; }).catch(() => null);

const B = await open(`${BASE}?room=${code}`);
await B.evaluate(() => window.__sm?.scene?.setActive(false));
ok(await until(async () => (await B.getByTestId('room-btn').textContent()).includes(code)), 'QRのリンクで開いた端末が同じクラスに入った');

await add(A, 'ノルウェー産 さば');
ok(await until(async () => (await total(B)) === '1'), 'Aの入力がBに届いた');
await add(B, '北海道 さんま');
ok(await until(async () => (await total(A)) === '2'), 'Bの入力がAに届いた');
// 人数
await A.getByTestId('room-btn').click();
ok(await until(async () => /つながっています（2台）/.test(await A.getByTestId('room-sheet').textContent())), '2台と数えた');
// 先生のリセット
await A.getByTestId('reset-class').click();
const confirm = A.locator('[data-testid=reset-class] ~ * button, .reset-box button').filter({ hasText: /リセット|消す/ });
for (const t of ['リセットする', '消す', 'はい']) { const btn = A.getByRole('button', { name: t }); if (await btn.count()) { await btn.first().click(); break; } }
ok(await until(async () => (await total(B)) === '0'), 'リセットがBにも届いた');
await A.keyboard.press('Escape');
// リセットのあとも入力できる
await add(B, 'チリ産 銀鮭');
ok(await until(async () => (await total(A)) === '1'), 'リセット後の入力も届いた');
// Bの再読み込みでサーバーから戻る
await B.reload();
await B.waitForSelector('#skeleton', { state: 'detached', timeout: 90000 });
ok(await until(async () => (await total(B)) === '1'), '開き直してもサーバーから戻る');
const st = await (await fetch(`http://127.0.0.1:${PORT}/stats`)).json();
console.log('呼び出し回数', JSON.stringify(st));
ok(errs.length === 0, 'コンソールエラーなし ' + errs.join(' | '));
await b.close();
