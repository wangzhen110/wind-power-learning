/**
 * 风电标准学习平台 · 后端 API
 * Cloudflare Workers + D1
 *
 * 密码哈希与前端一致：sha256(salt + ':' + encodeURIComponent(pwd))
 * 前端用纯 JS SHA-256（ASCII 输入），此处用 Web Crypto SHA-256（UTF-8 编码），
 * 由于 encodeURIComponent 输出纯 ASCII，两者结果一致。
 */

// ============ 工具函数 ============

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

async function hashPassword(salt, pwd) {
  const input = salt + ':' + encodeURIComponent(String(pwd));
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randSalt() {
  let s = '';
  const chars = 'abcdef0123456789';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 16; i++) s += chars[bytes[i] % 16];
  return s + '_' + Date.now().toString(36);
}

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// ============ 鉴权 ============

async function authUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const now = Date.now();
  const result = await env.DB.prepare(
    'SELECT user, expires FROM sessions WHERE token = ?'
  ).bind(token).first();
  if (!result || result.expires < now) return null;
  return result.user;
}

// ============ 路由处理 ============

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // 健康检查
  if (path === '/api/health' && method === 'GET') {
    return jsonResponse({ ok: true, time: Date.now() });
  }

  // 注册
  if (path === '/api/register' && method === 'POST') {
    const body = await readBody(request);
    if (!body || !body.user || !body.password) {
      return jsonResponse({ ok: false, error: '缺少账号或密码' }, 400);
    }
    const user = String(body.user).trim();
    const nick = body.nick ? String(body.nick).trim() : user;
    if (user.length < 1 || user.length > 30) {
      return jsonResponse({ ok: false, error: '账号长度需 1-30 位' }, 400);
    }
    if (String(body.password).length < 4) {
      return jsonResponse({ ok: false, error: '密码至少 4 位' }, 400);
    }
    // 检查用户是否存在
    const existing = await env.DB.prepare(
      'SELECT user FROM users WHERE user = ?'
    ).bind(user).first();
    if (existing) {
      return jsonResponse({ ok: false, error: '该账号已存在' }, 409);
    }
    const salt = randSalt();
    const hash = await hashPassword(salt, body.password);
    await env.DB.prepare(
      'INSERT INTO users (user, salt, hash, nick, created) VALUES (?, ?, ?, ?, ?)'
    ).bind(user, salt, hash, nick, Date.now()).run();
    return jsonResponse({ ok: true, user, nick });
  }

  // 登录
  if (path === '/api/login' && method === 'POST') {
    const body = await readBody(request);
    if (!body || !body.user || !body.password) {
      return jsonResponse({ ok: false, error: '缺少账号或密码' }, 400);
    }
    const user = String(body.user).trim();
    const rec = await env.DB.prepare(
      'SELECT user, salt, hash, nick FROM users WHERE user = ?'
    ).bind(user).first();
    if (!rec) {
      return jsonResponse({ ok: false, error: '账号不存在' }, 401);
    }
    const hash = await hashPassword(rec.salt, body.password);
    if (hash !== rec.hash) {
      return jsonResponse({ ok: false, error: '密码不正确' }, 401);
    }
    const token = generateToken();
    const now = Date.now();
    const expires = now + 30 * 24 * 60 * 60 * 1000; // 30 天
    await env.DB.prepare(
      'INSERT INTO sessions (token, user, created, expires) VALUES (?, ?, ?, ?)'
    ).bind(token, user, now, expires).run();
    return jsonResponse({ ok: true, token, user, nick: rec.nick });
  }

  // 登出
  if (path === '/api/logout' && method === 'POST') {
    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token) {
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    }
    return jsonResponse({ ok: true });
  }

  // 以下接口需要鉴权
  const user = await authUser(request, env);
  if (!user) {
    return jsonResponse({ ok: false, error: '未登录或登录已过期' }, 401);
  }

  // 获取单门课程单类型进度
  if (path === '/api/progress' && method === 'GET') {
    const course = url.searchParams.get('course');
    const type = url.searchParams.get('type');
    if (!course || !type) {
      return jsonResponse({ ok: false, error: '缺少 course 或 type 参数' }, 400);
    }
    const row = await env.DB.prepare(
      'SELECT data, updated FROM progress WHERE user = ? AND course = ? AND type = ?'
    ).bind(user, course, type).first();
    if (!row) {
      return jsonResponse({ ok: true, data: null, updated: 0 });
    }
    let data = null;
    try { data = JSON.parse(row.data); } catch { data = null; }
    return jsonResponse({ ok: true, data, updated: row.updated });
  }

  // 获取全部课程进度
  if (path === '/api/progress/all' && method === 'GET') {
    const result = await env.DB.prepare(
      'SELECT course, type, data, updated FROM progress WHERE user = ?'
    ).bind(user).all();
    const progress = {};
    for (const row of result.results || []) {
      if (!progress[row.course]) progress[row.course] = {};
      let data = null;
      try { data = JSON.parse(row.data); } catch { data = null; }
      progress[row.course][row.type] = { data, updated: row.updated };
    }
    return jsonResponse({ ok: true, progress });
  }

  // 保存进度
  if (path === '/api/progress' && method === 'PUT') {
    const body = await readBody(request);
    if (!body || !body.course || !body.type || body.data === undefined) {
      return jsonResponse({ ok: false, error: '缺少 course/type/data' }, 400);
    }
    const dataStr = JSON.stringify(body.data);
    const updated = Date.now();
    await env.DB.prepare(
      `INSERT INTO progress (user, course, type, data, updated) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user, course, type) DO UPDATE SET data = excluded.data, updated = excluded.updated`
    ).bind(user, body.course, body.type, dataStr, updated).run();
    return jsonResponse({ ok: true, updated });
  }

  return jsonResponse({ ok: false, error: '接口不存在' }, 404);
}

// ============ Workers 入口 ============

export default {
  async fetch(request, env, ctx) {
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    try {
      return await handleRequest(request, env);
    } catch (err) {
      console.error('API error:', err);
      return jsonResponse({ ok: false, error: '服务器内部错误: ' + err.message }, 500);
    }
  },
};
