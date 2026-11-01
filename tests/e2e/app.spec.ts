import { test, expect, type Page } from '@playwright/test';

type W = Window & { __sm?: { scene: { frames: number; info(): Record<string, number | string>; current: { warmMesh: { instanceMatrix: { array: Float32Array } } } } } };

async function ready(page: Page) {
  await expect(page.locator('#skeleton')).toHaveCount(0, { timeout: 30_000 });
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
  await page.locator('[data-tab=tasks]').click();
  await expect(page.locator('[data-lane=memo] .tx', { hasText: 'サーモンはチリが多い？' })).toBeVisible();
  await expect(page.locator('#memo-count')).toHaveText('6'); // メモ1＋授業の流れ5
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

test('3. 立体地図・海流アニメーション・潮目・深さ', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const info = await page.evaluate(() => (window as W).__sm!.scene.info());
  expect(info.view).toBe('japan');
  expect(Number(info.warm)).toBeGreaterThan(30);
  expect(Number(info.cold)).toBeGreaterThan(15);
  expect(Number(info.meet)).toBeGreaterThanOrEqual(1);
  // 矢印が時間とともに動く
  const read = () => page.evaluate(() => Array.from((window as W).__sm!.scene.current.warmMesh.instanceMatrix.array.slice(12, 15)).join(','));
  const m1 = await read();
  await expect.poll(read, { timeout: 8000 }).not.toBe(m1);
  // 画面も変化している
  const canvas = page.locator('canvas.map-canvas');
  const a = await canvas.screenshot();
  await expect.poll(async () => Buffer.compare(a, await canvas.screenshot()), { timeout: 8000 }).not.toBe(0);
  // 名前ラベル
  await expect(page.locator('.current-label.warm', { hasText: '黒潮' })).toBeAttached();
  await expect(page.locator('.current-label.cold', { hasText: '親潮' })).toBeAttached();
  await expect(page.locator('.current-label.meet')).toBeAttached();
  // 深さの凡例と表示切りかえ
  await page.getByTestId('legend-btn').click();
  await expect(page.getByTestId('legend-sheet')).toContainText('大陸棚');
  await expect(page.getByTestId('legend-sheet')).toContainText('海溝');
  await page.getByTestId('layer-currents').click();
  await expect(page.getByTestId('layer-currents')).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('layer-currents').click();
  await page.keyboard.press('Escape');
  // 世界地図
  await page.getByTestId('view-world').click();
  await expect.poll(() => page.evaluate(() => (window as W).__sm!.scene.info().view)).toBe('world');
  const wi = await page.evaluate(() => (window as W).__sm!.scene.info());
  expect(Number(wi.meet)).toBeGreaterThanOrEqual(3);
});

test('4. 入力するとピンが浮き上がり、件数で大きくなる', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await addEntry(page, 'さけ', '北海道', { method: '天然' });
  const pin = page.locator('.pin[data-key=hokkaido]');
  await expect(pin).toBeVisible();
  await expect(pin.locator('.pin-name')).toContainText('さけ');
  await expect(pin.locator('.pin-count')).toHaveText('1');
  const s1 = Number(await pin.evaluate((e) => getComputedStyle(e).getPropertyValue('--s')));
  await addEntry(page, 'さんま', 'ほっかいどう');
  await addEntry(page, 'ほたて', '北海道');
  await expect(pin.locator('.pin-count')).toHaveText('3');
  const s3 = Number(await pin.evaluate((e) => getComputedStyle(e).getPropertyValue('--s')));
  expect(s3).toBeGreaterThan(s1);
  await expect(page.getByTestId('total')).toHaveText('3');
  // ピンをタップすると内訳
  await pin.click();
  await expect(page.getByTestId('pin-sheet')).toContainText('さんま');
  await expect(page.getByTestId('pin-sheet')).toContainText('3件');
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
  // 外国の入力なので世界地図へ切りかわる
  await expect.poll(() => page.evaluate(() => (window as W).__sm!.scene.info().view)).toBe('world');
  await expect(page.locator('.pin[data-key=chile]')).toBeVisible();
  await expect(page.locator('.pin[data-key=japan]')).toBeAttached();
  await page.locator('[data-filter=domestic]').click();
  await expect(page.locator('.pin[data-key=chile]')).toHaveClass(/dim/);
  await expect(page.locator('.pin[data-key=japan]')).not.toHaveClass(/dim/);
  await page.locator('[data-filter=farmed]').click();
  await expect(page.locator('.pin[data-key=chile]')).not.toHaveClass(/dim/);
  await expect(page.locator('.pin[data-key=japan]')).toHaveClass(/dim/);
});

async function flick(page: Page, card: ReturnType<Page['locator']>, dx: number) {
  await card.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(650); // 入場アニメーションが終わるのを待つ
  const b = (await card.boundingBox())!;
  const y = b.y + b.height / 2, x = b.x + b.width / 2 - dx / 3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + (dx * i) / 10, y + i * 0.3);
  await page.mouse.up();
}

test('6. フリックでタスクのステータスを進める・戻す', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.locator('[data-tab=tasks]').click();
  const panel = page.getByTestId('tasks');
  await expect(panel).toHaveClass(/(^|\s)on(\s|$)/);
  const first = panel.locator('[data-lane=todo] [data-card]').first();
  const id = await first.getAttribute('data-card');
  await flick(page, first.locator('.card'), 240);
  await expect(panel.locator(`[data-lane=doing] [data-card="${id}"]`)).toBeVisible();
  await flick(page, panel.locator(`[data-lane=doing] [data-card="${id}"] .card`), 240);
  await expect(panel.locator(`[data-lane=done] [data-card="${id}"]`)).toBeVisible();
  await flick(page, panel.locator(`[data-lane=done] [data-card="${id}"] .card`), -240);
  await expect(panel.locator(`[data-lane=doing] [data-card="${id}"]`)).toBeVisible();
  // 小さく動かしただけでは変わらない
  await flick(page, panel.locator(`[data-lane=doing] [data-card="${id}"] .card`), 40);
  await expect(panel.locator(`[data-lane=doing] [data-card="${id}"]`)).toBeVisible();
  // メモを左へ → 消える → もとにもどす
  await page.locator('#memo').fill('あとで調べる');
  await page.locator('#memo').press('Enter');
  const memo = panel.locator('[data-lane=memo] [data-card]').first();
  await expect(memo).toContainText('あとで調べる');
  await flick(page, memo.locator('.card'), -240);
  await expect(panel.locator('[data-lane=memo] [data-card]')).toHaveCount(0);
  await page.getByTestId('toast').getByRole('button', { name: 'もとにもどす' }).click();
  await expect(panel.locator('[data-lane=memo] [data-card]')).toHaveCount(1);
  // 状態は保存される
  await page.reload();
  await ready(page);
  await page.locator('[data-tab=tasks]').click();
  await expect(panel.locator(`[data-lane=doing] [data-card="${id}"]`)).toBeVisible();
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
  const opts = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
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
  await expect(B.locator('.pin[data-key=hiroshima]')).toBeVisible({ timeout: 10_000 });
  await expect(B.getByTestId('total')).toHaveText('1');
  await addEntry(B, 'かき', '広島');
  await expect(A.locator('.pin[data-key=hiroshima] .pin-count')).toHaveText('2', { timeout: 10_000 });
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
  for (const t of ['map', 'zukan', 'tasks', 'sheet']) {
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
