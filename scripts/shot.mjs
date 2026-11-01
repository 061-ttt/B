import { chromium } from '@playwright/test';
const SP = process.argv[2];
const b = await chromium.launch({ executablePath: process.env.PW_CHROME_PATH, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const logs = [];
p.on('console', m => logs.push(m.type() + ': ' + m.text()));
p.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
const t0 = Date.now();
await p.goto(process.env.BASE ?? 'http://127.0.0.1:8787/');
await p.screenshot({ path: SP + '/s0.png' });
await p.waitForFunction(() => document.getElementById('skeleton') === null || document.getElementById('skeleton').classList.contains('done'), null, { timeout: 30000 });
console.log('ready ms', Date.now() - t0);
await p.waitForTimeout(1500);
await p.screenshot({ path: SP + '/s1.png' });
console.log(await p.evaluate(() => JSON.stringify(window.__sm?.scene?.info())));
if (process.argv[3] === 'world') { await p.click('[data-testid=view-world]'); await p.waitForTimeout(2500); await p.screenshot({ path: SP + '/s2.png' }); console.log(await p.evaluate(() => JSON.stringify(window.__sm?.scene?.info()))); }
console.log(logs.join('\n'));
await b.close();
