// =====================================================================
//  KC CRM — backend (Node.js thuần + PostgreSQL)
//  - Phục vụ giao diện web (thư mục dist/) và API /api/*
//  - Đăng nhập bằng cookie ký HMAC, mật khẩu mã hoá scrypt
//  - Phân quyền: admin xem/sửa tất cả; staff chỉ khách hàng owner_id = mình
// =====================================================================
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { q, initDb } from './db.js';

const PORT = Number(process.env.PORT || 3000);
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const SESSION_DAYS = 30;
const COOKIE = 'kc_sid';

let SECRET = process.env.SESSION_SECRET || '';

// ---------------------------------------------------------------------
//  Tiện ích
// ---------------------------------------------------------------------
class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const bad = (m) => new HttpError(400, m);
const forbidden = (m = 'Bạn không có quyền thực hiện thao tác này') => new HttpError(403, m);
const notFound = (m = 'Không tìm thấy') => new HttpError(404, m);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);
const needUuid = (s) => { if (!isUuid(s)) throw bad('ID không hợp lệ'); return s; };

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(keyHex, 'hex');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

/** token = payload.chữ_ký ; payload có "pv" (dấu vân tay mật khẩu) để đổi mật khẩu là đăng xuất mọi nơi */
function makeToken(user) {
  const payload = b64(JSON.stringify({ u: user.id, pv: user.password_hash.slice(-12), e: Date.now() + SESSION_DAYS * 864e5 }));
  return `${payload}.${sign(payload)}`;
}
function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return d.e > Date.now() && isUuid(d.u) ? d : null;
  } catch { return null; }
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function setSessionCookie(req, res, value, maxAgeSec) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  res.setHeader('Set-Cookie',
    `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`);
}

async function readJson(req) {
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw new HttpError(413, 'Dữ liệu gửi lên quá lớn');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw bad('JSON không hợp lệ'); }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

// ---------------------------------------------------------------------
//  Xác thực 2 bước (TOTP — RFC 6238, tương thích Google Authenticator / Microsoft Authenticator / Authy)
// ---------------------------------------------------------------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32encode(buf) {
  let bits = '', out = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
