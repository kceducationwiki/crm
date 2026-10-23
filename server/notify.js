// =====================================================================
//  Nhắc việc qua EMAIL và ZALO
//  - Mỗi ngày (giờ cài đặt, giờ Việt Nam) gửi cho từng người 1 tin tổng hợp:
//      • follow-up đến hạn hôm nay / đã trễ
//      • đơn đã chốt chạm mốc 10 / 20 / 25 / 30 ngày (cài được) mà còn nợ, chưa xuất hoá đơn hoặc thiếu giấy tờ
//        (sau mốc cuối: nhắc lại mỗi N ngày cho tới khi xong)
//  - Nhân viên nhận nhắc của khách mình phụ trách; quản lý nhận của toàn bộ khách (tắt được).
//  - Email: gửi qua SMTP (Gmail / Google Workspace / mail công ty) — biến môi trường SMTP_*
//  - Zalo: qua Zalo Bot (bot.zaloplatforms.com) — biến môi trường ZALO_BOT_TOKEN
//    Mỗi người tự kết nối: Cài đặt → Thông báo → lấy mã → nhắn mã đó cho bot.
// =====================================================================
import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import crypto from 'node:crypto';
import { q } from './db.js';

const env = (k, d = '') => String(process.env[k] ?? d).trim();

// ---------------------------------------------------------------------
//  Cấu hình
// ---------------------------------------------------------------------
export const SMTP = {
  host: env('SMTP_HOST'),
  port: Number(env('SMTP_PORT', '465')),
  user: env('SMTP_USER'),
  pass: env('SMTP_PASS'),
  from: env('SMTP_FROM') || env('SMTP_USER'),
  // TLS ngay từ đầu (mặc định với cổng 465); cổng khác dùng STARTTLS
  secure: env('SMTP_SECURE') ? env('SMTP_SECURE') === 'true' : Number(env('SMTP_PORT', '465')) === 465,
};
const ZALO_TOKEN = env('ZALO_BOT_TOKEN');
const ZALO_BASE = env('ZALO_API_BASE', 'https://bot-api.zaloplatforms.com').replace(/\/$/, '');
const APP_URL = env('APP_URL').replace(/\/$/, '');

export const emailReady = () => !!(SMTP.host && SMTP.from);
export const zaloReady = () => !!ZALO_TOKEN;

const DEFAULTS = { hour: 8, milestones: [10, 20, 25, 30], repeat: 7 };

export async function getSettings() {
  const [row] = await q(`select value from app_settings where key = 'notify'`);
  let v = {};
  try { v = JSON.parse(row?.value || '{}'); } catch { /* dùng mặc định */ }
  return normSettings({ ...DEFAULTS, ...v });
}
export function normSettings(s) {
  const hour = Math.min(23, Math.max(0, Math.trunc(Number(s.hour))));
  const milestones = [...new Set((Array.isArray(s.milestones) ? s.milestones : String(s.milestones || '').split(/[,;\s]+/))
    .map((x) => Math.trunc(Number(x))).filter((x) => Number.isFinite(x) && x > 0 && x <= 3650))].sort((a, b) => a - b).slice(0, 20);
  const repeat = Math.min(365, Math.max(0, Math.trunc(Number(s.repeat) || 0)));
  return { hour: Number.isFinite(hour) ? hour : DEFAULTS.hour, milestones: milestones.length ? milestones : DEFAULTS.milestones, repeat };
}
export async function saveSettings(s) {
  const v = normSettings(s);
  await q(`insert into app_settings (key, value) values ('notify', $1)
           on conflict (key) do update set value = excluded.value returning key`, [JSON.stringify(v)]);
  return v;
}

// ---------------------------------------------------------------------
//  Ngày giờ Việt Nam (UTC+7, không có giờ mùa hè)
// ---------------------------------------------------------------------
const vnNow = () => new Date(Date.now() + 7 * 3600e3);
export const vnToday = () => vnNow().toISOString().slice(0, 10);
const vnHour = () => vnNow().getUTCHours();
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5);
const dmy = (d) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
const money = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₫';

