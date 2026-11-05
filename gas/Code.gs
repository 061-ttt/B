/**
 * 水産マップ（Google Apps Script 版）
 *
 * 学校のフィルタで外部のサイトが開けなくても、Google Workspace の中（script.google.com）で動き、
 * クラス全員の入力を1つの地球儀に集める。データは先生のGoogleドライブのスプレッドシートに保存する。
 *
 * 準備（先生が1回だけ）
 *  1. このコードを Apps Script のエディタに貼り付けて保存する
 *  2. 上の関数の選択を「setup」にして「実行」→ 権限を許可する（アプリ本体を読みこみ、データ用のスプレッドシートを作る）
 *  3. 「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *       次のユーザーとして実行：自分
 *       アクセスできるユーザー：（学校のドメイン）内の全員
 *  4. 出てきたウェブアプリのURLを開く。Googleサイトには「挿入」→「埋め込む」→「URLで埋め込む」で貼る
 *
 * アプリを新しい版にしたいとき：関数「updateApp」を実行してから、デプロイを「新しいバージョン」で更新する
 * このファイルは scripts/build-gas.mjs が作る（直接書きかえない）
 */

// アプリ本体（1ファイルのHTML）の置き場所。学校の端末ではなく、Googleのサーバーが読みに行く
var APP_SOURCE = 'https://raw.githubusercontent.com/061-ttt/B/feature/boo-ux/gas/app.html';
var APP_BUILD = '2026-11-05';

var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var MAX_ENTRIES = 3000;          // 1クラスの入力の上限（60人×50件）
var PRESENCE_MS = 20000;         // この時間内に確認に来た端末を「つながっている」と数える
var FISH_IDS = {"salmon":1,"mackerel":1,"horse-mackerel":1,"sardine":1,"saury":1,"tuna":1,"bonito":1,"yellowtail":1,"hiramasa":1,"seabream":1,"cod":1,"atka":1,"flatfish":1,"capelin":1,"shrimp":1,"squid":1,"octopus":1,"scallop":1,"oyster":1,"clam":1,"eel":1,"crab":1,"ikura":1,"pollock-roe":1,"urchin":1,"wakame":1,"nori":1,"kombu":1,"shirasu":1,"herring":1,"fugu":1,"swordfish":1,"sawara":1,"kinmedai":1,"kanpachi":1,"anago":1,"tachiuo":1,"sablefish":1,"anglerfish":1,"hamaguri":1,"hijiki":1,"mozuku":1,"amaebi":1,"akauo":1,"ayu":1};
var PLACE_IDS = {"hokkaido":1,"aomori":1,"iwate":1,"miyagi":1,"akita":1,"yamagata":1,"fukushima":1,"ibaraki":1,"tochigi":1,"gunma":1,"saitama":1,"chiba":1,"tokyo":1,"kanagawa":1,"niigata":1,"toyama":1,"ishikawa":1,"fukui":1,"yamanashi":1,"nagano":1,"gifu":1,"shizuoka":1,"aichi":1,"mie":1,"shiga":1,"kyoto":1,"osaka":1,"hyogo":1,"nara":1,"wakayama":1,"tottori":1,"shimane":1,"okayama":1,"hiroshima":1,"yamaguchi":1,"tokushima":1,"kagawa":1,"ehime":1,"kochi":1,"fukuoka":1,"saga":1,"nagasaki":1,"kumamoto":1,"oita":1,"miyazaki":1,"kagoshima":1,"okinawa":1,"kushiro":1,"nemuro":1,"wakkanai":1,"hakodate":1,"abashiri":1,"monbetsu":1,"rausu":1,"akkeshi":1,"hachinohe":1,"oma":1,"mutsu-bay":1,"sanriku":1,"miyako":1,"ofunato":1,"kesennuma":1,"ishinomaki":1,"onagawa":1,"shiogama":1,"choshi":1,"onahama":1,"misaki":1,"yaizu":1,"numazu":1,"suruga-bay":1,"toyama-bay":1,"himi":1,"noto":1,"echizen":1,"maizuru":1,"sakaiminato":1,"hamada":1,"shimonoseki":1,"karatsu":1,"matsuura":1,"goto":1,"tsushima":1,"makurazaki":1,"tosashimizu":1,"uwajima":1,"akashi":1,"kuwana":1,"naruto":1,"shinjiko":1,"jusanko":1,"ariake":1,"setouchi":1,"tokyo-bay":1,"ise-bay":1,"mikawa-bay":1,"wakasa-bay":1,"sea-of-japan":1,"east-china-sea":1,"okhotsk":1,"sanriku-oki":1,"joban-oki":1,"north-pacific":1,"pacific":1,"south-pacific":1,"east-pacific":1,"north-atlantic":1,"atlantic":1,"south-atlantic":1,"indian":1,"bering":1,"southern":1,"mediterranean":1,"norway":1,"chile":1,"iceland":1,"russia":1,"usa":1,"canada":1,"china":1,"korea":1,"taiwan":1,"vietnam":1,"thailand":1,"indonesia":1,"india":1,"philippines":1,"malaysia":1,"myanmar":1,"bangladesh":1,"srilanka":1,"australia":1,"newzealand":1,"tonga":1,"png":1,"fiji":1,"kiribati":1,"micronesia":1,"marshall":1,"denmark":1,"faroe":1,"uk":1,"ireland":1,"netherlands":1,"france":1,"spain":1,"portugal":1,"malta":1,"croatia":1,"greece":1,"turkey":1,"morocco":1,"mauritania":1,"senegal":1,"namibia":1,"southafrica":1,"peru":1,"ecuador":1,"argentina":1,"brazil":1,"mexico":1,"panama":1,"greenland":1,"seychelles":1,"maldives":1};

