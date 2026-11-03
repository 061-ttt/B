import { test, expect, type Page } from '@playwright/test';

type W = Window & { __sm?: { scene: { frames: number; info(): Record<string, number | string | Record<string, number>>; arrowSample(): string; flyTo(lon: number, lat: number, d?: number, dur?: number): void } } };

async function ready(page: Page) {
  await expect(page.locator('#skeleton')).toHaveCount(0, { timeout: 45_000 });
  // はじめに（案内画面）が出ていれば閉じる
  const start = page.getByTestId('intro-start');
  if (await start.isVisible()) await start.click();
  await expect(page.getByTestId('intro')).toHaveCount(0);
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

test('1. メモ欄・印刷はなく、絞り込みは「すべて・暖流の魚・寒流の魚」だけ', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sm.cards', JSON.stringify([{ id: 'old', text: '前の版のメモ', status: 'memo', createdAt: 1 }]));
  });
  await page.goto('/');
  await ready(page);
  await expect(page.locator('#memo')).toHaveCount(0);
  await expect(page.locator('#memo-count')).toHaveCount(0);
  await expect(page.locator('.chips [data-filter]')).toHaveText(['すべて', '暖流の魚', '寒流の魚']);
  // 以前の版のメモのデータも残らない
  expect(await page.evaluate(() => localStorage.getItem('sm.cards'))).toBeNull();
  await page.locator('[data-tab=sheet]').click();
  await expect(page.getByTestId('memo-list')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '印刷' })).toHaveCount(0);
  await expect(page.getByTestId('sheet')).not.toContainText('メモ');
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
  // 日本の主な漁場（8つ）が、ほかの名前と重ならずに出ている
  await expect(page.locator('.ground-label')).toHaveCount(8);
  await expect.poll(() => page.locator('.ground-label:not(.hid)').count(), { timeout: 8000 }).toBe(8);
  for (const n of ['三陸沖', '大和堆', '東シナ海の大陸棚']) await expect(page.locator('.ground-label', { hasText: n })).toBeVisible();
  // 地図の上に、海の深さの色の見方（4段）
  await expect(page.getByTestId('depth-scale')).toContainText('大陸棚');
  await expect(page.getByTestId('depth-scale').locator('.ds-bar i')).toHaveCount(4);
  // 凡例と表示切りかえ
  await page.getByTestId('legend-btn').click();
  await expect(page.getByTestId('legend-sheet')).toContainText('漁場');
  await expect(page.getByTestId('legend-sheet')).toContainText('大陸棚');
  await expect(page.getByTestId('legend-sheet')).toContainText('海溝');
  await page.getByTestId('layer-depth').click();
  await expect(page.getByTestId('depth-scale')).toHaveCount(0);
  await page.getByTestId('layer-depth').click();
  await expect(page.getByTestId('depth-scale')).toBeVisible();
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
  // 立体の魚（切り抜きフィギュア）が地球儀の上に立っている
  await expect.poll(() => page.evaluate(() => Number((window as W).__sm!.scene.info().figs))).toBe(1);
  const figW = () => page.evaluate(() => ((window as W).__sm!.scene.info().figW as Record<string, number>)['hokkaido|salmon']);
  await expect.poll(figW).toBeGreaterThan(30);
  await page.waitForTimeout(800);
  const w1 = await figW();
  await expect(salmon.locator('.pin-count')).toHaveText('1');
  const s1 = Number(await salmon.evaluate((e) => getComputedStyle(e).getPropertyValue('--s')));
  await addEntry(page, 'さけ', 'ほっかいどう');
  await expect(salmon.locator('.pin-count')).toHaveText('2');
  const s2 = Number(await salmon.evaluate((e) => getComputedStyle(e).getPropertyValue('--s')));
  expect(s2).toBeGreaterThan(s1);
  // フィギュアそのものも大きくなる
  await page.waitForTimeout(900);
  expect(await figW()).toBeGreaterThan(w1 * 1.1);
  // 同じ北海道でも、さんま・ほたては別のピン
  await addEntry(page, 'さんま', '北海道');
  await addEntry(page, 'ほたて', '北海道');
  const hk = page.locator('.pin[data-place=hokkaido]');
  await expect(hk).toHaveCount(3);
  await expect(page.locator('.pin[data-key="hokkaido|saury"] .pin-count')).toHaveText('1');
  await expect(page.locator('.pin[data-key="hokkaido|scallop"]')).toBeVisible();
  // 名札が重ならずに並ぶ
  await page.waitForTimeout(900);
  const rs = await page.locator('.pin[data-place=hokkaido] .pin-tag').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const [a, b] = [rs[i], rs[j]];
    const overlap = a[0] < b[2] - 2 && b[0] < a[2] - 2 && a[1] < b[3] - 2 && b[1] < a[3] - 2;
    expect(overlap, `${i} と ${j} の名札が重なっている`).toBe(false);
  }
  // 3種類とも立体の魚が立っている
  await expect.poll(() => page.evaluate(() => Number((window as W).__sm!.scene.info().figs))).toBe(3);
  await expect(page.getByTestId('total')).toHaveText('4');
  // ピンをタップすると、その産地の魚が一覧で出る
  await page.locator('.pin[data-key="hokkaido|saury"]').click();
  const sheet = page.getByTestId('pin-sheet');
  await expect(sheet).toContainText('3種類・4件');
  await expect(sheet.locator('.pin-item.on')).toContainText('さんま');
});