/** Mốc đã chạm tới (lớn nhất ≤ số ngày), tính cả các lần nhắc lại sau mốc cuối. 0 = chưa tới mốc đầu. */
export function reachedMilestone(days, { milestones, repeat }) {
  let m = 0;
  for (const x of milestones) if (days >= x) m = x;
  const last = milestones[milestones.length - 1];
  if (repeat > 0 && days > last) m = last + Math.floor((days - last) / repeat) * repeat;
  return m;
}

// ---------------------------------------------------------------------
//  Gửi email qua SMTP (không cần thư viện ngoài)
//  - Cổng 465: TLS ngay từ đầu.  - Cổng 587/25: STARTTLS (bắt buộc nếu có mật khẩu, trừ máy chủ localhost)
// ---------------------------------------------------------------------
const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);
const addrOf = (s) => (String(s).match(/<([^>]+)>/)?.[1] || String(s)).trim();
const b64lines = (s) => Buffer.from(s).toString('base64').replace(/.{1,76}/g, '$&\r\n');

function smtpConn(sock) {
  let buf = '', waiter = null, sockErr = null;
  const lines = [];
  const pump = () => {
    if (!waiter) return;
    if (sockErr) { const w = waiter; waiter = null; return w.reject(sockErr); }
    // Phản hồi hoàn chỉnh = dòng có dạng "250 ..." (dấu cách sau mã)
    const i = lines.findIndex((l) => /^\d{3}(?: |$)/.test(l));
    if (i < 0) return;
    const part = lines.splice(0, i + 1);
    const w = waiter; waiter = null;
    w.resolve({ code: Number(part[i].slice(0, 3)), text: part.join('\n') });
  };
  const attach = (s) => {
    s.setEncoding('utf8');
    s.on('data', (d) => { buf += d; let k; while ((k = buf.indexOf('\n')) >= 0) { lines.push(buf.slice(0, k).replace(/\r$/, '')); buf = buf.slice(k + 1); } pump(); });
    s.on('error', (e) => { sockErr = e; pump(); });
    s.on('close', () => { sockErr = sockErr || new Error('Máy chủ email đã đóng kết nối'); pump(); });
    s.setTimeout(20000, () => { sockErr = new Error('Máy chủ email không phản hồi (timeout)'); s.destroy(); pump(); });
  };
  attach(sock);
  const c = {
    sock,
    read: () => new Promise((resolve, reject) => { waiter = { resolve, reject }; pump(); }),
    async cmd(line, ok, label) {
      if (line !== null) c.sock.write(line + '\r\n');
      const r = await c.read();
      if (!ok.includes(r.code)) throw new Error(`Email lỗi ở bước ${label || line?.split(' ')[0]}: ${r.text.split('\n').pop()}`);
      return r;
    },
    upgrade(host) {
      return new Promise((resolve, reject) => {
        c.sock.removeAllListeners('data'); c.sock.removeAllListeners('close'); c.sock.removeAllListeners('error'); c.sock.setTimeout(0);
        const t = tls.connect({ socket: c.sock, servername: host }, () => resolve());
        t.once('error', reject);
        c.sock = t; buf = ''; lines.length = 0; sockErr = null; attach(t);
      });
    },
  };
  return c;
}