// ── ページ ──
function doGet(e) {
  var html = loadApp_();
  var cfg = { url: ScriptApp.getService().getUrl(), room: (e && e.parameter && e.parameter.room) ? String(e.parameter.room).toUpperCase().slice(0, 6) : null };
  var inject = '<script>window.__GAS__=' + JSON.stringify(cfg).replace(/</g, '\\u003c') + ';</script>';
  var i = html.indexOf('<head>');
  html = i >= 0 ? html.slice(0, i + 6) + inject + html.slice(i + 6) : inject + html;
  return HtmlService.createHtmlOutput(html)
    .setTitle('水産マップ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** 先生がエディタで1回だけ実行する：権限の確認・アプリ本体の読みこみ・データ用スプレッドシートの作成 */
function setup() {
  var html = loadApp_();
  var ss = db_();
  Logger.log('準備ができました。アプリ本体 ' + Math.round(html.length / 1024) + 'KB、データ：' + ss.getUrl());
}

/** アプリ本体を最新版に入れかえる */
function updateApp() {
  var sh = db_().getSheetByName('app');
  if (sh) sh.clear();
  delBig_('app');
  var html = installApp_();
  Logger.log('アプリ本体を更新しました（' + Math.round(html.length / 1024) + 'KB）');
}

function loadApp_() {
  // 1) プロジェクトに「app」という名前のHTMLファイルを貼ってあれば、それを使う（GitHubに届かない学校向け）
  try { return HtmlService.createHtmlOutputFromFile('app').getContent(); } catch (err) { /* ない */ }
  // 2) 速いキャッシュ → 3) スプレッドシートに保存した本体 → 4) 読みこみ
  var c = getBig_('app');
  if (c) return c;
  var sh = db_().getSheetByName('app');
  if (sh && sh.getLastRow() > 0) {
    var parts = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(function (r) { return r[0]; });
    var html = parts.join('');
    if (html.length > 1000) { putBig_('app', html); return html; }
  }
  return installApp_();
}

function installApp_() {
  var res = UrlFetchApp.fetch(APP_SOURCE, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error('アプリ本体を読みこめませんでした（' + res.getResponseCode() + '）：' + APP_SOURCE);
  var html = res.getContentText('UTF-8');
  if (html.indexOf('<html') < 0) throw new Error('アプリ本体の形がちがいます');
  // スプレッドシートの1つのセルには5万文字までなので、4万5千文字ずつに分けて保存する
  var ss = db_();
  var sh = ss.getSheetByName('app') || ss.insertSheet('app');
  sh.clear();
  var rows = [];
  for (var i = 0; i < html.length; i += 45000) rows.push([html.slice(i, i + 45000)]);
  sh.getRange(1, 1, rows.length, 1).setValues(rows);
  sh.hideSheet();
  putBig_('app', html);
  return html;
}

// ── データ（スプレッドシート） ──
function props_() { return PropertiesService.getScriptProperties(); }
function cache_() { return CacheService.getScriptCache(); }

function db_() {
  var p = props_();
  var id = p.getProperty('DB_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (err) { /* 消された */ } }
  var ss = SpreadsheetApp.create('水産マップ_データ');
  var sh = ss.getSheets()[0];
  sh.setName('entries');
  sh.getRange(1, 1, 1, 4).setValues([['クラス', 'id', 'データ', '時刻']]);
  sh.setFrozenRows(1);
  var rs = ss.insertSheet('rooms');
  rs.getRange(1, 1, 1, 2).setValues([['クラス', 'つくった時刻']]);
  p.setProperty('DB_ID', ss.getId());
  return ss;
}
function entriesSheet_() { return db_().getSheetByName('entries'); }

function roomMeta_(code) {
  var v = props_().getProperty('room:' + code);
  return v ? JSON.parse(v) : null;
}
function setRoomMeta_(code, m) { props_().setProperty('room:' + code, JSON.stringify(m)); }

function validCode_(code) { return typeof code === 'string' && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code); }

/** クラスの入力をすべて（キャッシュ → なければスプレッドシート）。
 *  locked＝呼び出し元がすでにロックを持っている。持っていなければ、読み直しの間だけロックをとる
 *  （入力の書きこみと重なって、古い内容をキャッシュに戻さないように） */
function roomEntries_(code, locked) {
  var c = getBig_('e:' + code);
  if (c) return JSON.parse(c);
  if (!locked) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) return readEntries_(code);
    try {
      var again = getBig_('e:' + code);
      if (again) return JSON.parse(again);
      var l = readEntries_(code);
      putBig_('e:' + code, JSON.stringify(l));
      return l;
    } finally { lock.releaseLock(); }
  }
  var list = readEntries_(code);
  putBig_('e:' + code, JSON.stringify(list));
  return list;
}
function readEntries_(code) {
  var sh = entriesSheet_();
  var n = sh.getLastRow() - 1;
  var list = [];
  if (n > 0) {
    var vals = sh.getRange(2, 1, n, 3).getValues();
    for (var i = 0; i < vals.length; i++) if (vals[i][0] === code) { try { list.push(JSON.parse(vals[i][2])); } catch (err) { /* */ } }
  }
  list.sort(function (a, b) { return a.at - b.at; });
  return list;
}

function verOf_(code) {
  var v = cache_().get('v:' + code);
  if (v !== null) return Number(v);
  // キャッシュが消えていたら、ロックをとって正しい値を入れ直す（書きこみと重なって古い値を戻さないように）
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return Number(props_().getProperty('ver:' + code) || 0);
  try {
    var again = cache_().get('v:' + code);
    if (again !== null) return Number(again);
    var pv = Number(props_().getProperty('ver:' + code) || 0);
    cache_().put('v:' + code, String(pv), 21600);
    return pv;
  } finally { lock.releaseLock(); }
}
function bump_(code) {
  var v = Number(props_().getProperty('ver:' + code) || 0) + 1;
  props_().setProperty('ver:' + code, String(v));
  cache_().put('v:' + code, String(v), 21600);
  return v;
}

/** 確認に来た端末を記録して、つながっている台数を数える */
function presence_(code, device) {
  var c = cache_();
  var now = new Date().getTime();
  var dev = typeof device === 'string' ? device.replace(/[^a-z0-9]/gi, '').slice(0, 40) : '';
  var raw = c.get('pl:' + code);
  var list = raw ? JSON.parse(raw) : [];
  if (dev) {
    c.put('pd:' + code + ':' + dev, String(now), 30);
    if (list.indexOf(dev) < 0) {
      var lock = LockService.getScriptLock();
      if (lock.tryLock(300)) {
        try {
          raw = c.get('pl:' + code);
          list = raw ? JSON.parse(raw) : [];
          if (list.indexOf(dev) < 0) { list.push(dev); if (list.length > 200) list = list.slice(-200); c.put('pl:' + code, JSON.stringify(list), 21600); }
        } finally { lock.releaseLock(); }
      }
    }
  }
  if (!list.length) return dev ? 1 : 0;
  var seen = c.getAll(list.map(function (d) { return 'pd:' + code + ':' + d; }));
  var n = 0;
  for (var k in seen) if (now - Number(seen[k]) < PRESENCE_MS) n++;
  return Math.max(n, dev ? 1 : 0);
}

function stateOf_(code, device) {
  var m = roomMeta_(code);
  // 版の番号を先に読む（あいだに入力が増えても、次の確認で番号のちがいに気づいて読み直せる）
  var ver = verOf_(code);
  return { entries: roomEntries_(code), resetAt: m ? (m.resetAt || 0) : 0, ver: ver, n: presence_(code, device) };
}

// ── アプリから呼ぶ関数（google.script.run） ──
function api_health() { return { ok: true, build: APP_BUILD }; }

function api_create() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var code = '';
    for (var t = 0; t < 20; t++) {
      code = randomCode_(6);
      if (!roomMeta_(code)) break;
    }
    var key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    var now = new Date().getTime();
    setRoomMeta_(code, { created: now, keyHash: sha256_(key), resetAt: 0 });
    props_().setProperty('ver:' + code, '0');
    db_().getSheetByName('rooms').appendRow([code, new Date(now)]);
    return { code: code, teacherKey: key };
  } finally { lock.releaseLock(); }
}

