import type { Customer, FollowUp, Order, Stage } from './types';
import { OPEN_STAGES } from './constants';

export const money = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + ' ₫';

/** 1.250.000.000 → "1,25 tỷ"; 45.000.000 → "45 tr" */
export const moneyShort = (n: number) => {
  const v = n || 0;
  if (Math.abs(v) >= 1e9) return (v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tr';
  return new Intl.NumberFormat('vi-VN').format(v) + ' ₫';
};

export const todayStr = () => toDateStr(new Date());
export const toDateStr = (d: Date) => {
  const z = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export const fmtDate = (s?: string | null) => {
  if (!s) return '—';
  const d = s.length === 10 ? new Date(s + 'T00:00:00') : new Date(s);
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
export const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const relDay = (s: string) => {
  const diff = Math.round((new Date(s + 'T00:00:00').getTime() - new Date(todayStr() + 'T00:00:00').getTime()) / 864e5);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Ngày mai';
  if (diff === -1) return 'Hôm qua';
  return diff < 0 ? `Trễ ${-diff} ngày` : `${diff} ngày nữa`;
};

// ----- Đơn hàng / công nợ -----
export const isWon = (o: Order) => o.stage === 'won';
export const isOpen = (o: Order) => OPEN_STAGES.includes(o.stage);
export const wonOrders = (c: Customer) => c.orders.filter(isWon);
export const openDeals = (c: Customer) => c.orders.filter(isOpen);
/** Doanh thu = tổng giá trị các đơn ĐÃ CHỐT */
export const revenue = (c: Customer) => wonOrders(c).reduce((s, o) => s + Number(o.amount || 0), 0);
/** Công nợ của 1 đơn đã chốt */
export const orderDebt = (o: Order) => (isWon(o) ? Math.max(0, Number(o.amount || 0) - Number(o.paid_amount || 0)) : 0);
export const customerDebt = (c: Customer) => c.orders.reduce((s, o) => s + orderDebt(o), 0);
/** Đơn hoàn tất = đã chốt + thu đủ tiền + đã xuất hoá đơn + đủ giấy tờ */
export const orderDone = (o: Order) => isWon(o) && orderDebt(o) === 0 && o.invoice_issued && o.docs_received;
/** Những việc còn thiếu của 1 đơn đã chốt */
export const orderMissing = (o: Order): string[] => {
  if (!isWon(o)) return [];
  const m: string[] = [];
  if (orderDebt(o) > 0) m.push('Còn nợ ' + moneyShort(orderDebt(o)));
  if (!o.invoice_issued) m.push('Chưa xuất hoá đơn');
  if (!o.docs_received) m.push('Thiếu giấy tờ');
  return m;
};
/** Giai đoạn đại diện của khách: cơ hội đang mở mới nhất → nếu không có thì 'won' → nếu không thì đơn gần nhất */
export const customerStage = (c: Customer): Stage | null => {
  const open = openDeals(c).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (open) return open.stage;
  if (c.orders.some(isWon)) return 'won';
  return c.orders[0]?.stage ?? null;
};
export const primaryContact = (c: Customer) => c.contacts.find((x) => x.is_primary) ?? c.contacts[0];
export const nextFollowUp = (c: Customer): FollowUp | undefined =>
  c.follow_ups.filter((f) => !f.done).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

export const uid = () =>
  (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
  Math.random().toString(36).slice(2) + Date.now().toString(36);

export const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  // Ô chữ bắt đầu bằng = + - @ có thể bị Excel chạy như công thức → thêm dấu ' phía trước cho an toàn
  const safe = (v: string | number) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v);
  const esc = (v: string | number) => `"${String(safe(v) ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