export async function sendEmail(to, subject, text, html) {
  if (!emailReady()) throw new Error('Chưa cấu hình máy chủ email (SMTP_HOST, SMTP_USER, SMTP_PASS)');
  const { host, port, user, pass, from } = SMTP;
  const implicitTls = SMTP.secure;
  const raw = await new Promise((resolve, reject) => {
    const s = implicitTls ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    s.once(implicitTls ? 'secureConnect' : 'connect', () => { s.removeListener('error', reject); resolve(s); });
    s.once('error', reject);
    s.setTimeout(20000, () => s.destroy(new Error('Không kết nối được máy chủ email (timeout)')));
  });
  const c = smtpConn(raw);
  try {
    await c.cmd(null, [220], 'chào máy chủ');
    const helo = `EHLO ${os.hostname().replace(/[^a-zA-Z0-9.-]/g, '') || 'kc-crm'}`;
    let ehlo = await c.cmd(helo, [250]);
    if (!implicitTls) {
      if (/STARTTLS/i.test(ehlo.text)) {
        await c.cmd('STARTTLS', [220]);
        await c.upgrade(host);
        ehlo = await c.cmd(helo, [250]);
      } else if (user && !['localhost', '127.0.0.1', '::1'].includes(host)) {
        throw new Error('Máy chủ email không hỗ trợ mã hoá (STARTTLS) — dừng để không lộ mật khẩu. Hãy dùng cổng 465 hoặc 587.');
      }
    }
    if (user) {
      await c.cmd('AUTH LOGIN', [334], 'đăng nhập');
      await c.cmd(Buffer.from(user).toString('base64'), [334], 'đăng nhập (tài khoản)');
      await c.cmd(Buffer.from(pass).toString('base64'), [235], 'đăng nhập (mật khẩu)');
    }
    await c.cmd(`MAIL FROM:<${addrOf(from)}>`, [250]);
    await c.cmd(`RCPT TO:<${addrOf(to)}>`, [250, 251], 'người nhận');
    await c.cmd('DATA', [354]);
    const boundary = 'kc_' + crypto.randomBytes(12).toString('hex');
    const fromName = String(from).includes('<') ? String(from).split('<')[0].trim().replace(/^"|"$/g, '') : 'KC CRM';
    const domain = addrOf(from).split('@')[1] || 'kc-crm';
    const msg = [
      `From: ${encWord(fromName || 'KC CRM')} <${addrOf(from)}>`,
      `To: <${addrOf(to)}>`,
      `Subject: ${encWord(subject)}`,
      `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
      `Message-ID: <${crypto.randomUUID()}@${domain}>`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64lines(text),
      `--${boundary}`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64lines(html),
      `--${boundary}--`, '',
    ].join('\r\n').replace(/\r\n\./g, '\r\n..');
    c.sock.write(msg + '\r\n.\r\n');
    await c.cmd(null, [250], 'gửi nội dung');
    c.sock.write('QUIT\r\n');
  } finally {
    setTimeout(() => c.sock.destroy(), 1000).unref();
  }
}

// ---------------------------------------------------------------------
//  Zalo Bot API
// ---------------------------------------------------------------------
async function zalo(method, body = {}, timeoutMs = 15000) {
  if (!zaloReady()) throw new Error('Chưa cấu hình Zalo Bot (ZALO_BOT_TOKEN)');
  const res = await fetch(`${ZALO_BASE}/bot${ZALO_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok || !data || data.ok === false) {
    throw new Error(`Zalo ${method} lỗi: ${data?.description || data?.message || data?.error_code || res.status}`);
  }
  return data.result;
}

/** Gửi tin Zalo, tự cắt nếu dài hơn 2000 ký tự */
export async function sendZalo(chatId, text) {
  const parts = [];
  let cur = '';
  for (const line of text.split('\n')) {
    const l = line.slice(0, 1900);
    if ((cur + '\n' + l).length > 1900) { parts.push(cur); cur = l; } else cur = cur ? cur + '\n' + l : l;
  }
  if (cur) parts.push(cur);
  for (const p of parts) await zalo('sendMessage', { chat_id: chatId, text: p });
}

let botInfo = null;
export const botName = () => botInfo?.display_name || botInfo?.account_name || botInfo?.name || '';

// Mã kết nối: 6 ký tự chữ+số (~1 tỷ khả năng), hết hạn sau 15 phút, sai 5 lần / giờ / người nhắn thì bị chặn
const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export async function newLinkCode(userId) {
  const code = 'KC-' + Array.from(crypto.randomBytes(6), (b) => CODE_ALPHA[b % CODE_ALPHA.length]).join('');
  await q(`update users set zalo_link_code = $1, zalo_link_expires = now() + interval '15 minutes' where id = $2 returning id`, [code, userId]);
  return code;
}
const wrongTries = new Map();

/** Xử lý 1 tin nhắn người dùng gửi cho bot (từ webhook hoặc getUpdates) */
export async function handleZaloUpdate(u) {
  const ev = u?.result && !u.message ? u.result : u;
  const m = ev?.message;
  const chatId = m?.chat?.id || m?.from?.id;
  if (!chatId || m?.from?.is_bot) return;
  const text = String(m.text || '').toUpperCase();
  const code = text.match(/KC-?([A-Z0-9]{6})/)?.[1];
  const now = Date.now();
  const tries = (wrongTries.get(chatId) || []).filter((t) => now - t < 3600e3);
  if (code && tries.length < 5) {
    const [user] = await q(
      `update users set zalo_chat_id = $1, zalo_link_code = null, zalo_link_expires = null, notify_zalo = true
        where zalo_link_code = $2 and zalo_link_expires > now() and is_active returning full_name, email`,
      [String(chatId), 'KC-' + code]);
    if (user) {
      wrongTries.delete(chatId);
      return sendZalo(chatId, `✅ Đã kết nối KC CRM với tài khoản ${user.full_name || user.email}.\nTừ giờ bạn sẽ nhận nhắc follow-up, công nợ, hoá đơn và giấy tờ tại đây.`);
    }
    wrongTries.set(chatId, [...tries, now]);
    return sendZalo(chatId, '❌ Mã không đúng hoặc đã hết hạn (mã dùng được 15 phút). Vào KC CRM → Cài đặt → Thông báo để lấy mã mới.');
  }
  if (tries.length >= 5) return;
  const [linked] = await q('select full_name from users where zalo_chat_id = $1', [String(chatId)]);
  return sendZalo(chatId, linked
    ? `Bạn đang nhận nhắc việc KC CRM cho tài khoản ${linked.full_name}. Bot này chỉ gửi thông báo, không trả lời tin nhắn.`
    : 'Xin chào! Đây là bot nhắc việc của KC CRM.\nĐể nhận thông báo: đăng nhập KC CRM → Cài đặt → Thông báo → "Kết nối Zalo", rồi gửi mã (dạng KC-XXXXXX) vào đây.');
}

/** Secret để Zalo ký webhook (lấy từ khoá phiên, không cần cấu hình thêm) */
let webhookSecret = '';
export const checkWebhookSecret = (h) => !!webhookSecret && typeof h === 'string' && h.length === webhookSecret.length
  && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(webhookSecret));

async function startZalo(sessionSecret) {
  if (!zaloReady()) return;
  try { botInfo = await zalo('getMe'); console.log(`🤖 Zalo Bot: ${botName() || 'đã kết nối'}`); }
  catch (e) { console.error('⚠️  Không kết nối được Zalo Bot — kiểm tra ZALO_BOT_TOKEN:', e.message); return; }
  webhookSecret = crypto.createHmac('sha256', sessionSecret).update('zalo-webhook').digest('hex').slice(0, 40);
  if (APP_URL.startsWith('https://')) {
    // Chạy trên mạng (có HTTPS): Zalo đẩy tin nhắn về /api/zalo/webhook
    try { await zalo('setWebhook', { url: `${APP_URL}/api/zalo/webhook`, secret_token: webhookSecret }); console.log('🤖 Zalo webhook:', `${APP_URL}/api/zalo/webhook`); }
    catch (e) { console.error('⚠️  Đặt Zalo webhook thất bại:', e.message); }
    return;
  }
  // Chạy trên máy (không có HTTPS công khai): tự hỏi Zalo có tin nhắn mới không
  try { await zalo('deleteWebhook'); } catch { /* có thể chưa từng đặt */ }
  (async function poll() {
    for (;;) {
      try {
        const r = await zalo('getUpdates', { timeout: '30' }, 40000);
        for (const u of Array.isArray(r) ? r : r ? [r] : []) await handleZaloUpdate(u).catch((e) => console.error('Zalo:', e.message));
        await new Promise((s) => setTimeout(s, 1000));
      } catch (e) {
        if (!/timeout|aborted/i.test(e.message)) { console.error('Zalo getUpdates:', e.message); await new Promise((s) => setTimeout(s, 10000)); }
      }
    }
  })();
}

// ---------------------------------------------------------------------
//  Soạn nội dung nhắc
// ---------------------------------------------------------------------
/**
 * Tính danh sách nhắc của NGÀY `today` cho từng người.
 * @param onlyNew  true = chỉ lấy mốc đơn hàng chưa nhắc (khi gửi thật); false = xem trước
 * @returns { byUser: Map<userId, {user, followUps[], orders[]}>, orderKeys: string[] }
 */
export async function buildDigests(today, settings, onlyNew = true) {
  const users = await q(`select id, email, full_name, role, notify_email, notify_zalo, notify_all, zalo_chat_id
                           from users where is_active`);
  const names = new Map(users.map((u) => [u.id, u.full_name || u.email]));
  const admins = users.filter((u) => u.role === 'admin' && u.notify_all);
  const byUser = new Map(users.map((u) => [u.id, { user: u, followUps: [], orders: [] }]));
  const push = (uid, kind, item) => byUser.get(uid)?.[kind].push(item);
  const fanout = (ownerIds, kind, item) => {
    const to = new Set(ownerIds.filter(Boolean));
    for (const a of admins) to.add(a.id);
    for (const uid of to) push(uid, kind, item);
  };

  const fus = await q(
    `select f.id, f.content, f.due_date::text as due_date, f.priority, f.assignee_id,
            c.school_name, c.code as customer_code, c.owner_id
       from follow_ups f join customers c on c.id = f.customer_id
      where not f.done and f.due_date <= $1::date
      order by f.due_date, c.school_name`, [today]);
  for (const f of fus) {
    fanout([f.assignee_id || f.owner_id, f.owner_id], 'followUps', { ...f, late: daysBetween(f.due_date, today), owner: names.get(f.owner_id) || 'Chưa gán' });
  }

  const orders = await q(
    `select o.id, o.code, o.order_date::text as order_date, o.amount, o.paid_amount, o.invoice_issued, o.docs_received, o.note,
            c.school_name, c.code as customer_code, c.owner_id
       from orders o join customers c on c.id = o.customer_id
      where o.stage = 'won' and o.order_date <= $1::date
        and (o.paid_amount < o.amount or not o.invoice_issued or not o.docs_received)`, [today]);
  const keys = orders.map((o) => {
    const days = daysBetween(o.order_date, today);
    const m = reachedMilestone(days, settings);
    return m ? `ord:${o.id}:${m}` : null;
  });
  const sent = onlyNew && keys.some(Boolean)
    ? new Set((await q('select key from notify_sent where key = any($1::text[])', [keys.filter(Boolean)])).map((r) => r.key))
    : new Set();
  const orderKeys = [];
  orders.forEach((o, i) => {
    const k = keys[i];
    if (!k || sent.has(k)) return;
    orderKeys.push(k);
    const issues = [];
    const debt = Number(o.amount) - Number(o.paid_amount);
    if (debt > 0) issues.push(`còn nợ ${money(debt)}`);
    if (!o.invoice_issued) issues.push('chưa xuất hoá đơn');
    if (!o.docs_received) issues.push('chưa nhận đủ giấy tờ');
    fanout([o.owner_id], 'orders', { ...o, days: daysBetween(o.order_date, today), debt, issues, owner: names.get(o.owner_id) || 'Chưa gán' });
  });
  return { byUser, orderKeys };
}

const PRIO = { urgent: 'Khẩn', high: 'Cao', medium: '', low: '' };
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const MAX_ITEMS = 40;

export function formatDigest(d, today) {
  const { user, followUps, orders } = d;
  const showOwner = user.role === 'admin';
  const subject = `[KC CRM] Nhắc việc ${dmy(today).slice(0, 5)}: ` +
    [followUps.length && `${followUps.length} follow-up`, orders.length && `${orders.length} đơn cần thu nợ / hoá đơn / giấy tờ`].filter(Boolean).join(', ');

  const fuLine = (f) => `${f.late > 0 ? `[Trễ ${f.late} ngày]` : '[Hôm nay]'}${PRIO[f.priority] ? ` (${PRIO[f.priority]})` : ''} ${f.school_name} — ${f.content}${showOwner ? ` · NV: ${f.owner}` : ''}`;
  const orLine = (o) => `${o.code} · ${o.school_name} — chốt ${o.days} ngày trước (${dmy(o.order_date)}), giá trị ${money(o.amount)}: ${o.issues.join(', ')}${showOwner ? ` · NV: ${o.owner}` : ''}${o.note ? `\n   Ghi chú: ${o.note.slice(0, 200)}` : ''}`;
  const cap = (arr) => arr.slice(0, MAX_ITEMS);
  const more = (arr) => (arr.length > MAX_ITEMS ? [`… và ${arr.length - MAX_ITEMS} mục khác — xem trên KC CRM`] : []);

  const lines = [`Chào ${user.full_name || ''}, đây là việc cần làm hôm nay ${dmy(today)}:`];
  if (followUps.length) lines.push('', `📅 FOLLOW-UP ĐẾN HẠN (${followUps.length})`, ...cap(followUps).map((f) => '• ' + fuLine(f)), ...more(followUps));
  if (orders.length) {
    const debt = orders.reduce((s, o) => s + Math.max(0, o.debt), 0);
    lines.push('', `💰 ĐƠN CẦN THU NỢ / XUẤT HOÁ ĐƠN / GIẤY TỜ (${orders.length})${debt ? ` — tổng nợ ${money(debt)}` : ''}`,
      ...cap(orders).map((o) => '• ' + orLine(o)), ...more(orders));
  }
  if (APP_URL) lines.push('', `Mở KC CRM: ${APP_URL}/#/${orders.length ? 'orders' : 'followups'}`);
  const text = lines.join('\n');

  const li = (arr, f) => cap(arr).map((x) => `<li style="margin:4px 0">${f(x)}</li>`).join('') + more(arr).map((m) => `<li><i>${esc(m)}</i></li>`).join('');
  const red = (s) => `<b style="color:#c0392b">${s}</b>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;max-width:680px">
  <div style="background:#00ABD6;color:#fff;padding:12px 16px;border-radius:8px 8px 0 0;font-weight:bold">KC CRM — Nhắc việc ${dmy(today)}</div>
  <div style="border:1px solid #e5e7eb;border-top:0;padding:14px 16px;border-radius:0 0 8px 8px">
  <p>Chào ${esc(user.full_name || '')}, đây là việc cần làm hôm nay:</p>
  ${followUps.length ? `<h3 style="color:#00ABD6;margin:14px 0 6px">📅 Follow-up đến hạn (${followUps.length})</h3><ul style="padding-left:18px;margin:0">${li(followUps, (f) =>
    `${f.late > 0 ? red(`Trễ ${f.late} ngày`) : '<b>Hôm nay</b>'}${PRIO[f.priority] ? ` (${PRIO[f.priority]})` : ''} — <b>${esc(f.school_name)}</b>: ${esc(f.content)}${showOwner ? ` <span style="color:#6b7280">· NV: ${esc(f.owner)}</span>` : ''}`)}</ul>` : ''}
  ${orders.length ? `<h3 style="color:#E05600;margin:14px 0 6px">💰 Đơn cần thu nợ / xuất hoá đơn / giấy tờ (${orders.length})</h3><ul style="padding-left:18px;margin:0">${li(orders, (o) =>
    `<b>${esc(o.code)} · ${esc(o.school_name)}</b> — chốt ${o.days} ngày trước (${dmy(o.order_date)}), giá trị ${money(o.amount)}: ${o.issues.map((x) => (x.startsWith('còn nợ') ? red(x) : esc(x))).join(', ')}${showOwner ? ` <span style="color:#6b7280">· NV: ${esc(o.owner)}</span>` : ''}${o.note ? `<br><span style="color:#6b7280">Ghi chú: ${esc(o.note.slice(0, 200))}</span>` : ''}`)}</ul>` : ''}
  ${APP_URL ? `<p style="margin-top:16px"><a href="${esc(APP_URL)}/#/${orders.length ? 'orders' : 'followups'}" style="background:#E05600;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Mở KC CRM</a></p>` : ''}
  <p style="color:#9ca3af;font-size:12px;margin-top:16px">Tắt / bật thông báo trong KC CRM → Cài đặt → Thông báo.</p>
  </div></div>`;
  return { subject, text, html };
}

/** Gửi 1 tin tới mọi kênh người đó bật. Trả về kết quả từng kênh. */
export async function deliver(user, msg) {
  const out = {};
  if (user.notify_email && emailReady()) {
    try { await sendEmail(user.email, msg.subject, msg.text, msg.html); out.email = 'ok'; } catch (e) { out.email = e.message; }
  }
  if (user.notify_zalo && user.zalo_chat_id && zaloReady()) {
    try { await sendZalo(user.zalo_chat_id, msg.text); out.zalo = 'ok'; } catch (e) { out.zalo = e.message; }
  }
  return out;
}

/** Chạy nhắc của 1 ngày. force = chạy lại kể cả hôm nay đã chạy (mốc đơn đã nhắc vẫn không nhắc lại). */
export async function runDaily({ force = false } = {}) {
  if (!emailReady() && !zaloReady()) return { skipped: 'Chưa cấu hình email hoặc Zalo' };
  const today = vnToday();
  if (!force) {
    const claimed = await q(`insert into notify_sent (key) values ($1) on conflict (key) do nothing returning key`, ['run:' + today]);
    if (!claimed.length) return { skipped: 'Hôm nay đã gửi' };
  }
  const settings = await getSettings();
  const { byUser, orderKeys } = await buildDigests(today, settings, true);
  const results = [];
  for (const d of byUser.values()) {
    if (!d.followUps.length && !d.orders.length) continue;
    const r = await deliver(d.user, formatDigest(d, today));
    results.push({ user: d.user.email, followUps: d.followUps.length, orders: d.orders.length, ...r });
    for (const [ch, v] of Object.entries(r)) if (v !== 'ok') console.error(`⚠️  Nhắc việc ${ch} → ${d.user.email}: ${v}`);
  }
  if (orderKeys.length) await q(`insert into notify_sent (key) select unnest($1::text[]) on conflict (key) do nothing returning key`, [orderKeys]);
  if (results.length) console.log(`🔔 Đã gửi nhắc việc ${today} cho ${results.length} người`);
  return { date: today, sent: results };
}

/** Khởi động: kết nối Zalo + kiểm tra mỗi 5 phút đã tới giờ gửi chưa */
export function startNotify(sessionSecret) {
  if (emailReady()) console.log(`📧 Email nhắc việc qua ${SMTP.host}:${SMTP.port}`);
  startZalo(sessionSecret);
  const tick = async () => {
    try {
      const s = await getSettings();
      if (vnHour() >= s.hour) await runDaily();
    } catch (e) { console.error('Nhắc việc lỗi:', e.message); }
  };
  setTimeout(tick, 15000).unref();
  setInterval(tick, 5 * 60e3).unref();
}
