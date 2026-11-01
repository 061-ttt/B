// Cloudflare Worker：静的ファイル配信＋クラス（Durable Object）＋Workers AI
import { Hono } from 'hono';
import { DurableObject } from 'cloudflare:workers';
import { FISH } from '../src/data/fish';
import { findPlace } from '../src/data/places';
import { sanitize, type Entry } from './sanitize';
import { findFish } from '../src/data/parse';

export interface Env {
  ASSETS: Fetcher;
  ROOMS: DurableObjectNamespace<Room>;
  AI?: Ai;
  AI_MODEL_FAST?: string;
  AI_MODEL_SMART?: string;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const MAX_ENTRIES = 800;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function randomString(n: number, chars = CODE_CHARS) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => chars[x % chars.length]).join('');
}
async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Durable Object：1クラス＝1インスタンス ──
export class Room extends DurableObject<Env> {
  private sql: SqlStorage;
  private recent = new Map<string, number[]>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL)');
    // ping には眠ったまま自動で返事（ハイバネーション中でも課金されにくい）
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private meta(k: string): string | null {
    const r = this.sql.exec<{ v: string }>('SELECT v FROM meta WHERE k = ?', k).toArray();
    return r[0]?.v ?? null;
  }
  private entries(): Entry[] {
    return this.sql.exec<{ data: string }>('SELECT data FROM entries ORDER BY at').toArray().map((r) => JSON.parse(r.data));
  }
  private broadcast(msg: unknown, except?: WebSocket) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) try { ws.send(s); } catch { /* 切断済み */ }
  }
  private presence() {
    this.broadcast({ type: 'presence', n: this.ctx.getWebSockets().length });
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const created = this.meta('created');

    if (path === '/init' && req.method === 'POST') {
      if (created) return Response.json({ error: 'exists' }, { status: 409 });
      const { keyHash } = (await req.json()) as { keyHash: string };
      this.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?), (?, ?)', 'created', String(Date.now()), 'key', keyHash);
      await this.ctx.storage.setAlarm(Date.now() + TTL_MS);
      return Response.json({ ok: true });
    }
    if (!created) return Response.json({ error: 'not found' }, { status: 404 });

    if (path === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].send(JSON.stringify({ type: 'snapshot', entries: this.entries() }));
      this.presence();
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (path === '/state' && req.method === 'GET') {
      return Response.json({ entries: this.entries(), created: Number(created) });
    }
    if (path === '/entries' && req.method === 'POST') {
      const e = sanitize(await req.json().catch(() => null));
      if (!e) return Response.json({ error: 'invalid' }, { status: 400 });
      // 連打・いたずら対策：1台あたり1分に30件まで
      const now = Date.now();
      const r = (this.recent.get(e.device) ?? []).filter((t) => now - t < 60_000);
      if (r.length >= 30) return Response.json({ error: 'too many' }, { status: 429 });
      r.push(now);
      this.recent.set(e.device, r);
      const n = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM entries').one().n;
      if (n >= MAX_ENTRIES) return Response.json({ error: 'full' }, { status: 507 });
      const dup = this.sql.exec('SELECT id FROM entries WHERE id = ?', e.id).toArray().length > 0;
      if (!dup) {
        this.sql.exec('INSERT INTO entries (id, data, at) VALUES (?, ?, ?)', e.id, JSON.stringify(e), e.at);
        this.broadcast({ type: 'add', entry: e });
      }
      return Response.json({ entry: e });
    }
    const m = path.match(/^\/entries\/([a-z0-9]{4,40})$/i);
    if (m && req.method === 'DELETE') {
      const body = (await req.json().catch(() => ({}))) as { device?: string; key?: string };
      const row = this.sql.exec<{ data: string }>('SELECT data FROM entries WHERE id = ?', m[1]).toArray()[0];
      if (!row) return Response.json({ ok: true });
      const e = JSON.parse(row.data) as Entry;
      const teacher = !!body.key && (await sha256(body.key)) === this.meta('key');
      if (e.device !== body.device && !teacher) return Response.json({ error: 'forbidden' }, { status: 403 });
      this.sql.exec('DELETE FROM entries WHERE id = ?', m[1]);
      this.broadcast({ type: 'del', id: m[1] });
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    if (msg === 'ping') ws.send('pong');
  }
  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch { /* */ }
    // 閉じたソケットを除いて人数を知らせる
    const n = this.ctx.getWebSockets().filter((w) => w !== ws).length;
    this.broadcast({ type: 'presence', n }, ws);
  }
  async webSocketError(ws: WebSocket) {
    const n = this.ctx.getWebSockets().filter((w) => w !== ws).length;
    this.broadcast({ type: 'presence', n }, ws);
  }

  /** 30日たったらクラスのデータをすべて消す */
  async alarm() {
    for (const ws of this.ctx.getWebSockets()) try { ws.close(1000, 'expired'); } catch { /* */ }
    await this.ctx.storage.deleteAll();
  }
}

// ── Workers AI ──
const FISH_NAMES = FISH.map((f) => f.name).join('、');

