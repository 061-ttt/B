import { test, expect, type Page } from '@playwright/test';

// 改良版の演出（凡例の「新しい演出」）と、オフにしたときに元の版へもどること

async function ready(page: Page) {
  await expect(page.locator('#skeleton')).toHaveCount(0, { timeout: 45_000 });
  const start = page.getByTestId('intro-start');
  if (await start.isVisible()) await start.click();
  await expect(page.getByTestId('intro')).toHaveCount(0);
}

async function addByTag(page: Page, tag: string) {
  await page.getByTestId('fab').click();
  const sheet = page.getByTestId('add-sheet');
  await expect(sheet).toHaveClass(/(^|\s)on(\s|$)/);
  await sheet.getByTestId('tag-input').fill(tag);
  // 打つだけで読み取る（読み取るボタンを押さなくてよい）
  await expect(sheet.getByTestId('place-ok')).toBeVisible();
  await sheet.getByTestId('submit').click();
  await expect(sheet).not.toHaveClass(/(^|\s)on(\s|$)/);
}

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
});
test.afterEach(() => { expect(errors, `コンソールエラー: ${errors.join('\n')}`).toEqual([]); });

test('fx1. 天秤：外国が多いと右へ傾き、着地の1語と距離が出る', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await expect(page.locator('.balance')).toBeVisible();
  await expect(page.locator('.bal-msg')).toHaveText('どっちが多いかな？');
  await addByTag(page, 'ノルウェー産 さば');
  await expect(page.getByTestId('arrival')).toContainText('ノルウェー');
  await expect(page.getByTestId('arrival')).toContainText('km');
  await expect(page.getByTestId('total')).toHaveText('1');
  await expect(page.locator('.bal-msg')).toHaveText('外国が重い！');
  const deg = await page.locator('.balance').evaluate((el) => (el as HTMLElement).style.getPropertyValue('--deg'));
  expect(parseFloat(deg)).toBeGreaterThan(0);
  // 国内を足すとつりあう
  await addByTag(page, '北海道 さんま');
  await expect(page.getByTestId('total')).toHaveText('2');
  await expect(page.locator('.bal-msg')).toHaveText('つりあってる');
});

test('fx2. 班は一度えらぶと、次からは1行にまとまる', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.getByTestId('fab').click();
  const sheet = page.getByTestId('add-sheet');
  await sheet.locator('.groups button', { hasText: '3' }).click();
  await expect(sheet.getByTestId('group-line')).toContainText('3班');
  await sheet.getByRole('button', { name: 'かえる' }).click();
  await expect(sheet.locator('.groups')).toBeVisible();
});

test('fx3. 図鑑の「地球儀で産地を見る」で、なぜ？カードが出て、シートに送れる', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.locator('[data-tab=zukan]').click();
  await page.locator('[data-fish=saury] .acc-head').click();
  await page.getByTestId('show-saury').click();
  await expect(page.getByTestId('focus-card')).toContainText('さんま');
  await expect(page.getByTestId('focus-card')).toContainText('寒流');
  await page.getByTestId('focus-to-sheet').click();
  await page.locator('[data-tab=sheet]').click();
  await expect(page.getByTestId('sheet')).toContainText('さんまがとれる場所');
});

test('fx4. 「新しい演出」をオフにすると元の画面（集計・ボタン・トースト）にもどる', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.getByTestId('legend-btn').click();
  await page.getByTestId('fx-toggle').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.balance')).toHaveCount(0);
  await expect(page.locator('.summary')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.classList.contains('fx'))).toBe(false);
  await page.getByTestId('fab').click();
  await expect(page.getByTestId('throw')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // 開き直してもオフのまま
  await page.reload();
  await ready(page);
  await expect(page.locator('.summary')).toBeVisible();
  // ?classic=0 でオンにもどせる
  await page.goto('/?classic=0');
  await ready(page);
  await expect(page.locator('.balance')).toBeVisible();
});
