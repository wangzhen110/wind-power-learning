/* ============================================================
   风电标准学习平台 · Cloudflare Workers 后端（D1 存储）
   适配前端 app.js 既有调用契约：
     POST /api/register   body {user, password|pass, nick}
     POST /api/login      body {user, password|pass}
     POST /api/logout     (Authorization: Bearer <token>)
     GET  /api/health     -> {ok:true, version}
     GET  /api/progress/all  -> {ok, progress: {<course>: {<type>: {data, updated}}}}
     PUT  /api/progress   body {course, type, data}
   密码哈希与前端 app.js 完全一致：sha256(salt + ':' + encodeURIComponent(pwd))
   ============================================================ */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '86400'
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS_HEADERS)
  });
}

function bytesToHex(buf) {
  const arr = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, '0');
  return s;
}

async function hashPassword(salt, pwd) {
  const data = new TextEncoder().encode(salt + ':' + encodeURIComponent(String(pwd)));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(digest);
}

function randSalt() {
  const hex = 'abcdef0123456789';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < 16; i++) s += hex[bytes[i] & 15];
  return s;
}

async function readBody(req) {
  try { return await req.json(); } catch (e) { return {}; }
}

function bearerToken(req) {
  const h = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function authUser(db, req) {
  const token = bearerToken(req);
  if (!token) return null;
  const row = await db.prepare('SELECT user, expires FROM sessions WHERE token = ?').bind(token).first();
  if (!row) return null;
  if (Number(row.expires) <= Date.now()) return null;
  return { user: row.user, token: token };
}

async function createSession(db, user) {
  const token = crypto.randomUUID();
  const now = Date.now();
  const expires = now + 7 * 24 * 3600 * 1000;
  await db.prepare(
    'INSERT INTO sessions (token, user, created, expires) VALUES (?, ?, ?, ?)'
  ).bind(token, user, now, expires).run();
  return token;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const method = req.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const db = env.DB;
    const path = url.pathname;

    try {
      /* ---------- 健康检查 ---------- */
      if (path === '/api/health' && method === 'GET') {
        return json({ ok: true, version: 'v1' });
      }

      /* ---------- 注册 ---------- */
      if (path === '/api/register' && method === 'POST') {
        const body = await readBody(req);
        const user = String(body.user || '').trim();
        const pass = String(body.pass || body.password || '');
        const nick = String(body.nick || user);
        if (!user) return json({ ok: false, error: '账号不能为空' }, 400);
        if (pass.length < 4) return json({ ok: false, error: '密码至少 4 位' }, 400);

        const exist = await db.prepare('SELECT user FROM users WHERE user = ?').bind(user).first();
        if (exist) return json({ ok: false, error: '用户已存在' }, 409);

        const salt = randSalt();
        const hash = await hashPassword(salt, pass);
        await db.prepare(
          'INSERT INTO users (user, salt, hash, nick, created) VALUES (?, ?, ?, ?, ?)'
        ).bind(user, salt, hash, nick, Date.now()).run();

        const token = await createSession(db, user);
        return json({ ok: true, token: token, nick: nick });
      }

      /* ---------- 登录 ---------- */
      if (path === '/api/login' && method === 'POST') {
        const body = await readBody(req);
        const user = String(body.user || '').trim();
        const pass = String(body.pass || body.password || '');
        if (!user || !pass) return json({ ok: false, error: '账号或密码错误' }, 401);

        const row = await db.prepare('SELECT salt, hash, nick FROM users WHERE user = ?').bind(user).first();
        if (!row) return json({ ok: false, error: '账号或密码错误' }, 401);
        const h = await hashPassword(row.salt, pass);
        if (h !== row.hash) return json({ ok: false, error: '账号或密码错误' }, 401);

        const token = await createSession(db, user);
        return json({ ok: true, token: token, nick: row.nick || user });
      }

      /* ---------- 登出 ---------- */
      if (path === '/api/logout' && method === 'POST') {
        const auth = await authUser(db, req);
        if (auth) {
          const token = bearerToken(req);
          await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
        }
        return json({ ok: true });
      }

      /* ---------- 拉取全部进度（返回 {course: {type: {data, updated}}} 形状） ---------- */
      if (path === '/api/progress/all' && method === 'GET') {
        const auth = await authUser(db, req);
        if (!auth) return json({ ok: false, error: '未授权' }, 401);
        const { results } = await db.prepare(
          'SELECT course, type, data, updated FROM progress WHERE user = ?'
        ).bind(auth.user).all();
        const out = {};
        (results || []).forEach(function (row) {
          let dataObj = row.data;
          if (typeof dataObj === 'string') {
            try { dataObj = JSON.parse(dataObj); } catch (e) { /* keep string */ }
          }
          if (!out[row.course]) out[row.course] = {};
          out[row.course][row.type] = { data: dataObj, updated: Number(row.updated) };
        });
        return json({ ok: true, progress: out });
      }

      /* ---------- 写入单条进度 ---------- */
      if (path === '/api/progress' && method === 'PUT') {
        const auth = await authUser(db, req);
        if (!auth) return json({ ok: false, error: '未授权' }, 401);
        const body = await readBody(req);
        const course = String(body.course || '');
        const type = String(body.type || '');
        if (!course || !type) return json({ ok: false, error: 'course/type 缺失' }, 400);
        const dataStr = typeof body.data === 'string' ? body.data : JSON.stringify(body.data);
        await db.prepare(
          'INSERT OR REPLACE INTO progress (user, course, type, data, updated) VALUES (?, ?, ?, ?, ?)'
        ).bind(auth.user, course, type, dataStr, Date.now()).run();
        return json({ ok: true });
      }

      return json({ ok: false, error: 'not found' }, 404);
    } catch (err) {
      return json({ ok: false, error: 'server error: ' + (err && err.message ? err.message : String(err)) }, 500);
    }
  }
};