function textOf(r: unknown): string {
  if (typeof r === 'string') return r;
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>;
    if (typeof o.response === 'string') return o.response;
    if (o.response && typeof o.response === 'object') return JSON.stringify(o.response);
    const ch = (o.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message?.content;
    if (typeof ch === 'string') return ch;
  }
  return '';
}
function jsonIn(s: string): Record<string, unknown> | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function aiParse(env: Env, text: string) {
  const model = env.AI_MODEL_FAST || '@cf/meta/llama-3.1-8b-instruct-fast';
  const r = await env.AI!.run(model as keyof AiModels, {
    messages: [
      { role: 'system', content: `あなたは日本のスーパーの値札を読み取る係です。入力から「魚の種類」「産地（都道府県・港・水域・国のいずれか）」「天然か養殖か」を取り出し、JSONだけを返します。魚の種類は次の一覧のどれかに近い名前にします：${FISH_NAMES}。分からない項目は空文字にします。` },
      { role: 'user', content: text },
    ],
    response_format: { type: 'json_schema', json_schema: { type: 'object', properties: { fish: { type: 'string' }, place: { type: 'string' }, method: { type: 'string', enum: ['wild', 'farmed', ''] } }, required: ['fish', 'place', 'method'] } },
    max_tokens: 120,
    temperature: 0,
  } as never);
  const j = jsonIn(textOf(r)) ?? {};
  const f = typeof j.fish === 'string' ? findFish(j.fish) : null;
  const p = typeof j.place === 'string' ? findPlace(j.place) : null;
  return {
    fish: f?.name ?? (typeof j.fish === 'string' ? j.fish.slice(0, 20) : ''),
    place: p?.name ?? '',
    method: j.method === 'wild' || j.method === 'farmed' ? j.method : '',
  };
}

async function aiQuestions(env: Env, summary: string) {
  const model = env.AI_MODEL_SMART || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const r = await env.AI!.run(model as keyof AiModels, {
    messages: [
      { role: 'system', content: 'あなたは小学5年生の社会科の先生です。子どもたちが調べた「魚の産地」の集計を読み、次の時間に調べたくなる「問い」を5つ作ります。答えや説明は書きません。それぞれ「なぜ〜だろう？」「どのように〜だろう？」の形で、5年生が読める言葉で40字以内にします。海流・海の深さ（大陸棚）・養殖・輸送・働く人の工夫などの視点を入れます。JSONで {"questions": ["…"]} だけを返します。' },
      { role: 'user', content: summary },
    ],
    max_tokens: 400,
    temperature: 0.6,
  } as never);
  const j = jsonIn(textOf(r));
  const qs = Array.isArray(j?.questions) ? (j!.questions as unknown[]) : [];
  return qs
    .filter((q): q is string => typeof q === 'string')
    .map((q) => q.replace(/[<>\u0000-\u001f]/g, '').trim())
    .filter((q) => q.length >= 6 && q.length <= 60 && /[？?]$/.test(q))
    .slice(0, 5);
}

// 1分あたりのAI呼び出し回数（同じ場所からのアクセス単位、ベストエフォート）
const aiHits = new Map<string, number[]>();
function aiAllowed(ip: string) {
  const now = Date.now();
  const a = (aiHits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (a.length >= 20) return false;
  a.push(now);
  aiHits.set(ip, a);
  if (aiHits.size > 5000) aiHits.clear();
  return true;
}

// ── ルーティング ──
const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true, ai: !!c.env.AI }));

app.post('/api/rooms', async (c) => {
  for (let i = 0; i < 5; i++) {
    const code = randomString(6);
    const key = randomString(24, 'abcdefghijkmnopqrstuvwxyz23456789');
    const stub = c.env.ROOMS.get(c.env.ROOMS.idFromName(code));
    const r = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ keyHash: await sha256(key) }) });
    if (r.ok) return c.json({ code, teacherKey: key });
  }
  return c.json({ error: 'busy' }, 503);
});

app.get('/api/rooms/:code', async (c) => roomProxy(c.env, c.req.raw, c.req.param('code'), 'state'));
app.all('/api/rooms/:code/*', async (c) => roomProxy(c.env, c.req.raw, c.req.param('code'), c.req.path.split('/').slice(4).join('/') || 'state'));

async function roomProxy(env: Env, req: Request, code: string, rest: string) {
  code = code.toUpperCase();
  if (!CODE_RE.test(code)) return Response.json({ error: 'bad code' }, { status: 404 });
  const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
  const url = new URL(req.url);
  url.pathname = `/${rest}`;
  return stub.fetch(new Request(url, req));
}

app.post('/api/ai/parse', async (c) => {
  if (!c.env.AI) return c.json({ error: 'ai unavailable' }, 503);
  if (!aiAllowed(c.req.header('cf-connecting-ip') ?? 'x')) return c.json({ error: 'too many' }, 429);
  const { text } = (await c.req.json().catch(() => ({}))) as { text?: string };
  if (!text || typeof text !== 'string') return c.json({ error: 'text required' }, 400);
  try { return c.json(await aiParse(c.env, text.slice(0, 200))); } catch { return c.json({ error: 'ai failed' }, 502); }
});

app.post('/api/ai/questions', async (c) => {
  if (!c.env.AI) return c.json({ error: 'ai unavailable' }, 503);
  if (!aiAllowed(c.req.header('cf-connecting-ip') ?? 'x')) return c.json({ error: 'too many' }, 429);
  const { summary } = (await c.req.json().catch(() => ({}))) as { summary?: string };
  if (!summary || typeof summary !== 'string') return c.json({ error: 'summary required' }, 400);
  try { return c.json({ questions: await aiQuestions(c.env, summary.slice(0, 800)) }); } catch { return c.json({ error: 'ai failed' }, 502); }
});

app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