function b32decode(str) {
  let bits = '';
  for (const ch of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) bits += B32.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totpAt(secretB32, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', b32decode(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const code = (((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6;
  return String(code).padStart(6, '0');
}
/** Trả về "bước thời gian" khớp mã (chấp nhận lệch ±30 giây), 0 nếu sai. Mỗi mã chỉ dùng được 1 lần. */
function verifyTotp(secretB32, code, lastStep = 0) {
  if (!secretB32 || !/^\d{6}$/.test(code)) return 0;
  const now = Math.floor(Date.now() / 30000);
  for (const d of [0, -1, 1]) {
    const step = now + d;
    if (step > Number(lastStep) && crypto.timingSafeEqual(Buffer.from(totpAt(secretB32, step)), Buffer.from(code))) return step;
  }
  return 0;
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const normBackup = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Giới hạn đăng nhập sai: 10 lần / 15 phút / IP
const attempts = new Map();
function checkRate(ip) {
  const now = Date.now();
  const a = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60e3);
  attempts.set(ip, a);
  if (a.length >= 10) throw new HttpError(429, 'Đăng nhập sai quá nhiều lần, thử lại sau 15 phút');
}
const failRate = (ip) => attempts.set(ip, [...(attempts.get(ip) || []), Date.now()]);
// Sau proxy (Traefik của Dokploy): IP thật là phần tử CUỐI của X-Forwarded-For — phần đầu do client tự gửi, giả mạo được
const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || String(req.socket.remoteAddress || '');
// Dọn bộ đếm cũ mỗi 10 phút để không phình bộ nhớ
setInterval(() => { const now = Date.now(); for (const [k, v] of attempts) if (!v.some((t) => now - t < 15 * 60e3)) attempts.delete(k); }, 10 * 60e3).unref();

const MIN_PASSWORD = 8;
const SIGNUP_CODE = (process.env.SIGNUP_CODE || '').trim();
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ---------------------------------------------------------------------
//  Định nghĩa dữ liệu
// ---------------------------------------------------------------------
const USER_COLS = 'id, email, full_name, role, is_active, created_at, totp_enabled';
// Cột chỉ dùng nội bộ để xác thực — KHÔNG BAO GIỜ trả về trình duyệt (xem publicUser)
const AUTH_COLS = `${USER_COLS}, password_hash, totp_secret, totp_last_step, totp_backup`;

const CUSTOMER_COLS = `id, code, customer_type, school_name, school_type, province, district, address, website, fanpage,
  student_count, source, lifecycle, interests, tags, owner_id, created_by,
  created_at, updated_at`;

const CUSTOMER_FIELDS = {
  school_name: 'text', school_type: 'text', province: 'text', district: 'text', address: 'text',
  website: 'text', fanpage: 'text', student_count: 'intnull', source: 'text', customer_type: 'text',
  lifecycle: 'text', interests: 'textarr', tags: 'textarr', owner_id: 'uuidnull',
};

// Bảng con: cột được phép ghi + cột SELECT (ép kiểu ngày về text để không lệch múi giờ)
const CHILDREN = {
  contacts: {
    fields: { name: 'text', role: 'text', email: 'text', phone: 'text', zalo: 'text', is_primary: 'bool' },
    cols: 'id, customer_id, name, role, email, phone, zalo, is_primary, created_at',
    order: 'is_primary desc, created_at',
  },
  activities: {
    fields: { type: 'text', content: 'text' }, author: 'created_by',
    cols: 'id, customer_id, type, content, created_by, created_at',
    order: 'created_at desc',
  },
  notes: {
    fields: { text: 'text' }, author: 'author_id',
    cols: 'id, customer_id, text, author_id, created_at',
    order: 'created_at desc',
  },
  follow_ups: {
    fields: { due_date: 'date', content: 'text', priority: 'text', done: 'bool', assignee_id: 'uuidnull' },
    cols: 'id, customer_id, due_date::text as due_date, content, priority, done, assignee_id, created_at',
    order: 'due_date',
  },
  // Đơn hàng = cơ hội bán hàng. stage 'won' = đã chốt (tính doanh thu); các stage khác = đang theo đuổi.
  orders: {
    fields: {
      code: 'text', order_date: 'date', amount: 'num', products: 'textarr', stage: 'text',
      paid_amount: 'num', invoice_issued: 'bool', docs_received: 'bool', note: 'text',
    },
    author: 'created_by',
    cols: `id, customer_id, code, order_date::text as order_date, amount, products, stage, paid_amount,
           invoice_issued, docs_received, note, created_by, created_at`,
    order: 'order_date desc, created_at desc',
  },
};

/** Lọc & kiểm tra kiểu dữ liệu theo danh sách cột cho phép */
function clean(input, fields) {
  const out = {};
  for (const [k, type] of Object.entries(fields)) {
    if (!(k in (input || {}))) continue;
    let v = input[k];
    switch (type) {
      case 'text': if (typeof v !== 'string') throw bad(`Trường ${k} không hợp lệ`); v = v.slice(0, 5000); break;
      case 'bool': v = !!v; break;
      case 'num': v = Number(v); if (!Number.isFinite(v) || v < 0) throw bad(`Trường ${k} phải là số ≥ 0`); break;
      case 'intnull': v = v === null || v === '' ? null : Math.trunc(Number(v)); if (v !== null && !Number.isFinite(v)) throw bad(`Trường ${k} không hợp lệ`); break;
      case 'uuidnull': v = v || null; if (v !== null && !isUuid(v)) throw bad(`Trường ${k} không hợp lệ`); break;
      case 'textarr': if (!Array.isArray(v)) throw bad(`Trường ${k} không hợp lệ`); v = v.map(String).slice(0, 50); break;
      case 'date': if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad(`Ngày không hợp lệ`); break;
    }
    out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------
//  Phân quyền
// ---------------------------------------------------------------------
async function currentUser(req) {
  const t = readToken(parseCookies(req)[COOKIE]);
  if (!t) return null;
  const [u] = await q(`select ${AUTH_COLS} from users where id = $1`, [t.u]);
  if (!u || u.password_hash.slice(-12) !== t.pv) return null;
  return u;
}
const publicUser = ({ password_hash, totp_secret, totp_last_step, totp_backup, ...u }) => u; // eslint-disable-line no-unused-vars

function needActive(me) {
  if (!me) throw new HttpError(401, 'Chưa đăng nhập');
  if (!me.is_active) throw forbidden('Tài khoản chưa được quản lý duyệt');
  return me;
}
function needAdmin(me) {
  needActive(me);
  if (me.role !== 'admin') throw forbidden('Chỉ quản lý mới được thực hiện thao tác này');
  return me;
}
const isAdmin = (me) => me?.is_active && me.role === 'admin';

/** Trả về khách hàng nếu người dùng có quyền, ngược lại báo lỗi */
async function accessibleCustomer(me, id) {
  needActive(me);
  const [c] = await q(`select id, owner_id from customers where id = $1`, [needUuid(id)]);
  if (!c) throw notFound('Không tìm thấy khách hàng');
  if (!isAdmin(me) && c.owner_id !== me.id) throw forbidden();
  return c;
}

async function loadCustomers(where, params) {
  const cs = await q(`select ${CUSTOMER_COLS} from customers ${where} order by created_at desc`, params);
  if (!cs.length) return [];
  const ids = cs.map((c) => c.id);
  const byId = new Map(cs.map((c) => [c.id, Object.assign(c, { contacts: [], activities: [], notes: [], follow_ups: [], orders: [] })]));
  for (const [table, def] of Object.entries(CHILDREN)) {
    const rows = await q(`select ${def.cols} from ${table} where customer_id = any($1::uuid[]) order by ${def.order}`, [ids]);
    for (const r of rows) byId.get(r.customer_id)?.[table].push(r);
  }
  return cs;
}

function insertSql(table, data, returning = 'id') {
  const keys = Object.keys(data);
  const cols = keys.join(', ');
  const vals = keys.map((_, i) => `$${i + 1}`).join(', ');
  return [`insert into ${table} (${cols}) values (${vals}) returning ${returning}`, keys.map((k) => data[k])];
}
function updateSql(table, data, id, extra = '') {
  const keys = Object.keys(data);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  return [`update ${table} set ${sets}${extra} where id = $${keys.length + 1} returning id`, [...keys.map((k) => data[k]), id]];
}

// ---------------------------------------------------------------------
//  Routes
// ---------------------------------------------------------------------
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
};

route('GET', '/api/health', async () => { await q('select 1 as ok'); return { ok: true }; });

// ----- Auth -----
route('POST', '/api/auth/register', async ({ body, req, res }) => {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const fullName = String(body.full_name || '').trim().slice(0, 100);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Email không hợp lệ');
  if (password.length < MIN_PASSWORD) throw bad(`Mật khẩu tối thiểu ${MIN_PASSWORD} ký tự`);
  if (!fullName) throw bad('Vui lòng nhập họ tên');
  // Chống đăng ký rác: giới hạn theo IP + (tuỳ chọn) mã đăng ký nội bộ SIGNUP_CODE
  const ip = clientIp(req);
  checkRate('reg:' + ip);
  failRate('reg:' + ip);
  if (SIGNUP_CODE && !safeEqual(body.signup_code || '', SIGNUP_CODE)) throw forbidden('Mã đăng ký không đúng. Hãy hỏi quản lý để lấy mã.');
  const [exists] = await q('select 1 as x from users where email = $1', [email]);
  if (exists) throw new HttpError(409, 'Email này đã được đăng ký');
  // Người đầu tiên = quản lý tổng (đã kích hoạt); người sau = nhân viên chờ duyệt
  const [u] = await q(
    `insert into users (email, password_hash, full_name, role, is_active)
     select $1::text, $2::text, $3::text,
            case when exists (select 1 from users) then 'staff' else 'admin' end,
            not exists (select 1 from users)
     returning ${AUTH_COLS}`,
    [email, hashPassword(password), fullName]);
  setSessionCookie(req, res, makeToken(u), SESSION_DAYS * 86400);
  return publicUser(u);
});

route('POST', '/api/auth/login', async ({ body, req, res }) => {
  const ip = clientIp(req);
  const email = String(body.email || '').trim().toLowerCase();
  checkRate(ip);
  const [u] = await q(`select ${AUTH_COLS} from users where email = $1`, [email]);
  if (!u || !verifyPassword(String(body.password || ''), u.password_hash)) {
    failRate(ip);
    throw new HttpError(401, 'Sai email hoặc mật khẩu');
  }
  // Bước 2: mã từ ứng dụng xác thực (hoặc mã dự phòng dùng 1 lần)
  if (u.totp_enabled) {
    const otp = String(body.otp || '').trim();
    if (!otp) throw new HttpError(401, 'Nhập mã xác thực 2 bước', { need_otp: true });
    const step = verifyTotp(u.totp_secret, otp.replace(/\s/g, ''), u.totp_last_step);
    if (step) {
      await q('update users set totp_last_step = $1 where id = $2 returning id', [step, u.id]);
    } else {
      const h = sha256(normBackup(otp));
      if (normBackup(otp).length >= 8 && (u.totp_backup || []).includes(h)) {
        await q('update users set totp_backup = array_remove(totp_backup, $1) where id = $2 returning id', [h, u.id]);
      } else {
        failRate(ip);
        throw new HttpError(401, 'Mã xác thực không đúng hoặc đã hết hạn', { need_otp: true });
      }
    }
  }
  setSessionCookie(req, res, makeToken(u), SESSION_DAYS * 86400);
  return publicUser(u);
});

// ----- Xác thực 2 bước -----
route('POST', '/api/auth/2fa/setup', async ({ me }) => {
  if (!me) throw new HttpError(401, 'Chưa đăng nhập');
  if (me.totp_enabled) throw bad('Xác thực 2 bước đã được bật');
  const secret = b32encode(crypto.randomBytes(20));
  await q('update users set totp_secret = $1 where id = $2 returning id', [secret, me.id]);
  const label = encodeURIComponent(`KC CRM:${me.email}`);
  return { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=KC%20CRM` };
});

route('POST', '/api/auth/2fa/enable', async ({ me, body }) => {
  if (!me) throw new HttpError(401, 'Chưa đăng nhập');
  if (me.totp_enabled) throw bad('Xác thực 2 bước đã được bật');
  const step = verifyTotp(me.totp_secret, String(body.code || '').replace(/\s/g, ''));
  if (!step) throw bad('Mã không đúng. Kiểm tra lại giờ trên điện thoại và nhập mã mới nhất.');
  // 8 mã dự phòng, mỗi mã dùng 1 lần — chỉ lưu dạng băm
  const codes = Array.from({ length: 8 }, () => { const x = b32encode(crypto.randomBytes(5)).toLowerCase(); return `${x.slice(0, 4)}-${x.slice(4, 8)}`; });
  await q('update users set totp_enabled = true, totp_last_step = $1, totp_backup = $2 where id = $3 returning id',
    [step, codes.map((c) => sha256(normBackup(c))), me.id]);
  return { backup_codes: codes };
});

route('POST', '/api/auth/2fa/disable', async ({ me, body }) => {
  if (!me) throw new HttpError(401, 'Chưa đăng nhập');
  if (!verifyPassword(String(body.password || ''), me.password_hash)) throw bad('Mật khẩu không đúng');
  await q(`update users set totp_enabled = false, totp_secret = null, totp_last_step = 0, totp_backup = '{}' where id = $1 returning id`, [me.id]);
  return { ok: true };
});

// Quản lý tắt 2 bước giúp nhân viên mất điện thoại
route('POST', '/api/profiles/:id/disable-2fa', async ({ me, params }) => {
  needAdmin(me);
  const rows = await q(`update users set totp_enabled = false, totp_secret = null, totp_last_step = 0, totp_backup = '{}' where id = $1 returning id`, [needUuid(params.id)]);
  if (!rows.length) throw notFound('Không tìm thấy tài khoản');
  return { ok: true };
});

route('POST', '/api/auth/logout', async ({ req, res }) => { setSessionCookie(req, res, '', 0); return { ok: true }; });

route('GET', '/api/auth/me', async ({ me }) => (me ? publicUser(me) : null));

route('POST', '/api/auth/password', async ({ me, body, req, res }) => {
  if (!me) throw new HttpError(401, 'Chưa đăng nhập');
  if (!verifyPassword(String(body.old_password || ''), me.password_hash)) throw bad('Mật khẩu hiện tại không đúng');
  if (String(body.new_password || '').length < MIN_PASSWORD) throw bad(`Mật khẩu mới tối thiểu ${MIN_PASSWORD} ký tự`);
  const [u] = await q(`update users set password_hash = $1 where id = $2 returning ${AUTH_COLS}`,
    [hashPassword(String(body.new_password)), me.id]);
  setSessionCookie(req, res, makeToken(u), SESSION_DAYS * 86400);
  return { ok: true };
});

// ----- Users / nhân viên -----
route('GET', '/api/profiles', async ({ me }) => {
  needActive(me);
  return q(`select ${USER_COLS} from users order by created_at`);
});

route('PATCH', '/api/profiles/:id', async ({ me, params, body }) => {
  if (!me) throw new HttpError(401, 'Chưa đăng nhập');
  const id = needUuid(params.id);
  const patch = {};
  if ('full_name' in body) patch.full_name = String(body.full_name).trim().slice(0, 100);
  if ('role' in body) { if (!['admin', 'staff'].includes(body.role)) throw bad('Vai trò không hợp lệ'); patch.role = body.role; }
  if ('is_active' in body) patch.is_active = !!body.is_active;
  if (!Object.keys(patch).length) return { ok: true };

  if (!isAdmin(me)) {
    if (id !== me.id || 'role' in patch || 'is_active' in patch)
      throw forbidden('Chỉ quản lý mới được đổi vai trò / trạng thái tài khoản');
  }
  if (id === me.id && me.role === 'admin' && (patch.role === 'staff' || patch.is_active === false))
    throw forbidden('Không thể tự hạ quyền hoặc tự khoá tài khoản quản lý của chính mình');

  const [sql, vals] = updateSql('users', patch, id);
  const rows = await q(sql, vals);
  if (!rows.length) throw notFound('Không tìm thấy tài khoản');
  return { ok: true };
});

route('POST', '/api/profiles/:id/reset-password', async ({ me, params, body }) => {
  needAdmin(me);
  const pw = String(body.password || '');
  if (pw.length < MIN_PASSWORD) throw bad(`Mật khẩu tối thiểu ${MIN_PASSWORD} ký tự`);
  const rows = await q('update users set password_hash = $1 where id = $2 returning id', [hashPassword(pw), needUuid(params.id)]);
  if (!rows.length) throw notFound('Không tìm thấy tài khoản');
  return { ok: true };
});

// ----- Khách hàng -----
route('GET', '/api/customers', async ({ me }) => {
  needActive(me);
  return isAdmin(me) ? loadCustomers('', []) : loadCustomers('where owner_id = $1', [me.id]);
});

route('POST', '/api/customers', async ({ me, body }) => {
  needActive(me);
  const data = clean(body.data, CUSTOMER_FIELDS);
  if (!data.school_name?.trim()) throw bad('Vui lòng nhập tên trường');
  data.school_name = data.school_name.trim();
  if (!isAdmin(me)) data.owner_id = me.id; // nhân viên: luôn là khách của mình
  if (data.owner_id === undefined) data.owner_id = me.id;
  data.created_by = me.id;
  const [sql, vals] = insertSql('customers', data);
  const [{ id }] = await q(sql, vals);
  const ct = clean(body.contact || {}, CHILDREN.contacts.fields);
  if (ct.name?.trim()) {
    const [s2, v2] = insertSql('contacts', { ...ct, customer_id: id, is_primary: true });
    await q(s2, v2);
  }
  return (await loadCustomers('where id = $1', [id]))[0];
});

async function patchCustomer(me, id, body) {
  const c = await accessibleCustomer(me, id);
  const data = clean(body, CUSTOMER_FIELDS);
  if ('owner_id' in data && data.owner_id !== c.owner_id && !isAdmin(me))
    throw forbidden('Chỉ quản lý mới được chuyển giao khách hàng');
  if ('school_name' in data && !data.school_name.trim()) throw bad('Tên trường không được để trống');
  if (!Object.keys(data).length) return;
  const [sql, vals] = updateSql('customers', data, c.id, ', updated_at = now()');
  await q(sql, vals);
}

route('PATCH', '/api/customers/:id', async ({ me, params, body }) => { await patchCustomer(me, params.id, body); return { ok: true }; });

route('POST', '/api/customers/bulk-update', async ({ me, body }) => {
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (ids.length > 1000) throw bad('Quá nhiều khách hàng');
  for (const id of ids) await patchCustomer(me, id, body.patch || {});
  return { ok: true };
});

route('POST', '/api/customers/bulk-delete', async ({ me, body }) => {
  needAdmin(me);
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter(isUuid);
  if (!ids.length) return { ok: true };
  await q('delete from customers where id = any($1::uuid[]) returning id', [ids]);
  return { ok: true };
});

route('GET', '/api/duplicates', async ({ me, url }) => {
  needActive(me);
  const name = String(url.searchParams.get('name') || '').trim().toLowerCase();
  if (name.length < 3) return [];
  return q(
    `select c.code, c.school_name, coalesce(u.full_name, '—') as owner_name
       from customers c left join users u on u.id = c.owner_id
      where position($1::text in lower(c.school_name)) > 0
      limit 5`, [name]);
});

// ----- Bảng con: liên hệ, hoạt động, ghi chú, follow-up, đơn hàng -----
route('POST', '/api/children/:table', async ({ me, params, body }) => {
  const def = CHILDREN[params.table];
  if (!def) throw notFound();
  await accessibleCustomer(me, body.customer_id);
  const data = clean(body, def.fields);
  data.customer_id = body.customer_id;
  if (def.author) data[def.author] = me.id;
  if (params.table === 'follow_ups' && !data.assignee_id) data.assignee_id = me.id;
  if (params.table === 'orders' && !data.code?.trim()) delete data.code; // để database tự sinh mã DH-000001
  const [sql, vals] = insertSql(params.table, data, def.cols);
  const [row] = await q(sql, vals);
  await q('update customers set updated_at = now() where id = $1 returning id', [data.customer_id]);
  return row;
});

async function childAccess(me, table, id) {
  if (!CHILDREN[table]) throw notFound();
  const [row] = await q(`select customer_id from ${table} where id = $1`, [needUuid(id)]);
  if (!row) throw notFound();
  await accessibleCustomer(me, row.customer_id);
}

route('PATCH', '/api/children/:table/:id', async ({ me, params, body }) => {
  await childAccess(me, params.table, params.id);
  const data = clean(body, CHILDREN[params.table].fields);
  if (Object.keys(data).length) { const [sql, vals] = updateSql(params.table, data, params.id); await q(sql, vals); }
  return { ok: true };
});

route('DELETE', '/api/children/:table/:id', async ({ me, params }) => {
  await childAccess(me, params.table, params.id);
  await q(`delete from ${params.table} where id = $1 returning id`, [params.id]);
  return { ok: true };
});

// ---------------------------------------------------------------------
//  Static files (giao diện)
// ---------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
};

async function serveStatic(req, res, pathname) {
  if (pathname === '/env.js') {
    res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' });
    return res.end(`window.__ENV__ = { BACKEND: "1", SIGNUP_CODE_REQUIRED: "${SIGNUP_CODE ? '1' : ''}" };`);
  }
  let file = path.join(DIST, path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(DIST)) file = path.join(DIST, 'index.html');
  let st = await stat(file).catch(() => null);
  if (!st || st.isDirectory()) { file = path.join(DIST, 'index.html'); st = await stat(file).catch(() => null); }
  if (!st) { res.writeHead(404); return res.end('Chưa build giao diện (npm run build)'); }
  const ext = path.extname(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  res.end(await readFile(file));
}

// ---------------------------------------------------------------------
//  Server
// ---------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow'); // web nội bộ: không cho Google lập chỉ mục
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Chỉ cho chạy script của chính web này → hạn chế mã độc chèn vào trang
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  const url = new URL(req.url, 'http://localhost');
  try {
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
      return await serveStatic(req, res, url.pathname);
    }
    // Chống CSRF: mọi request ghi dữ liệu phải có header do giao diện tự thêm
    if (req.method !== 'GET' && req.headers['x-kc-request'] !== '1') throw forbidden('Yêu cầu không hợp lệ');

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const body = req.method === 'GET' ? {} : await readJson(req);
      const me = await currentUser(req);
      const result = await r.handler({ req, res, url, params, body, me });
      return send(res, 200, result ?? null);
    }
    throw notFound('API không tồn tại');
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.extra || {}) });
    // Lỗi từ PostgreSQL
    if (e?.code === '23514' || e?.code === '22P02' || e?.code === '22007' || e?.code === '22008') return send(res, 400, { error: 'Dữ liệu không hợp lệ' });
    if (e?.code === '23505') return send(res, 409, { error: 'Dữ liệu bị trùng' });
    if (e?.code === '23503') return send(res, 400, { error: 'Dữ liệu liên kết không tồn tại' });
    console.error(e);
    return send(res, 500, { error: 'Lỗi máy chủ' });
  }
});

await initDb();
if (!SECRET) {
  const [row] = await q(`select value from app_settings where key = 'session_secret'`);
  SECRET = row.value;
}
server.listen(PORT, () => console.log(`✅ KC CRM đang chạy tại http://localhost:${PORT}`));