test('5. 値札の文字から読み取り、暖流・寒流の魚で絞り込む', async ({ page }) => {
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
  // さけ＝寒流の魚、さば＝暖流の魚
  await page.locator('[data-filter=warm]').click();
  await expect(chile).toHaveClass(/dim/);
  await expect(japan).not.toHaveClass(/dim/);
  await page.locator('[data-filter=cold]').click();
  await expect(chile).not.toHaveClass(/dim/);
  await expect(japan).toHaveClass(/dim/);
  await page.locator('[data-filter=all]').click();
  await expect(chile).not.toHaveClass(/dim/);
  await expect(japan).not.toHaveClass(/dim/);
});

test('6. シートは自分のタブレットだけ、地球儀の魚はクラスで共有', async ({ browser }) => {
  const opts = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
  const room = await (await fetch('http://127.0.0.1:8787/api/rooms', { method: 'POST', body: '{}' })).json();
  const A = await (await browser.newContext(opts)).newPage();
  const B = await (await browser.newContext(opts)).newPage();
  const pause = (p: typeof A) => p.evaluate(() => (window as unknown as { __sm: { scene: { setActive(on: boolean): void } } }).__sm.scene.setActive(false));
  const sent: string[] = [];
  for (const p of [A, B]) p.on('websocket', (ws) => ws.on('framesent', (f) => sent.push(String(f.payload))));
  await A.goto(`/?room=${room.code}`);
  await ready(A);
  await pause(A);
  await B.goto(`/?room=${room.code}`);
  await ready(B);
  await pause(B);
  await expect(A.locator('.status-dot.live')).toBeVisible();
  await expect(B.locator('.status-dot.live')).toBeVisible();
  // A がシートに書く
  await A.locator('[data-tab=sheet]').click();
  await A.getByTestId('ws-fact').fill('北海道は寒流の魚が多い');
  await A.getByTestId('ws-reason').fill('親潮が流れているから');
  await A.getByTestId('ws-next').fill('なぜ親潮の近くは魚が多いのか');
  await A.locator('.checks input').first().check();
  // B のシートには出ない
  await B.locator('[data-tab=sheet]').click();
  await expect(B.getByTestId('ws-fact')).toHaveValue('');
  await expect(B.getByTestId('ws-reason')).toHaveValue('');
  await expect(B.getByTestId('ws-next')).toHaveValue('');
  await expect(B.locator('.checks input').first()).not.toBeChecked();
  // A を開き直しても自分の内容は残る
  await A.reload();
  await ready(A);
  await pause(A);
  await A.locator('[data-tab=sheet]').click();
  await expect(A.getByTestId('ws-fact')).toHaveValue('北海道は寒流の魚が多い');
  await expect(A.locator('.checks input').first()).toBeChecked();
  // 地球儀の魚は共有される
  await A.locator('[data-tab=map]').click();
  await addEntry(A, 'さけ', '北海道');
  await B.locator('[data-tab=map]').click();
  await expect(B.getByTestId('total')).toHaveText('1', { timeout: 10_000 });
  // シートの文はサーバーに一度も送られていない
  expect(sent.join('\n')).not.toContain('親潮');
  expect(sent.join('\n')).toContain('salmon');
  await A.context().close();
  await B.context().close();
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
  // 一覧のアイコンは地球儀と同じ3Dフィギュア（45種すべて）
  await expect(page.locator('[data-fish] .ic.fig img')).toHaveCount(45);
  const ic = page.locator('[data-fish=salmon] .ic.fig img');
  await expect.poll(() => ic.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(100);
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
  // 2台目のページを開いたあとはキー入力がそちらへ行くことがあるので、Aを前に出してから閉じる
  await A.bringToFront();
  await A.keyboard.press('Escape');
  await expect(A.getByTestId('room-sheet')).not.toHaveClass(/(^|\s)on(\s|$)/);

  await B.goto(`/?room=${code}`);
  await ready(B);
  await expect(B.getByTestId('room-btn')).toContainText(code);
  await expect(B.locator('.status-dot.live')).toBeVisible();

  await addEntry(A, 'かき', '広島');
  await expect(B.locator('.pin[data-key="hiroshima|oyster"]')).toBeVisible({ timeout: 10_000 });
  await expect(B.getByTestId('total')).toHaveText('1');
  await addEntry(B, 'かき', '広島');
  await expect(A.locator('.pin[data-key="hiroshima|oyster"] .pin-count')).toHaveText('2', { timeout: 10_000 });
  // 再読み込みしてもサーバーから戻る（その間はAの描画を止めて、Bの読み込みにCPUを回す）
  await A.evaluate(() => (window as unknown as { __sm: { scene: { setActive(on: boolean): void } } }).__sm.scene.setActive(false));
  await B.reload();
  await ready(B);
  await expect(B.getByTestId('total')).toHaveText('2');
  await A.evaluate(() => (window as unknown as { __sm: { scene: { setActive(on: boolean): void } } }).__sm.scene.setActive(true));
  // 人数
  // テスト用の機械はGPUなし・CPU2つのため、2台分の地球儀を同時に描くと非常に重い。
  // 実際の授業では1台に1つずつなので、ここではBの描画を止めてAの操作を確かめる
  await B.evaluate(() => (window as unknown as { __sm: { scene: { setActive(on: boolean): void } } }).__sm.scene.setActive(false));
  await A.getByTestId('room-btn').click();
  await expect(A.getByTestId('room-sheet')).toContainText('2台');
  await A.context().close();
  await B.context().close();
});

test('9. AIが使えなくてもワークシートが動く（事実・問いのたね）', async ({ page }) => {
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
});

test('11. 先生がクラスをつくると大きなQRコードが出て、読み取るとそのクラスのリンクになる', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.getByTestId('room-btn').click();
  await page.getByTestId('create-room').click();
  const big = page.getByTestId('qr-big');
  await expect(big).toBeVisible();
  // 出てくるアニメーションが終わるまで待つ
  await page.getByTestId('qr-big-svg').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
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
  // テスト機はGPUがなく地球儀をCPUで描くため、実機より遅い。サーバーの配信自体は tests/load で0.3秒前後
  expect(ms).toBeLessThan(5000);
  // この端末からも入力できる
  await addEntry(page, 'さけ', '北海道');
  await expect(page.getByTestId('total')).toHaveText('178');
  // 産地×魚のピンが出ている
  expect(await page.locator('.pin').count()).toBeGreaterThan(20);
  socks.forEach((w) => w.close());
});