function api_state(code, device) {
  code = String(code || '').toUpperCase();
  if (!validCode_(code) || !roomMeta_(code)) return { error: 'not found' };
  return stateOf_(code, device);
}

/** 数秒ごとの確認。変わっていなければ小さな返事だけ */
function api_poll(code, ver, device) {
  code = String(code || '').toUpperCase();
  if (!validCode_(code)) return { error: 'not found' };
  var v = cache_().get('v:' + code);
  if (v === null) {
    if (!roomMeta_(code)) return { error: 'not found' };
    v = String(verOf_(code));
  }
  if (Number(v) === Number(ver)) return { same: true, ver: Number(v), n: presence_(code, device) };
  return stateOf_(code, device);
}

/** 入力を加える（送信待ちをまとめて受け取る） */
function api_add(code, list, ver) {
  code = String(code || '').toUpperCase();
  if (!validCode_(code)) return { results: [], state: { error: 'not found' } };
  if (!Array.isArray(list)) list = [list];
  list = list.slice(0, 60);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var m = roomMeta_(code);
    if (!m) return { results: list.map(function (x) { return { id: x && x.id, error: 'not found' }; }) };
    var cur = roomEntries_(code, true);
    var have = {};
    cur.forEach(function (e) { have[e.id] = true; });
    var rows = [];
    var results = [];
    for (var i = 0; i < list.length; i++) {
      var e = sanitize_(list[i]);
      var id = list[i] && list[i].id;
      if (!e) { results.push({ id: id, error: 'invalid' }); continue; }
      if (m.resetAt && (e.gen || 0) < m.resetAt) { results.push({ id: e.id, error: 'reset' }); continue; }
      if (have[e.id]) { results.push({ id: e.id, ok: true }); continue; }
      if (cur.length >= MAX_ENTRIES) { results.push({ id: e.id, error: 'full' }); continue; }
      have[e.id] = true;
      cur.push(e);
      rows.push([code, e.id, JSON.stringify(e), e.at]);
      results.push({ id: e.id, ok: true });
    }
    if (rows.length) {
      var sh = entriesSheet_();
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
      putBig_('e:' + code, JSON.stringify(cur));
      bump_(code);
    }
    return { results: results, state: { entries: cur, resetAt: m.resetAt || 0, ver: Number(props_().getProperty('ver:' + code) || 0) } };
  } finally { lock.releaseLock(); }
}

