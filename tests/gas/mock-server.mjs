// Apps Script の模擬サーバー（テスト用）。gas/Code.gs を Node の中で動かし、
// CacheService・PropertiesService・LockService・SpreadsheetApp などを手元の簡単なものに置きかえる。
// ブラウザ側の google.script.run は、/rpc への POST に置きかえて差しこむ。
//   node tests/gas/mock-server.mjs [port]
import http from 'node:http';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url).pathname;
const PORT = Number(process.argv[2] || 8931);
const LATENCY = Number(process.env.GAS_LATENCY || 150);

// ── 置きかえ ──
const cacheMap = new Map();
const CacheService = { getScriptCache: () => ({
  get: (k) => (cacheMap.has(k) ? cacheMap.get(k) : null),
  put: (k, v) => { if (String(v).length > 100000) throw new Error('cache value too big'); cacheMap.set(k, String(v)); },
  getAll: (ks) => Object.fromEntries(ks.filter((k) => cacheMap.has(k)).map((k) => [k, cacheMap.get(k)])),
  putAll: (o) => { for (const [k, v] of Object.entries(o)) { if (String(v).length > 100000) throw new Error('cache value too big'); cacheMap.set(k, String(v)); } },
  remove: (k) => cacheMap.delete(k),
}) };
const props = new Map();
const PropertiesService = { getScriptProperties: () => ({
  getProperty: (k) => (props.has(k) ? props.get(k) : null),
  setProperty: (k, v) => { props.set(k, String(v)); },
  deleteProperty: (k) => props.delete(k),
}) };
const LockService = { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) };

class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  setName(n) { this.name = n; return this; }
  getLastRow() { return this.rows.length; }
  appendRow(r) { this.rows.push([...r]); }
  deleteRow(i) { this.rows.splice(i - 1, 1); }
  setFrozenRows() {}
  hideSheet() {}
  clear() { this.rows = []; }
  getRange(r, c, nr = 1, nc = 1) {
    const sh = this;
    return {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (sh.rows[r - 1 + i] ?? [])[c - 1 + j] ?? '')),
      setValues: (v) => { v.forEach((row, i) => { const t = (sh.rows[r - 1 + i] ??= []); row.forEach((x, j) => { t[c - 1 + j] = x; }); }); },
      clearContent: () => { for (let i = 0; i < nr; i++) { const t = sh.rows[r - 1 + i]; if (t) for (let j = 0; j < nc; j++) t[c - 1 + j] = ''; } while (sh.rows.length && sh.rows[sh.rows.length - 1].every((x) => x === '' || x == null)) sh.rows.pop(); },
    };
  }
}
class Spreadsheet {
  constructor(name) { this.name = name; this.id = 'ss' + Math.random().toString(36).slice(2); this.sheets = [new Sheet('Sheet1')]; }
  getId() { return this.id; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  getSheets() { return this.sheets; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) ?? null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
}
const books = new Map();
const SpreadsheetApp = {
  create: (n) => { const b = new Spreadsheet(n); books.set(b.id, b); return b; },
  openById: (id) => { const b = books.get(id); if (!b) throw new Error('not found'); return b; },
};
const Utilities = {
  getUuid: () => crypto.randomUUID(),
  DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
  computeDigest: (alg, s) => [...crypto.createHash('sha256').update(String(s), 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
};
const UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => readFileSync(root + 'gas/app.html', 'utf8') }) };
let lastOutput = null;
const HtmlService = {
  XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
  createHtmlOutputFromFile: () => { throw new Error('no file'); },
  createHtmlOutput: (html) => { const o = { html, meta: {}, setTitle() { return o; }, addMetaTag(k, v) { o.meta[k] = v; return o; }, setXFrameOptionsMode(m) { o.xfo = m; return o; }, getContent: () => html }; lastOutput = o; return o; },
};
const ScriptApp = { getService: () => ({ getUrl: () => `http://127.0.0.1:${PORT}/exec` }) };

const ctx = vm.createContext({ CacheService, PropertiesService, LockService, SpreadsheetApp, Utilities, UrlFetchApp, HtmlService, ScriptApp, Logger: { log: (...a) => console.log('[Logger]', ...a) }, console, JSON, Math, Date });
vm.runInContext(readFileSync(root + 'gas/Code.gs', 'utf8'), ctx, { filename: 'Code.gs' });

// ブラウザの google.script.run の代わり
const SHIM = `<script>(function(){function mk(ok,ng){return new Proxy({},{get:function(_,k){
 if(k==='withSuccessHandler')return function(f){return mk(f,ng)};
 if(k==='withFailureHandler')return function(f){return mk(ok,f)};
 return function(){var a=[].slice.call(arguments);fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fn:k,args:a})})
  .then(function(r){return r.json()}).then(function(j){if(j.error){ng&&ng(new Error(j.error))}else{ok&&ok(j.result)}}).catch(function(e){ng&&ng(e)})}}})}
 window.google={script:{run:mk(null,null)}};})();</script>`;

export const stats = { rpc: 0, byFn: {} };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'GET' && u.pathname === '/exec') {
    const e = { parameter: Object.fromEntries(u.searchParams) };
    const out = ctx.doGet(e);
    let html = out.getContent();
    html = html.replace('<head>', '<head>' + SHIM + `<meta name="viewport" content="${out.meta.viewport}">`);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-xfo': out.xfo });
    res.end(html);
    return;
  }
  if (req.method === 'POST' && u.pathname === '/rpc') {
    let body = '';
    for await (const c of req) body += c;
    const { fn, args } = JSON.parse(body);
    stats.rpc++; stats.byFn[fn] = (stats.byFn[fn] || 0) + 1;
    await new Promise((r) => setTimeout(r, LATENCY));
    res.writeHead(200, { 'content-type': 'application/json' });
    if (!/^api_[a-z]+$/.test(fn) || typeof ctx[fn] !== 'function') { res.end(JSON.stringify({ error: 'no function ' + fn })); return; }
    try {
      // 本物と同じく、返り値は JSON にして返す（Date などは文字列になる）
      res.end(JSON.stringify({ result: JSON.parse(JSON.stringify(ctx[fn](...args) ?? null)) }));
    } catch (err) { res.end(JSON.stringify({ error: String(err.message || err) })); }
    return;
  }
  if (u.pathname === '/stats') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ...stats, sheet: (() => { const id = props.get('DB_ID'); const b = id && books.get(id); return b ? b.getSheetByName('entries').rows.length - 1 : 0; })() })); return; }
  res.writeHead(404); res.end('not found');
});
server.listen(PORT, '127.0.0.1', () => console.log(`mock GAS on http://127.0.0.1:${PORT}/exec`));
