import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { useNav } from '../lib/nav';
import { Avatar, PageHeader, Select, toast } from '../components/ui';
import { STAGES, stageMeta } from '../lib/constants';
import { setOrderStage } from '../lib/deals';
import { isWon, moneyShort, orderDebt, orderDone } from '../lib/format';
import type { Customer, Order, Stage } from '../lib/types';

/** Pipeline theo ĐƠN HÀNG: mỗi thẻ là 1 đơn (cơ hội). Kéo sang "Chốt đơn" = đơn hoàn thành bán hàng. */
export function PipelinePage() {
  const { customers, isAdmin, profiles, nameOf, api, reload, patchLocal, me } = useStore();
  const { openCustomer } = useNav();
  const [owner, setOwner] = useState('');
  const [hideClosed, setHideClosed] = useState(false);
  const [over, setOver] = useState<Stage | null>(null);

  const allDeals = useMemo(() => customers
    .filter((c) => !owner || c.owner_id === owner)
    .flatMap((c) => c.orders.map((o) => ({ o, c })))
    .sort((a, b) => b.o.created_at.localeCompare(a.o.created_at)), [customers, owner]);
  // Đơn đã HOÀN TẤT (thu đủ + hoá đơn + giấy tờ) không còn việc gì phải làm → ẩn khỏi Pipeline
  const doneCount = allDeals.filter((d) => orderDone(d.o)).length;
  const deals = useMemo(() => allDeals.filter((d) => !orderDone(d.o)), [allDeals]);
  const cols = STAGES.filter((s) => !hideClosed || !['won', 'lost', 'paused'].includes(s.key));

  const move = async (orderId: string, stage: Stage) => {
    const d = deals.find((x) => x.o.id === orderId);
    if (!d || d.o.stage === stage) return;
    const { o, c } = d;
    if (stage === 'won' && !o.amount && !confirm(`Đơn ${o.code} chưa có giá trị (0 ₫). Vẫn chốt đơn? Bạn có thể sửa giá trị sau trong chi tiết khách hàng.`)) return;
    // cập nhật ngay trên giao diện
    patchLocal(c.id, (x) => ({ ...x, orders: x.orders.map((y) => (y.id === o.id ? { ...y, stage } : y)) }));
    try {
      await setOrderStage(api, me!.id, c, o, stage);
      toast.ok(stage === 'won' ? `🎉 Chốt đơn ${o.code} — đã cộng vào doanh thu của ${c.school_name}` : `${o.code} → ${stageMeta(stage).label}`);
    } catch (e) { toast.err(e); }
    reload();
  };

  return (
    <>
      <PageHeader title="Pipeline" subtitle='Chỉ hiện đơn chưa hoàn tất. Kéo sang "Chốt đơn" thì đơn tự tính vào doanh thu; khi thu đủ tiền + xuất hoá đơn + đủ giấy tờ, đơn tự rời khỏi Pipeline.'
        actions={<>
          <label className="row gap8 small"><input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} /> Ẩn Chốt / Thất bại / Tạm dừng</label>
          {isAdmin && <Select style={{ width: 200 }} value={owner} onChange={(e) => setOwner(e.target.value)}
            options={[{ value: '', label: 'Tất cả nhân viên' }, ...profiles.map((p) => ({ value: p.id, label: p.full_name || p.email }))]} />}
        </>} />
      <div className="kanban">
        {cols.map((s) => {
          const items = deals.filter((d) => d.o.stage === s.key);
          const sum = items.reduce((t, d) => t + Number(d.o.amount || 0), 0);
          return (
            <div key={s.key} className={'kcol' + (over === s.key ? ' drop' : '')}
              onDragOver={(e) => { e.preventDefault(); setOver(s.key); }}
              onDragLeave={() => setOver((o) => (o === s.key ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData('text/plain'), s.key); }}>
              <div className="kcol-head"><span className={`badge tone-${s.tone}`}><span className="dot" />{s.label}</span><span className="muted">{items.length}</span></div>
              {sum > 0 && <div className="kcol-sum">{s.key === 'won' ? 'Đã chốt, chưa hoàn tất' : 'Dự kiến'}: {moneyShort(sum)}</div>}
              {items.map(({ o, c }) => <DealCard key={o.id} o={o} c={c} owner={isAdmin ? nameOf(c.owner_id) : ''} onOpen={() => openCustomer(c.id, 'orders')} />)}
              {s.key === 'won' && doneCount > 0 && (
                <a href="#/orders" className="small" style={{ padding: '6px 4px', display: 'block' }}>✓ {doneCount} đơn đã hoàn tất — xem ở Đơn hàng & công nợ →</a>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function DealCard({ o, c, owner, onOpen }: { o: Order; c: Customer; owner: string; onOpen: () => void }) {
  const debt = orderDebt(o);
  return (
    <div className="kcard" draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', o.id)} onClick={onOpen}>
      <b>{c.school_name}</b>
      <div className="small muted">{o.code}{o.products.length ? ' · ' + o.products.join(', ') : ''}</div>
      <div className="row gap8" style={{ marginTop: 8 }}>
        <span className="small num" style={{ fontWeight: 600 }}>{o.amount > 0 ? moneyShort(o.amount) : 'Chưa có giá trị'}</span>
        {owner && <span className="right row gap4 small muted"><Avatar name={owner} size={18} />{owner.split(' ').slice(-1)[0]}</span>}
      </div>
      {isWon(o) && (
        <div style={{ marginTop: 6 }}>
          {orderDone(o) ? <span className="badge tone-green">Hoàn tất</span>
            : debt > 0 ? <span className="badge tone-red">Còn nợ {moneyShort(debt)}</span>
              : <span className="badge tone-orange">{!o.invoice_issued ? 'Chưa xuất HĐ' : 'Thiếu giấy tờ'}</span>}
        </div>
      )}
    </div>
  );
}