/** 入力を消す（入力した端末か、先生だけ） */
function api_del(code, id, device, key) {
  code = String(code || '').toUpperCase();
  if (!validCode_(code) || typeof id !== 'string') return { error: 'not found' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var m = roomMeta_(code);
    if (!m) return { error: 'not found' };
    var cur = roomEntries_(code, true);
    var e = null;
    for (var i = 0; i < cur.length; i++) if (cur[i].id === id) { e = cur[i]; break; }
    if (!e) return { ok: true };
    var teacher = !!key && sha256_(String(key)) === m.keyHash;
    if (e.device !== device && !teacher) return { error: 'forbidden' };
    var sh = entriesSheet_();
    var n = sh.getLastRow() - 1;
    if (n > 0) {
      var vals = sh.getRange(2, 1, n, 2).getValues();
      for (var r = vals.length - 1; r >= 0; r--) if (vals[r][0] === code && vals[r][1] === id) sh.deleteRow(r + 2);
    }
    cur = cur.filter(function (x) { return x.id !== id; });
    putBig_('e:' + code, JSON.stringify(cur));
    bump_(code);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/** 先生がクラスのデータをすべて消す（クラスをつくった端末のかぎが必要） */
function api_reset(code, key) {
  code = String(code || '').toUpperCase();
  if (!validCode_(code)) return { ok: false, error: 'not found' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var m = roomMeta_(code);
    if (!m) return { ok: false, error: 'not found' };
    if (!key || sha256_(String(key)) !== m.keyHash) return { ok: false, error: 'forbidden' };
    var sh = entriesSheet_();
    var n = sh.getLastRow() - 1;
    if (n > 0) {
      var vals = sh.getRange(2, 1, n, 4).getValues();
      var keep = vals.filter(function (r) { return r[0] !== code; });
      sh.getRange(2, 1, n, 4).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, 4).setValues(keep);
    }
    var at = new Date().getTime();
    m.resetAt = at;
    setRoomMeta_(code, m);
    putBig_('e:' + code, '[]');
    bump_(code);
    return { ok: true, at: at };
  } finally { lock.releaseLock(); }
}

// ── 小道具 ──
function randomCode_(n) {
  var s = '';
  for (var i = 0; i < n; i++) s += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  return s;
}
function sha256_(s) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return d.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

/** 受け取った入力を検査して、安全な形に整える（Cloudflare 版の worker/sanitize.ts と同じ決まり） */
function sanitize_(o) {
  if (!o || typeof o !== 'object') return null;
  function str(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max) : ''; }
  var id = str(o.id, 40), placeId = str(o.placeId, 40), fishName = str(o.fishName, 24), device = str(o.device, 40);
  var fishId = o.fishId == null ? null : str(o.fishId, 40);
  if (!/^[a-z0-9]{4,40}$/i.test(id) || !PLACE_IDS[placeId] || !fishName || !device) return null;
  if (fishId !== null && !FISH_IDS[fishId]) return null;
  var method = o.method === 'wild' || o.method === 'farmed' ? o.method : 'unknown';
  var group = Math.max(1, Math.min(8, Math.round(Number(o.group) || 1)));
  var now = new Date().getTime();
  var at = Math.min(now + 60000, Math.max(0, Number(o.at) || now));
  var gen = Math.max(0, Math.floor(Number(o.gen) || 0));
  var e = { id: id, fishId: fishId, fishName: fishName, placeId: placeId, method: method, group: group, at: at, device: device };
  if (gen) e.gen = gen;
  return e;
}

/** キャッシュに大きな文字列を分けて入れる（1つのキーは100KBまで） */
function putBig_(key, str) {
  var c = cache_();
  var size = 30000, n = Math.ceil(str.length / size), obj = {};
  for (var i = 0; i < n; i++) obj[key + '#' + i] = str.slice(i * size, (i + 1) * size);
  obj[key + '#n'] = String(n);
  try { c.putAll(obj, 21600); } catch (err) { try { c.remove(key + '#n'); } catch (e2) { /* */ } }
}
function getBig_(key) {
  var c = cache_();
  var n = c.get(key + '#n');
  if (n === null) return null;
  n = Number(n);
  if (!n) return '';
  var keys = [];
  for (var i = 0; i < n; i++) keys.push(key + '#' + i);
  var got = c.getAll(keys);
  var out = '';
  for (var j = 0; j < n; j++) { var part = got[key + '#' + j]; if (part == null) return null; out += part; }
  return out;
}
function delBig_(key) { try { cache_().remove(key + '#n'); } catch (err) { /* */ } }