test('14. ひらまさ：図鑑で写真と情報が見られ、ぶりとは別のピンになる', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.locator('[data-tab=zukan]').click();
  await page.getByRole('searchbox', { name: '魚の名前でさがす' }).fill('ひらまさ');
  const item = page.locator('[data-fish=hiramasa]');
  await expect(item).toBeVisible();
  await expect(page.locator('[data-fish]')).toHaveCount(1);
  await item.locator('.acc-head').click();
  await expect(item.locator('.hero img')).toBeVisible();
  await expect.poll(() => item.locator('.hero img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(300);
  await expect(item).toContainText('旬');
  await expect(item).toContainText('春〜夏');
  await expect(item).toContainText('長崎');
  await expect(item.locator('.why')).toContainText('ぶり');
  // 地球儀では、同じ鹿児島でも ぶり と ひらまさ は別のピン
  await page.locator('[data-tab=map]').click();
  await addEntry(page, 'ぶり', '鹿児島');
  await addEntry(page, 'ひらまさ', '鹿児島');
  await expect(page.locator('.pin[data-key="kagoshima|yellowtail"]')).toBeVisible();
  await expect(page.locator('.pin[data-key="kagoshima|hiramasa"]')).toBeVisible();
  await expect(page.locator('.pin[data-key="kagoshima|hiramasa"] .pin-name')).toHaveText('ひらまさ');
});

test('15. はじめに：3DCGと番号カードの案内が出て、はじめるで地球儀へ。使い方ボタンでまた出る', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#skeleton')).toHaveCount(0, { timeout: 45_000 });
  const intro = page.getByTestId('intro');
  await expect(intro).toBeVisible();
  await expect(intro.locator('.intro-title')).toContainText('水産業の');
  await expect(intro.locator('.step')).toHaveCount(4);
  await expect(intro.locator('.step .num')).toHaveText(['01', '02', '03', '04']);
  // 画像がすべて読みこまれている
  for (const img of await intro.locator('img').all()) await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(100);
  // 横にはみ出さない（キャラクターの画像の飾りの部分以外）
  const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, w: innerWidth,
    right: Math.max(...[...document.querySelectorAll('.intro-title, .intro-sub, .intro-badge, .step, .intro-cta .btn')].map((e) => e.getBoundingClientRect().right)),
  }));
  expect(o.sw).toBeLessThanOrEqual(o.w);
  expect(o.right).toBeLessThanOrEqual(o.w);
  await page.getByTestId('intro-start').click();
  await expect(intro).toHaveCount(0);
  // 開き直しても、同じタブでは出ない
  await page.reload();
  await expect(page.locator('#skeleton')).toHaveCount(0, { timeout: 45_000 });
  await expect(intro).toHaveCount(0);
  await page.getByTestId('help-btn').click();
  await expect(intro).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(intro).toHaveCount(0);
});

