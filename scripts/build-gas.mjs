// Google Apps Script 版をつくる：gas/app.html（アプリ本体の1ファイルHTML）と gas/Code.gs（サーバー）
//   node scripts/build-gas.mjs
// GAS_APP_SOURCE で、Code.gs がアプリ本体を読みに行くURLを変えられる（ふだんは GitHub のこのブランチ）
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

const root = new URL('..', import.meta.url).pathname;
const sh = (c, env = {}) => execSync(c, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });

// 1) アプリ本体（クラス共有あり・1ファイル）
sh('npx vite build', { GAS: '1' });

// 2) 入力の検査に使う、魚と産地のIDの一覧
const tmp = `${root}node_modules/.cache/gas-ids`;
mkdirSync(tmp, { recursive: true });
writeFileSync(`${tmp}/entry.ts`, `import { FISH } from '${root}src/data/fish';\nimport { PLACES } from '${root}src/data/places';\nexport const fish = FISH.map((f) => f.id);\nexport const places = PLACES.map((p) => p.id);\n`);
await build({ entryPoints: [`${tmp}/entry.ts`], bundle: true, platform: 'node', format: 'esm', outfile: `${tmp}/ids.mjs`, logLevel: 'error' });
const ids = await import(`${tmp}/ids.mjs?${Date.now()}`);
rmSync(tmp, { recursive: true, force: true });
const obj = (a) => JSON.stringify(Object.fromEntries(a.map((x) => [x, 1])));

// 3) 書き出し
const branch = (process.env.GAS_BRANCH || execSync('git rev-parse --abbrev-ref HEAD', { cwd: root }).toString().trim());
const source = process.env.GAS_APP_SOURCE || `https://raw.githubusercontent.com/061-ttt/B/${branch}/gas/app.html`;
const stamp = new Date().toISOString().slice(0, 10);
const html = readFileSync(`${root}dist-gas/index.html`, 'utf8');
writeFileSync(`${root}gas/app.html`, html);
const code = readFileSync(`${root}gas/Code.template.js`, 'utf8')
  .replace('__APP_SOURCE__', source)
  .replace('__APP_BUILD__', stamp)
  .replace('__FISH_IDS__', obj(ids.fish))
  .replace('__PLACE_IDS__', obj(ids.places));
writeFileSync(`${root}gas/Code.gs`, code);
console.log(`gas/app.html ${(html.length / 1e6).toFixed(2)}MB, gas/Code.gs ${(code.length / 1024).toFixed(1)}KB, 魚${ids.fish.length}種・産地${ids.places.length}か所, 読みこみ先 ${source}`);
