import { test, expect, type Page } from '@playwright/test';

type W = Window & { __sm?: { scene: { frames: number; info(): Record<string, number | string>; arrowSample(): string; flyTo(lon: number, lat: number, d?: number, dur?: number): void } } };

async function ready(page: Page) {
  await expect(page.locator('#skeleton')).toHaveCount(0, { timeout: 45_000 });
  await page.waitForFunction(() => ((window as W).__sm?.scene.frames ?? 0) > 3, null, { timeout: 30_000 });
}

async function addEntry(page: Page, fish: string, place: string, opts: { method?: '天然' | '養殖' } = {}) {
  await page.getByTestId('fab').click();
  const sheet = page.getByTestId('add-sheet');
  await expect(sheet).toHaveClass(/(^|\s)on(\s|$)/);
  await sheet.getByTestId('fish-input').fill(fish);
  await sheet.locator('[aria-label="魚の候補"] button').first().click();
  await sheet.getByTestId('place-input').fill(place);
  await sheet.locator('[aria-label="産地の候補"] button').first().click();
  await expect(sheet.getByTestId('place-ok')).toBeVisible();
  if (opts.method) await sheet.getByRole('button', { name: opts.method, exact: true }).click();
  await sheet.getByTestId('submit').click();
  await expect(sheet).not.toHaveClass(/(^|\s)on(\s|$)/);
}

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
});
test.afterEach(() => {
  expect(errors, `コンソールエラー: ${errors.join('\n')}`).toEqual([]);
});

test('1. 開いた瞬間にメモでき、JSを待たずに保存される', async ({ page }) => {
  // アプリ本体のJSをわざと3秒遅らせる
  await page.route(/\/assets\/index-.*\.js$/, async (r) => { await new Promise((s) => setTimeout(s, 3000)); await r.continue(); });
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#skeleton')).toBeVisible();
  const memo = page.locator('#memo');
  await expect(memo).toBeEditable();
  await memo.fill('サーモンはチリが多い？');
  await memo.press('Enter');
  await expect(page.locator('#memo-count')).toHaveText('1');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sm.cards') || '[]'));
  expect(stored[0].text).toBe('サーモンはチリが多い？');
  // 本体はまだ読み込まれていない（スケルトンが残っている）
  await expect(page.locator('#skeleton')).toBeVisible();
  await ready(page);
  // 書きかけも残る
  await memo.fill('書きかけ');
  await page.reload();
  await expect(page.locator('#memo')).toHaveValue('書きかけ');
  await ready(page);
  await expect(page.locator('#memo-count')).toHaveText('1');
  await page.locator('#memo-count').click();
  await expect(page.getByTestId('sheet')).toHaveClass(/(^|\s)on(\s|$)/);
  await expect(page.getByTestId('memo-list')).toContainText('サーモンはチリが多い？');
});

test('2. 全画面スケルトン → 地図の準備後に消える', async ({ page }) => {
  await page.route(/\/assets\/scene-.*\.js$/, async (r) => { await new Promise((s) => setTimeout(s, 1500)); await r.continue(); });
  await page.goto('/', { waitUntil: 'commit' });
  const sk = page.locator('#skeleton');
  await expect(sk).toBeVisible();
  const box = await sk.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.width).toBe(vp.width);
  expect(box!.height).toBe(vp.height);
  expect(await sk.locator('.sk').count()).toBeGreaterThan(5);
  await ready(page);
});