test('16. 1つの県に15種類あっても重ならない。地球儀を回しても、向こう側へ行くまでフィギュアが消えない', async ({ page }) => {
  const room = await (await fetch('http://127.0.0.1:8787/api/rooms', { method: 'POST', body: '{}' })).json();
  await page.goto(`/?room=${room.code}`);
  await ready(page);
  await expect(page.locator('.status-dot.live')).toBeVisible();
  const fish = ['fugu', 'anglerfish', 'seabream', 'mackerel', 'horse-mackerel', 'squid', 'yellowtail', 'tachiuo', 'anago', 'sawara', 'shrimp', 'oyster', 'wakame', 'hijiki', 'hamaguri'];
  const w = await new Promise<WebSocket>((res) => { const s = new WebSocket(`ws://127.0.0.1:8787/api/rooms/${room.code}/ws`); s.onopen = () => res(s); });
  fish.forEach((f, i) => {
    for (let k = 0; k < (f === 'fugu' ? 4 : 1); k++) w.send(JSON.stringify({ type: 'add', entry: { id: `Y${i}k${k}${Date.now().toString(36)}`, fishId: f, fishName: 'x', placeId: 'yamaguchi', method: 'unknown', group: 1, at: Date.now(), device: 'dsimY' } }));
  });
  await expect(page.getByTestId('total')).toHaveText('18', { timeout: 10_000 });
  await expect(page.locator('.pin[data-place=yamaguchi]')).toHaveCount(15);
  await page.getByTestId('view-japan').click();
  await page.waitForTimeout(3000);
  const info = () => page.evaluate(() => (window as W).__sm!.scene.info());
  // 日本全体を見ているときは、多い順に4種だけ名札を出し、残りは「ほか11種」
  expect(Number((await info()).tags)).toBe(4);
  await expect(page.locator('.pin[data-key="yamaguchi|fugu"] .pin-place')).toHaveText('山口・ほか11種');
  // フィギュアは小さめ（1件の魚は画面で幅60px以下）
  const figW = (await info()).figW as Record<string, number>;
  expect(figW['yamaguchi|anago']).toBeLessThan(60);
  expect(figW['yamaguchi|fugu']).toBeGreaterThan(figW['yamaguchi|anago']);
  // 出ている名札どうしが重ならない
  const rs = await page.locator('.pin:not(.mini) .pin-tag').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const [a, b] = [rs[i], rs[j]];
    expect(a[0] < b[2] - 2 && b[0] < a[2] - 2 && a[1] < b[3] - 2 && b[1] < a[3] - 2, `${i} と ${j} の名札が重なっている`).toBe(false);
  }
  // 山口に寄ると、15種すべての名札が出る
  await page.evaluate(() => (window as W).__sm!.scene.flyTo(131.5, 34.2, 135, 10));
  await expect.poll(async () => Number((await info()).tags), { timeout: 8000 }).toBe(15);
  // 地球儀を回して山口が地球のふちの近くに来ても、フィギュアは全部出ている
  await page.evaluate(() => (window as W).__sm!.scene.flyTo(131.5, -36, 330, 10));
  await page.waitForTimeout(1500);
  expect(Number((await info()).figVis)).toBe(15);
  // 地球の向こう側へ回ると見えなくなる
  await page.evaluate(() => (window as W).__sm!.scene.flyTo(-48, -34, 330, 10));
  await expect.poll(async () => Number((await info()).figVis), { timeout: 8000 }).toBe(0);
  w.close();
});

