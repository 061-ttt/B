import { chromium } from '@playwright/test';
const SP = process.argv[2];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })).newPage();
await p.goto('http://127.0.0.1:4173/');
await p.waitForFunction(() => window.__sm?.scene?.frames > 5, null, { timeout: 30000 });
const r = await p.evaluate(() => {
  const s = window.__sm.scene; const g = s.current.group; const out = [];
  g.children.forEach(c => out.push(c.name + ':' + c.type + ':' + (c.geometry?.attributes?.position?.count ?? '')));
  const land = g.getObjectByName('land'); const jp = g.getObjectByName('land-japan');
  land.material[0].color.set('#ff0000'); jp.material[0].color.set('#00ff00');
  g.getObjectByName('ocean').visible = false;
  return out;
});
console.log(r.join('\n'));
await p.waitForTimeout(500);
await p.screenshot({ path: SP + '/dbg.png' });
await b.close();