test('3. 地球儀・海流アニメーション・潮目・深さ・端がない', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  // 宇宙から日本へ寄る
  await expect.poll(() => page.evaluate(() => (window as W).__sm!.scene.info().view), { timeout: 15_000 }).toBe('detail');
  const info = await page.evaluate(() => (window as W).__sm!.scene.info());
  expect(Number(info.warm)).toBeGreaterThan(100);
  expect(Number(info.cold)).toBeGreaterThan(60);
  expect(Number(info.meet)).toBeGreaterThanOrEqual(3);
  // 矢印が時間とともに動く
  const m1 = await page.evaluate(() => (window as W).__sm!.scene.arrowSample());
  await expect.poll(() => page.evaluate(() => (window as W).__sm!.scene.arrowSample()), { timeout: 8000 }).not.toBe(m1);
  const canvas = page.locator('canvas.map-canvas');
  const a = await canvas.screenshot();
  await expect.poll(async () => Buffer.compare(a, await canvas.screenshot()), { timeout: 8000 }).not.toBe(0);
  await expect(page.locator('.current-label.warm', { hasText: '黒潮' })).toBeAttached();
  await expect(page.locator('.current-label.cold', { hasText: '親潮' })).toBeAttached();
  await expect(page.locator('.current-label.meet').first()).toBeAttached();
  // 凡例と表示切りかえ
  await page.getByTestId('legend-btn').click();
  await expect(page.getByTestId('legend-sheet')).toContainText('大陸棚');
  await expect(page.getByTestId('legend-sheet')).toContainText('海溝');
  await page.getByTestId('layer-currents').click();
  await expect(page.getByTestId('layer-currents')).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('layer-currents').click();
  await page.keyboard.press('Escape');
  // 世界へ引く → 日本へ戻る
  await page.getByTestId('view-world').click();
  await expect.poll(() => page.evaluate(() => (window as W).__sm!.scene.info().view), { timeout: 15_000 }).toBe('world');
  await expect(page.getByTestId('view-world')).toHaveAttribute('aria-pressed', 'true');
  // 日付変更線の上にも海がある（地図の端がない）
  await page.evaluate(() => (window as W).__sm!.scene.flyTo(180, 0, 160, 10));
  await page.waitForTimeout(800);
  const center = await page.evaluate(() => {
    const c = document.querySelector('canvas.map-canvas') as HTMLCanvasElement;
    const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
    const x = t.getContext('2d')!; x.drawImage(c, 0, 0);
    return Array.from(x.getImageData(c.width / 2, c.height / 2, 1, 1).data);
  });
  expect(center[2]).toBeGreaterThan(40); // 青い海（宇宙の黒ではない）
  await page.getByTestId('view-japan').click();
  await expect.poll(() => page.evaluate(() => (window as W).__sm!.scene.info().view), { timeout: 15_000 }).toBe('detail');
});

test('4. 入力するとピンが浮き上がり、同じ魚は大きく、別の魚は別のピンになる', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await addEntry(page, 'さけ', '北海道', { method: '天然' });
  const salmon = page.locator('.pin[data-key="hokkaido|salmon"]');
  await expect(salmon).toBeVisible();
  await expect(salmon.locator('.pin-name')).toContainText('さけ');
  await expect(salmon.locator('img.pin-photo')).toHaveJSProperty('complete', true);
  await expect(salmon.locator('.pin-count')).toHaveText('1');
  const s1 = Number(await salmon.evaluate((e) => getComputedStyle(e).getPropertyValue('--s')));
  await addEntry(page, 'さけ', 'ほっかいどう');
  await expect(salmon.locator('.pin-count')).toHaveText('2');
  const s2 = Number(await salmon.evaluate((e) => getComputedStyle(e).getPropertyValue('--s')));
  expect(s2).toBeGreaterThan(s1);
  // 同じ北海道でも、さんま・ほたては別のピン
  await addEntry(page, 'さんま', '北海道');
  await addEntry(page, 'ほたて', '北海道');
  const hk = page.locator('.pin[data-place=hokkaido]');
  await expect(hk).toHaveCount(3);
  await expect(page.locator('.pin[data-key="hokkaido|saury"] .pin-count')).toHaveText('1');
  await expect(page.locator('.pin[data-key="hokkaido|scallop"]')).toBeVisible();
  // 重ならずに縦に並ぶ
  const ys = await hk.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.top, r.bottom]));
  ys.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ys.length; i++) expect(ys[i][0]).toBeGreaterThanOrEqual(ys[i - 1][1] - 2);
  await expect(page.getByTestId('total')).toHaveText('4');
  // ピンをタップすると、その産地の魚が一覧で出る
  await page.locator('.pin[data-key="hokkaido|saury"]').click();
  const sheet = page.getByTestId('pin-sheet');
  await expect(sheet).toContainText('3種類・4件');
  await expect(sheet.locator('.pin-item.on')).toContainText('さんま');
});

