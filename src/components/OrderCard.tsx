import { useState } from 'react';
import { useStore } from '../lib/store';
import { Badge, Button, Chips, Field, Input, Select, Textarea, toast } from './ui';
import { PRODUCTS, STAGES } from '../lib/constants';
import { setOrderStage } from '../lib/deals';
import { fmtDate, isWon, money, orderDebt, orderDone, orderMissing } from '../lib/format';
import type { Customer, Order, Stage } from '../lib/types';

/** Thẻ 1 đơn hàng: giai đoạn, thanh toán / công nợ, hoá đơn, giấy tờ */
export function OrderCard({ c, o, showCustomer, onOpenCustomer, ownerName }: { c: Customer; o: Order; showCustomer?: boolean; onOpenCustomer?: () => void; ownerName?: string }) {
  const { api, me, reload } = useStore();
  const [pay, setPay] = useState('');
  const [noteEdit, setNoteEdit] = useState<string | null>(null);
  const [edit, setEdit] = useState<null | { code: string; amount: string; products: string[]; note: string; order_date: string }>(null);
  const docs = (c.documents ?? []).filter((d) => d.order_id === o.id);
  const won = isWon(o);
  const debt = orderDebt(o);
  const paidPct = o.amount > 0 ? Math.min(100, (o.paid_amount / o.amount) * 100) : won ? 100 : 0;

  const run = async (fn: () => Promise<unknown>, msg?: string) => {
    try { await fn(); if (msg) toast.ok(msg); await reload(); } catch (e) { toast.err(e); }
  };
  const log = (content: string) => api.addChild('activities', { customer_id: c.id, type: 'other', content, created_by: me!.id });

  const addPayment = (amount: number) => {
    if (!amount || amount <= 0) return toast.err('Nhập số tiền thu hợp lệ');
    if (amount > debt) return toast.err(`Số tiền vượt quá công nợ còn lại (${money(debt)})`);
    run(async () => {
      await api.updateChild('orders', o.id, { paid_amount: o.paid_amount + amount });
      await log(`Thu ${money(amount)} đơn ${o.code}${amount === debt ? ' — đã thu đủ' : ` — còn nợ ${money(debt - amount)}`}`);
      setPay('');
    }, 'Đã ghi nhận thanh toán');
  };
  const toggle = (field: 'invoice_issued' | 'docs_received', label: string) => run(async () => {
    await api.updateChild('orders', o.id, { [field]: !o[field] });
    await log(`Đơn ${o.code}: ${!o[field] ? '' : 'bỏ đánh dấu '}${label}`);
  });
  const saveNote = () => {
    if (noteEdit === null) return;
    const text = noteEdit.trim();
    if (text === o.note) return setNoteEdit(null);
    run(async () => {
      await api.updateChild('orders', o.id, { note: text });
      await log(text ? `Ghi chú đơn ${o.code}: ${text}` : `Xoá ghi chú đơn ${o.code}`);
      setNoteEdit(null);
    }, 'Đã lưu ghi chú');
  };
  const saveEdit = () => {
    if (!edit) return;
    const amount = Number(edit.amount) || 0;
    if (amount < o.paid_amount) return toast.err('Giá trị đơn không thể nhỏ hơn số đã thanh toán');
    run(async () => {
      await api.updateChild('orders', o.id, { code: edit.code.trim() || o.code, amount, products: edit.products, order_date: edit.order_date });
      setEdit(null);
    }, 'Đã lưu đơn hàng');
  };

  return (
    <div className={'order' + (won ? ' order-won' : '')}>
      <div className="order-head">
        <b className="mono">{o.code}</b>
        {showCustomer && (onOpenCustomer
          ? <a href="#" className="truncate" style={{ maxWidth: 280, fontWeight: 600 }} title="Mở khách hàng" onClick={(e) => { e.preventDefault(); onOpenCustomer(); }}>{c.school_name}</a>
          : <b className="truncate" style={{ maxWidth: 280 }}>{c.school_name}</b>)}
        <span className="num" style={{ fontWeight: 600 }}>{money(o.amount)}</span>
        {won && (orderDone(o) ? <Badge tone="green" dot>Hoàn tất</Badge> : orderMissing(o).map((m) => <Badge key={m} tone={m.startsWith('Còn nợ') ? 'red' : 'orange'}>{m}</Badge>))}
        <div className="right row gap4">
          <Select style={{ width: 160, height: 30 }} value={o.stage} aria-label="Giai đoạn đơn hàng"
            onChange={(e) => run(() => setOrderStage(api, me!.id, c, o, e.target.value as Stage), e.target.value === 'won' ? 'Đã chốt đơn 🎉' : 'Đã chuyển giai đoạn')}
            options={STAGES.map((s) => ({ value: s.key, label: s.label }))} />
          <Button variant="ghost" size="sm" icon="edit" aria-label="Sửa đơn" title="Sửa đơn"
            onClick={() => setEdit(edit ? null : { code: o.code, amount: String(o.amount || ''), products: o.products, note: o.note, order_date: o.order_date })} />
          <Button variant="ghost" size="sm" icon="trash" aria-label="Xoá đơn" title="Xoá đơn"
            onClick={() => confirm(`Xoá đơn ${o.code}?`) && run(() => api.deleteChild('orders', o.id), 'Đã xoá đơn')} />
        </div>
      </div>
      <div className="small muted" style={{ marginTop: 4 }}>
        {won ? 'Chốt ngày' : 'Tạo ngày'} {fmtDate(o.order_date)}{o.products.length ? ' · ' + o.products.join(', ') : ''}{ownerName ? ' · Phụ trách: ' + ownerName : ''}
      </div>

      {docs.length > 0 && (
        <div className="row gap8 wrap small" style={{ marginTop: 6 }}>
          <span className="muted">Hồ sơ:</span>
          {docs.map((d) => (
            <a key={d.id} href="#" title={'Tải về ' + d.name} onClick={(e) => { e.preventDefault(); api.downloadDocument(d); }}>
              📎 {d.contract_no ? `HĐ ${d.contract_no}` : d.name}
            </a>
          ))}
        </div>
      )}
      {/* Ghi chú đơn hàng: tình trạng, vướng mắc, lý do chưa thu được công nợ… */}
      {noteEdit === null ? (
        <div className={'order-note' + (o.note ? '' : ' empty')} role="button" tabIndex={0} title="Bấm để sửa ghi chú"
          onClick={() => setNoteEdit(o.note)} onKeyDown={(e) => e.key === 'Enter' && setNoteEdit(o.note)}>
          <span className="order-note-label">Ghi chú</span>
          <span style={{ whiteSpace: 'pre-wrap' }}>{o.note || (won && debt > 0 ? 'Thêm ghi chú — vì sao chưa thu được công nợ, đang vướng ở đâu…' : 'Thêm ghi chú cho đơn này…')}</span>
        </div>
      ) : (
        <div className="order-note editing">
          <Textarea autoFocus rows={2} value={noteEdit} onChange={(e) => setNoteEdit(e.target.value)}
            placeholder="VD: Trường chờ ngân sách quý 4, hẹn thanh toán 15/11. Kế toán chị Lan đang giữ hồ sơ." />
          <div className="row gap8" style={{ marginTop: 6 }}><Button size="sm" onClick={saveNote}>Lưu ghi chú</Button><Button size="sm" variant="ghost" onClick={() => setNoteEdit(null)}>Huỷ</Button></div>
        </div>
      )}

      {edit && (
        <div className="form-grid" style={{ marginTop: 12 }}>
          <Field label="Mã đơn"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
          <Field label={won ? 'Ngày chốt' : 'Ngày tạo'}><Input type="date" value={edit.order_date} onChange={(e) => setEdit({ ...edit, order_date: e.target.value })} /></Field>
          <Field label="Giá trị đơn (₫)"><Input type="number" min={0} step={1000000} value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></Field>
          <Field label="Sản phẩm" span2><Chips options={PRODUCTS} value={edit.products} onChange={(v) => setEdit({ ...edit, products: v })} /></Field>
          <div className="row gap8"><Button size="sm" onClick={saveEdit}>Lưu</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>Huỷ</Button></div>
        </div>
      )}

      {won && (
        <>
          <div className={'pay-bar' + (debt > 0 ? ' debt' : '')}><div style={{ width: paidPct + '%' }} /></div>
          <div className="row gap8 wrap small">
            <span>Đã thu <b className="num">{money(o.paid_amount)}</b></span>
            {debt > 0 ? <span style={{ color: 'var(--danger)' }}>· Còn nợ <b className="num">{money(debt)}</b></span> : <span style={{ color: '#16a34a' }}>· Đã thu đủ</span>}
            {o.paid_amount > 0 && (
              <button className="chip" style={{ fontSize: 11 }} title="Sửa lại số đã thu nếu nhập nhầm"
                onClick={() => { const v = prompt('Sửa tổng số tiền đã thu (₫):', String(o.paid_amount)); if (v === null) return; const n = Number(v); if (!(n >= 0) || n > o.amount) return toast.err('Số tiền không hợp lệ'); run(async () => { await api.updateChild('orders', o.id, { paid_amount: n }); await log(`Sửa số đã thu đơn ${o.code} thành ${money(n)}`); }, 'Đã sửa'); }}>Sửa</button>
            )}
          </div>
          {debt > 0 && (
            <div className="row gap8 wrap" style={{ marginTop: 8 }}>
              <Input style={{ width: 170, height: 30 }} type="number" min={0} step={1000000} placeholder="Số tiền thu thêm" value={pay}
                onChange={(e) => setPay(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPayment(Number(pay))} />
              <Button size="sm" variant="outline" icon="money" onClick={() => addPayment(Number(pay))}>Ghi nhận thu</Button>
              <Button size="sm" variant="outline" icon="check" onClick={() => addPayment(debt)}>Thu đủ {money(debt)}</Button>
            </div>
          )}
          <div className="row gap8 wrap" style={{ marginTop: 10 }}>
            <label className={'check-pill' + (o.invoice_issued ? ' on' : '')}>
              <input type="checkbox" checked={o.invoice_issued} onChange={() => toggle('invoice_issued', 'đã xuất hoá đơn')} /> Đã xuất hoá đơn
            </label>
            <label className={'check-pill' + (o.docs_received ? ' on' : '')}>
              <input type="checkbox" checked={o.docs_received} onChange={() => toggle('docs_received', 'đã nhận đủ giấy tờ')} /> Đã nhận đủ giấy tờ
            </label>
          </div>
        </>
      )}
    </div>
  );
}
