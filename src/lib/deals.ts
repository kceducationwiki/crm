import type { Api } from './api';
import type { Customer, Lifecycle, NewChild, Order, Stage } from './types';
import { stageMeta } from './constants';
import { money, todayStr, wonOrders } from './format';

export const typeLabel = (c: Customer) => (c.customer_type === 'individual' ? 'Khách lẻ' : c.school_type);

export const newOrder = (customerId: string, userId: string, patch: Partial<NewChild<'orders'>> = {}): NewChild<'orders'> => ({
  customer_id: customerId, code: '', order_date: todayStr(), amount: 0, products: [], stage: 'lead',
  paid_amount: 0, invoice_issued: false, docs_received: false, note: '', delivered_date: null, created_by: userId, ...patch,
});

/** Vòng đời khách hàng sau khi có thêm 1 đơn chốt */
function lifecycleAfterWin(c: Customer): Lifecycle | null {
  const n = wonOrders(c).length + 1;
  if (c.lifecycle === 'vip') return null;
  if (n === 1) return c.lifecycle === 'first' ? null : 'first';
  return c.lifecycle === 'returning' ? null : 'returning';
}

/**
 * Chuyển giai đoạn 1 đơn hàng. Khi chuyển sang "Chốt đơn":
 *  - ngày đơn = hôm nay (ngày chốt), đơn được tính vào doanh thu / số đơn của khách
 *  - tự cập nhật vòng đời khách (Mua lần đầu / Khách quay lại)
 *  - ghi vào timeline
 */
export async function setOrderStage(api: Api, userId: string, c: Customer, o: Order, stage: Stage) {
  if (o.stage === stage) return;
  const winning = stage === 'won';
  await api.updateChild('orders', o.id, winning ? { stage, order_date: todayStr() } : { stage });
  if (winning) {
    const life = lifecycleAfterWin(c);
    if (life) await api.updateCustomer(c.id, { lifecycle: life });
  }
  await api.addChild('activities', {
    customer_id: c.id, type: winning ? 'contract' : 'stage', created_by: userId,
    content: winning
      ? `Chốt đơn ${o.code} — ${money(o.amount)}${o.products.length ? ` (${o.products.join(', ')})` : ''}`
      : `Đơn ${o.code}: ${stageMeta(o.stage).label} → ${stageMeta(stage).label}`,
  });
}

/**
 * Thêm 1 đơn cho khách. Nếu đơn đã chốt ngay: tạo ở "Chờ quyết định" rồi chuyển sang "Chốt đơn"
 * để chạy đủ logic chốt (ngày chốt, vòng đời khách, timeline).
 */
export async function createOrder(api: Api, userId: string, c: Customer,
  o: { amount: number; products: string[]; note: string; stage: Stage }) {
  const created = await api.addChild('orders', newOrder(c.id, userId, {
    amount: o.amount, products: o.products, note: o.note.trim(), stage: o.stage === 'won' ? 'pending' : o.stage,
  }));
  if (o.stage === 'won') await setOrderStage(api, userId, c, created, 'won');
  return created;
}

/**
 * Ghi nhận GIAO HÀNG THÀNH CÔNG (mặc định hôm nay). Công nợ của đơn tính từ ngày này:
 * sau 10 / 20 / 25 / 30 ngày chưa thu đủ tiền, hệ thống nhắc nhân viên phụ trách.
 * date = null → huỷ ghi nhận (đánh dấu nhầm).
 */
export async function setDelivered(api: Api, userId: string, c: Customer, o: Order, date: string | null) {
  await api.updateChild('orders', o.id, { delivered_date: date });
  const debt = Math.max(0, Number(o.amount || 0) - Number(o.paid_amount || 0));
  const [y, m, d] = (date ?? '').split('-');
  await api.addChild('activities', {
    customer_id: c.id, type: date ? 'delivery' : 'other', created_by: userId,
    content: !date ? `Huỷ ghi nhận giao hàng đơn ${o.code}`
      : o.delivered_date ? `Sửa ngày giao hàng đơn ${o.code} thành ${d}/${m}/${y}`
        : `Giao hàng thành công đơn ${o.code} ngày ${d}/${m}/${y}${debt > 0 ? ` — công nợ ${money(debt)} tính từ hôm nay` : ''}`,
  });
}