test('5. 値札の文字から読み取り、国内・外国で絞り込む', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await addEntry(page, 'さば', '銚子');
  await page.getByTestId('fab').click();
  const sheet = page.getByTestId('add-sheet');
  await sheet.getByTestId('tag-input').fill('チリ産 銀鮭 養殖 解凍');
  await sheet.getByTestId('parse').click();
  await expect(sheet.getByTestId('parse-out')).toContainText('産地：チリ');
  await expect(sheet.getByTestId('fish-input')).toHaveValue('さけ・サーモン');
  await expect(sheet.getByRole('button', { name: '養殖', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByTestId('submit').click();
  // 外国の入力なので、地球儀を引いてチリへ飛ぶ
  await expect.poll(() => page.evaluate(() => (window as W).__sm!.scene.info().view), { timeout: 15_000 }).toBe('world');
  const chile = page.locator('.pin[data-key="chile|salmon"]');
  const japan = page.locator('.pin[data-key="japan|mackerel"]');
  await expect(chile).toBeVisible();
  await expect(japan).toBeAttached();
  await page.locator('[data-filter=domestic]').click();
  await expect(chile).toHaveClass(/dim/);
  await expect(japan).not.toHaveClass(/dim/);
  await page.locator('[data-filter=farmed]').click();
  await expect(chile).not.toHaveClass(/dim/);
  await expect(japan).toHaveClass(/dim/);
});

test('6. タスクはなく、以前のタスクも消える。メモはシートで使える', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sm.cards', JSON.stringify([
      { id: 'seed0', text: '値札の産地を確かめる', status: 'todo', createdAt: 1 },
      { id: 'seed1', text: '次に調べたいことを書く', status: 'done', createdAt: 2 },
      { id: 'cold1', text: '北の魚は寒流と関係ありそう', status: 'memo', createdAt: 3 },
    ]));
    localStorage.setItem('sm.seeded', 'true');
  });
  await page.goto('/');
  await ready(page);
  await expect(page.locator('[data-tab]')).toHaveCount(3);
  await expect(page.locator('[data-tab=tasks]')).toHaveCount(0);
  await expect(page.locator('#memo-count')).toHaveText('1');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sm.cards') || '[]'));
  expect(stored.map((c: { id: string }) => c.id)).toEqual(['cold1']);
  await page.locator('[data-tab=sheet]').click();
  const memo = page.locator('[data-memo=cold1]');
  await expect(memo).toContainText('寒流');
  await memo.getByRole('button', { name: '02 予想へ' }).click();
  await expect(page.getByTestId('ws-reason')).toHaveValue('北の魚は寒流と関係ありそう');
  await memo.getByRole('button', { name: 'このメモを消す' }).click();
  await expect(page.locator('[data-memo]')).toHaveCount(0);
  await expect(page.locator('#memo-count')).toHaveText('0');
  await page.getByTestId('toast').getByRole('button', { name: 'もとにもどす' }).click();
  await expect(page.locator('[data-memo=cold1]')).toBeVisible();
  // 新しいメモはすぐ一覧に入る
  await page.locator('#memo').fill('チリのサーモンは養殖');
  await page.locator('#memo').press('Enter');
  await expect(page.locator('[data-memo]')).toHaveCount(2);
});

test('7. 図鑑のアコーディオンと地図の連動', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.locator('[data-tab=zukan]').click();
  const item = page.locator('[data-fish=mackerel]');
  const head = item.locator('.acc-head');
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(item.locator('.why')).toBeVisible();
  // 実際の写真と出典
  const hero = item.locator('.hero img');
  await expect(hero).toBeVisible();
  await expect.poll(() => hero.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(300);
  await expect(item.locator('.hero figcaption')).toContainText('CC');
  await expect(page.locator('[data-fish=salmon] .ic.photo img')).toBeAttached();
  await expect(item).toContainText('ノルウェー');
  await expect.poll(async () => (await item.locator('.acc-body').boundingBox())!.height).toBeGreaterThan(150);
  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await item.locator('.acc-body').boundingBox())!.height).toBeLessThan(2);
  // 「地図で産地を見る」
  await head.click();
  await page.getByTestId('show-mackerel').click();
  await expect(page.locator('.focus-chip')).toContainText('さば');
  await expect(page.locator('.ghost').first()).toBeAttached();
  expect(await page.locator('.ghost').count()).toBeGreaterThanOrEqual(3);
});

