import type { Api } from './api';
import type { Customer, Lifecycle, NewChild, Order, Stage } from './types';
import { stageMeta } from './constants';
import { money, todayStr, wonOrders } from './format';

export const typeLabel = (c: Customer) => (c.customer_type === 'individual' ? 'Khách lẻ' : c.school_type);

export const newOrder = (customerId: string, userId: string, patch: Partial<NewChild<'orders'>> = {}): NewChild<'orders'> => ({
  customer_id: customerId, code: '', order_date: todayStr(), amount: 0, products: [], stage: 'lead',
  paid_amount: 0, invoice_issued: false, docs_received: false, note: '', delivered_date: null, delivery1_date: null, created_by: userId, ...patch,
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

const dmy = (date: string) => { const [y, m, d] = date.split('-'); return `${d}/${m}/${y}`; };
const debtOf = (o: Order) => Math.max(0, Number(o.amount || 0) - Number(o.paid_amount || 0));

/**
 * Giao hàng — mỗi đơn giao tối đa 2 lần:
 *  - 'full'   : giao hết trong 1 lần            → ngày giao xong = hôm nay
 *  - 'first'  : giao lần 1 (còn thiếu hàng)     → chờ giao lần 2, CHƯA tính công nợ
 *  - 'second' : giao lần 2 (đủ hàng)            → ngày giao xong = hôm nay
 * Công nợ tính từ ngày GIAO XONG: sau 10 / 20 / 25 / 30 ngày chưa thu đủ tiền thì nhắc nhân viên phụ trách.
 */
export type DeliveryStep = 'full' | 'first' | 'second';
export async function markDelivery(api: Api, userId: string, c: Customer, o: Order, step: DeliveryStep, date = todayStr()) {
  const patch = step === 'full' ? { delivered_date: date, delivery1_date: null } : step === 'first' ? { delivery1_date: date } : { delivered_date: date };
  await api.updateChild('orders', o.id, patch);
  const debt = debtOf(o);
  const tail = step !== 'first' && debt > 0 ? ` — công nợ ${money(debt)} tính từ ngày này` : '';
  await api.addChild('activities', {
    customer_id: c.id, type: 'delivery', created_by: userId,
    content: step === 'full' ? `Giao hết hàng đơn ${o.code} (1 lần) ngày ${dmy(date)}${tail}`
      : step === 'first' ? `Giao lần 1 đơn ${o.code} ngày ${dmy(date)} — còn chờ giao lần 2`
        : `Giao lần 2 (giao đủ) đơn ${o.code} ngày ${dmy(date)}${tail}`,
  });
}

/** Huỷ bước giao gần nhất (bấm nhầm): giao xong → về trước đó; giao lần 1 → chưa giao */
export async function undoDelivery(api: Api, userId: string, c: Customer, o: Order) {
  const patch = o.delivered_date ? { delivered_date: null } : { delivery1_date: null };
  await api.updateChild('orders', o.id, patch);
  await api.addChild('activities', {
    customer_id: c.id, type: 'other', created_by: userId,
    content: o.delivered_date ? `Huỷ ghi nhận ${o.delivery1_date ? 'giao lần 2' : 'giao hàng'} đơn ${o.code}` : `Huỷ ghi nhận giao lần 1 đơn ${o.code}`,
  });
}

/** Sửa ngày giao (lần 1 / giao xong) khi nhập muộn */
export async function editDeliveryDates(api: Api, userId: string, c: Customer, o: Order, delivery1: string | null, delivered: string | null) {
  if (delivery1 === o.delivery1_date && delivered === o.delivered_date) return;
  await api.updateChild('orders', o.id, { delivery1_date: delivery1, delivered_date: delivered });
  const desc = [delivery1 ? `lần 1: ${dmy(delivery1)}` : '', delivered ? `${delivery1 ? 'lần 2' : 'giao hết'}: ${dmy(delivered)}` : 'chưa giao xong'].filter(Boolean).join(', ');
  await api.addChild('activities', { customer_id: c.id, type: 'other', created_by: userId, content: `Sửa ngày giao hàng đơn ${o.code} — ${desc}` });
}