test('17. データはリセットするまで残る。クラスのリセットは先生の端末だけで、全員の画面から消える', async ({ browser }) => {
  // 2台分を順に動かすので長め（テスト機はCPU2つ・GPUなし）
  test.setTimeout(300_000);
  const API = 'http://127.0.0.1:8787';
  const room = await (await fetch(`${API}/api/rooms`, { method: 'POST', body: '{}' })).json() as { code: string; teacherKey: string };
  const opts = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
  const pause = (p: Page, on: boolean) => p.evaluate((on) => (window as unknown as { __sm: { scene: { setActive(on: boolean): void } } }).__sm.scene.setActive(on), on);
  // 先生の端末（クラスを作ったときのかぎを持っている）
  const T = await (await browser.newContext(opts)).newPage();
  await T.addInitScript(([code, key]) => { if (!localStorage.getItem('sm.teacherKeys')) localStorage.setItem('sm.teacherKeys', JSON.stringify({ [code]: key })); }, [room.code, room.teacherKey]);
  await T.goto(`/?room=${room.code}`);
  await ready(T);
  await expect(T.locator('.status-dot.live')).toBeVisible();
  await pause(T, false);
  // 子どもの端末
  const S = await (await browser.newContext(opts)).newPage();
  await S.goto(`/?room=${room.code}`);
  await ready(S);
  await expect(S.locator('.status-dot.live')).toBeVisible();
  await addEntry(S, 'さば', '銚子');
  await addEntry(S, 'ふぐ', '山口');
  await expect(T.getByTestId('total')).toHaveText('2', { timeout: 10_000 });
  // シートにも書いておく
  await S.locator('[data-tab=sheet]').click();
  await S.getByTestId('ws-fact').fill('山口にふぐが集まっている');
  // 読み込み直しても、クラスのデータもシートも残っている
  await S.reload();
  await ready(S);
  await expect(S.getByTestId('total')).toHaveText('2');
  await S.locator('[data-tab=sheet]').click();
  await expect(S.getByTestId('ws-fact')).toHaveValue('山口にふぐが集まっている');
  // サーバーにも残っている（期限で消すアラームは予約しない）
  expect(((await (await fetch(`${API}/api/rooms/${room.code}`)).json()) as { entries: unknown[] }).entries).toHaveLength(2);
  // 子どもの端末にはクラスのリセットボタンがない
  await S.locator('[data-tab=map]').click();
  await S.getByTestId('room-btn').click();
  await expect(S.getByTestId('room-sheet')).toContainText('先生がリセットするまで残ります');
  await expect(S.getByTestId('reset-class')).toHaveCount(0);
  await S.bringToFront();
  await S.keyboard.press('Escape');
  await expect(S.getByTestId('room-sheet')).not.toHaveClass(/(^|\s)on(\s|$)/);
  // かぎがなければサーバーもリセットを受け付けない
  expect((await fetch(`${API}/api/rooms/${room.code}/reset`, { method: 'POST', body: JSON.stringify({ key: 'wrong' }) })).status).toBe(403);
  // 先生がリセット（2回たしかめる）
  await pause(S, false);
  await pause(T, true);
  await T.bringToFront();
  await T.getByTestId('room-btn').click();
  await T.getByTestId('reset-class').click();
  await expect(T.getByTestId('reset-class-ask')).toContainText('2件');
  await T.getByTestId('reset-class-ok').click();
  await expect(T.getByTestId('total')).toHaveText('0');
  await expect(S.getByTestId('total')).toHaveText('0', { timeout: 10_000 });
  await expect(S.locator('.pin')).toHaveCount(0);
  await S.bringToFront();
  // シートは消えない
  await S.locator('[data-tab=sheet]').click();
  await expect(S.getByTestId('ws-fact')).toHaveValue('山口にふぐが集まっている');
  // リセット前に入力して送れずに残っていたものが後から届いても、もどらない
  const st = (await (await fetch(`${API}/api/rooms/${room.code}`)).json()) as { resetAt: number };
  const old = await fetch(`${API}/api/rooms/${room.code}/entries`, { method: 'POST', body: JSON.stringify({ id: `old${Date.now().toString(36)}`, fishId: 'tuna', fishName: 'まぐろ', placeId: 'shizuoka', method: 'unknown', group: 1, at: Date.now(), device: 'dold' }) });
  expect(old.status).toBe(409);
  // リセットのあとの入力はふつうに集まる
  await S.locator('[data-tab=map]').click();
  await pause(T, false);
  await pause(S, true);
  await addEntry(S, 'かき', '広島');
  await expect.poll(async () => ((await (await fetch(`${API}/api/rooms/${room.code}`)).json()) as { entries: { gen?: number }[] }).entries.map((e) => e.gen)).toEqual([st.resetAt]);
  // シートのリセット
  await S.locator('[data-tab=sheet]').click();
  await S.getByTestId('reset-sheet').click();
  await S.getByTestId('reset-sheet-ok').click();
  await expect(S.getByTestId('ws-fact')).toHaveValue('');
  await T.context().close();
  await S.context().close();
});

test('18. この端末だけで使うときも、リセットするまで残る', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await addEntry(page, 'まぐろ', '静岡');
  await expect(page.getByTestId('total')).toHaveText('1');
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('total')).toHaveText('1');
  await page.getByTestId('room-btn').click();
  await expect(page.getByTestId('room-sheet')).toContainText('リセットするまで残ります');
  await page.getByTestId('reset-local').click();
  await page.getByTestId('reset-local-ok').click();
  await expect(page.getByTestId('total')).toHaveText('0');
  await page.reload();
  await ready(page);
  await expect(page.getByTestId('total')).toHaveText('0');
});