test('8. 2台の端末でリアルタイムに集まる', async ({ browser }) => {
  const opts = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
  const A = await (await browser.newContext(opts)).newPage();
  const B = await (await browser.newContext(opts)).newPage();
  await A.goto('/');
  await ready(A);
  await A.getByTestId('room-btn').click();
  await A.getByTestId('create-room').click();
  const code = (await A.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await expect(A.getByTestId('room-sheet')).toContainText('つながっています');
  await A.keyboard.press('Escape');

  await B.goto(`/?room=${code}`);
  await ready(B);
  await expect(B.getByTestId('room-btn')).toContainText(code);
  await expect(B.locator('.status-dot.live')).toBeVisible();

  await addEntry(A, 'かき', '広島');
  await expect(B.locator('.pin[data-key="hiroshima|oyster"]')).toBeVisible({ timeout: 10_000 });
  await expect(B.getByTestId('total')).toHaveText('1');
  await addEntry(B, 'かき', '広島');
  await expect(A.locator('.pin[data-key="hiroshima|oyster"] .pin-count')).toHaveText('2', { timeout: 10_000 });
  // 再読み込みしてもサーバーから戻る
  await B.reload();
  await ready(B);
  await expect(B.getByTestId('total')).toHaveText('2');
  // 人数
  await A.getByTestId('room-btn').click();
  await expect(A.getByTestId('room-sheet')).toContainText('2台');
  await A.context().close();
  await B.context().close();
});

test('9. AIが使えなくてもワークシートが動く（事実・問いのたね・印刷用）', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const health = await page.evaluate(() => fetch('/api/health').then((r) => r.json()));
  expect(health.ai).toBe(false);
  await addEntry(page, 'さけ', 'チリ');
  await addEntry(page, 'さんま', '根室');
  await page.locator('[data-tab=sheet]').click();
  await page.getByTestId('pick-facts').click();
  await expect(page.getByTestId('ws-fact')).toHaveValue(/国内が1件/);
  await page.getByTestId('seeds').click();
  const seeds = page.getByTestId('seed-list').locator('button');
  await expect(seeds.first()).toBeVisible();
  const q = await seeds.first().textContent();
  expect(q).toMatch(/？$/);
  await seeds.first().click();
  await expect(page.getByTestId('ws-next')).toHaveValue(q!);
  await page.locator('.starters button').first().click();
  await expect(page.getByTestId('ws-reason')).not.toHaveValue('');
  await page.reload();
  await ready(page);
  await page.locator('[data-tab=sheet]').click();
  await expect(page.getByTestId('ws-next')).toHaveValue(q!);
});

test('10. 横スクロールなし・全タブでレイアウトが崩れない', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  for (const t of ['map', 'zukan', 'sheet']) {
    await page.locator(`[data-tab=${t}]`).click();
    await page.waitForTimeout(450);
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
    expect(o.sw, t).toBeLessThanOrEqual(o.w);
    await expect(page.locator(`[data-tab=${t}]`)).toHaveAttribute('aria-current', 'page');
  }
  // タブバーとメモ欄は常に見える
  await expect(page.locator('.tabbar')).toBeInViewport();
  await expect(page.locator('#memo')).toBeInViewport();
});

test('11. 先生がクラスをつくると大きなQRコードが出て、読み取るとそのクラスのリンクになる', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.getByTestId('room-btn').click();
  await page.getByTestId('create-room').click();
  const big = page.getByTestId('qr-big');
  await expect(big).toBeVisible();
  await page.waitForTimeout(900); // 出てくるアニメーションが終わるまで
  const code = (await big.locator('.code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  // 画面に映ったQRコードを実際に読み取る
  const png = await page.getByTestId('qr-big-svg').screenshot();
  const { PNG } = await import('pngjs');
  const jsQR = (await import('jsqr')).default;
  const img = PNG.sync.read(png);
  const text = jsQR(new Uint8ClampedArray(img.data), img.width, img.height)?.data;
  expect(text).toBe(`http://127.0.0.1:8787/?room=${code}`);
  await page.keyboard.press('Escape');
  await expect(big).toHaveCount(0);
  // クラスのシートからも大きく出せる
  await page.getByTestId('room-btn').click();
  await expect(page.getByTestId('room-qr')).toBeVisible();
  await page.getByTestId('qr-big-btn').click();
  await expect(page.getByTestId('qr-big')).toBeVisible();
});

test('12. アプリのカメラでQRコードを読み取ってクラスに参加できる', async ({ playwright }) => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const qrcode = (await import('qrcode-generator')).default;
  const room = await (await fetch('http://127.0.0.1:8787/api/rooms', { method: 'POST', body: '{}' })).json();
  // 参加用QRコードを写した「カメラ映像」（Y4M形式）を作り、偽のカメラとして渡す
  const q = qrcode(0, 'M');
  q.addData(`http://127.0.0.1:8787/?room=${room.code}`);
  q.make();
  const W = 640, H = 480, n = q.getModuleCount(), cell = Math.floor(400 / (n + 8)), size = cell * (n + 8);
  const ox = (W - size) / 2 | 0, oy = (H - size) / 2 | 0;
  const Y = Buffer.alloc(W * H, 235);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = Math.floor(y / cell) - 4, c = Math.floor(x / cell) - 4;
    if (r >= 0 && c >= 0 && r < n && c < n && q.isDark(r, c)) Y[(oy + y) * W + ox + x] = 16;
  }
  const UV = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const frames = Array.from({ length: 20 }, () => Buffer.concat([Buffer.from('FRAME\n'), Y, UV]));
  // Chrome は日本語を含むパスの映像ファイルを開けないため、英数字だけの一時フォルダに置く
  const os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suisan-cam-'));
  const y4m = path.join(dir, 'qr.y4m');
  fs.writeFileSync(y4m, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...frames]));
  const b = await playwright.chromium.launch({
    executablePath: process.env.PW_CHROME_PATH || undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`],
  });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['camera'] });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8787/');
  await ready(page);
  await page.getByTestId('room-btn').click();
  await page.getByTestId('scan-btn').click();
  await expect(page.getByTestId('qr-scan')).toBeVisible();
  await expect(page.getByTestId('room-btn')).toContainText(room.code, { timeout: 20_000 });
  await expect(page.getByTestId('qr-scan')).toHaveCount(0);
  await expect(page.locator('.status-dot.live')).toBeVisible();
  await b.close();
});

test('13. 60人が同時に入力しても、すぐに全部が地球儀に出る', async ({ page }) => {
  const room = await (await fetch('http://127.0.0.1:8787/api/rooms', { method: 'POST', body: '{}' })).json();
  await page.goto(`/?room=${room.code}`);
  await ready(page);
  await expect(page.locator('.status-dot.live')).toBeVisible();
  // ほかの59人分の端末
  const places = ['hokkaido', 'miyagi', 'chiba', 'shizuoka', 'nagasaki', 'kagoshima', 'hiroshima', 'kochi'];
  const fish = ['salmon', 'mackerel', 'saury', 'tuna', 'scallop', 'oyster', 'bonito', 'yellowtail'];
  const socks = await Promise.all(Array.from({ length: 59 }, () => new Promise<WebSocket>((res, rej) => {
    const w = new WebSocket(`ws://127.0.0.1:8787/api/rooms/${room.code}/ws`);
    w.onopen = () => res(w);
    w.onerror = () => rej(new Error('ws'));
  })));
  const t0 = Date.now();
  socks.forEach((w, i) => {
    for (let k = 0; k < 3; k++) {
      w.send(JSON.stringify({ type: 'add', entry: { id: `L${i}x${k}${Date.now().toString(36)}`, fishId: fish[(i + k) % 8], fishName: 'x', placeId: places[(i * 2 + k) % 8], method: 'unknown', group: (i % 8) + 1, at: Date.now(), device: `dsim${i}` } }));
    }
  });
  await expect(page.getByTestId('total')).toHaveText('177', { timeout: 10_000 });
  const ms = Date.now() - t0;
  console.log(`59台・177件がこの端末の画面に出るまで ${ms} ms`);
  expect(ms).toBeLessThan(3000);
  // この端末からも入力できる
  await addEntry(page, 'さけ', '北海道');
  await expect(page.getByTestId('total')).toHaveText('178');
  // 産地×魚のピンが出ている
  expect(await page.locator('.pin').count()).toBeGreaterThan(20);
  await expect(page.locator('#memo')).toBeEditable();
  socks.forEach((w) => w.close());
});
