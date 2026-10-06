import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { useNav } from '../lib/nav';
import { Icon } from '../components/Icon';
import { OrderCard } from '../components/OrderCard';
import { Button, Empty, PageHeader, Select } from '../components/ui';
import { stageMeta } from '../lib/constants';
import { downloadCsv, fmtDate, isOpen, isWon, moneyShort, norm, orderDebt, orderDone, todayStr } from '../lib/format';

type View = 'debt' | 'won' | 'invoice' | 'docs' | 'done' | 'open' | 'all';
const VIEWS: [View, string][] = [
  ['debt', 'Còn công nợ'], ['invoice', 'Chưa xuất hoá đơn'], ['docs', 'Thiếu giấy tờ'],
  ['won', 'Tất cả đơn đã chốt'], ['done', 'Hoàn tất'], ['open', 'Đang theo đuổi'], ['all', 'Tất cả'],
];

/** Theo dõi đơn hàng đã chốt: đã thu bao nhiêu, còn nợ đơn nào, hoá đơn & giấy tờ */
export function OrdersPage() {
  const { customers, isAdmin, profiles, nameOf } = useStore();
  const { openCustomer } = useNav();
  const [view, setView] = useState<View>('won');
  const [owner, setOwner] = useState('');
  const [q, setQ] = useState('');

  const all = useMemo(() => customers
    .filter((c) => !owner || c.owner_id === owner)
    .flatMap((c) => c.orders.map((o) => ({ o, c })))
    .sort((a, b) => b.o.order_date.localeCompare(a.o.order_date) || b.o.created_at.localeCompare(a.o.created_at)), [customers, owner]);

  const stats = useMemo(() => {
    const won = all.filter((x) => isWon(x.o));
    return {
      revenue: won.reduce((s, x) => s + x.o.amount, 0),
      paid: won.reduce((s, x) => s + Math.min(x.o.paid_amount, x.o.amount), 0),
      debt: won.reduce((s, x) => s + orderDebt(x.o), 0),
      debtCount: won.filter((x) => orderDebt(x.o) > 0).length,
      pending: won.filter((x) => !orderDone(x.o)).length,
      wonCount: won.length,
    };
  }, [all]);

  const list = useMemo(() => {
    const nq = norm(q.trim());
    return all.filter(({ o, c }) => {
      if (nq && !norm(`${o.code} ${c.school_name} ${c.code} ${o.products.join(' ')} ${o.note}`).includes(nq)) return false;
      switch (view) {
        case 'debt': return orderDebt(o) > 0;
        case 'invoice': return isWon(o) && !o.invoice_issued;
        case 'docs': return isWon(o) && !o.docs_received;
        case 'won': return isWon(o);
        case 'done': return orderDone(o);
        case 'open': return isOpen(o);
        default: return true;
      }
    });
  }, [all, view, q]);

  const count = (v: View) => all.filter(({ o }) =>
    v === 'debt' ? orderDebt(o) > 0 : v === 'invoice' ? isWon(o) && !o.invoice_issued : v === 'docs' ? isWon(o) && !o.docs_received
      : v === 'won' ? isWon(o) : v === 'done' ? orderDone(o) : v === 'open' ? isOpen(o) : true).length;

  const exportCsv = () => downloadCsv(`don-hang-${todayStr()}.csv`, [
    ['Mã đơn', 'Khách hàng', 'Mã KH', 'Giai đoạn', 'Ngày', 'Sản phẩm', 'Giá trị', 'Đã thu', 'Công nợ', 'Đã xuất hoá đơn', 'Đủ giấy tờ', 'Hoàn tất', 'Phụ trách', 'Ghi chú'],
    ...list.map(({ o, c }) => [o.code, c.school_name, c.code, stageMeta(o.stage).label, fmtDate(o.order_date), o.products.join(', '), o.amount,
      isWon(o) ? o.paid_amount : '', isWon(o) ? orderDebt(o) : '', isWon(o) ? (o.invoice_issued ? 'Có' : 'Chưa') : '', isWon(o) ? (o.docs_received ? 'Có' : 'Chưa') : '',
      isWon(o) ? (orderDone(o) ? 'Có' : 'Chưa') : '', nameOf(c.owner_id), o.note]),
  ]);

  return (
    <>
      <PageHeader title="Đơn hàng & công nợ" subtitle="Theo dõi thanh toán, công nợ, hoá đơn và giấy tờ của từng đơn đã chốt."
        actions={<>
          {isAdmin && <Select style={{ width: 200 }} value={owner} onChange={(e) => setOwner(e.target.value)}
            options={[{ value: '', label: 'Tất cả nhân viên' }, ...profiles.map((p) => ({ value: p.id, label: p.full_name || p.email }))]} />}
          <Button variant="outline" icon="download" onClick={exportCsv}>Xuất CSV</Button>
        </>} />

      <div className="stats">
        <div className="card stat"><div className="stat-top">Doanh thu đã chốt<span className="stat-ico"><Icon name="money" size={15} /></span></div><div className="stat-val num">{moneyShort(stats.revenue)}</div><div className="stat-sub">{stats.wonCount} đơn</div></div>
        <div className="card stat"><div className="stat-top">Đã thu<span className="stat-ico"><Icon name="check" size={15} /></span></div><div className="stat-val num">{moneyShort(stats.paid)}</div><div className="stat-sub">{stats.revenue ? Math.round((stats.paid / stats.revenue) * 100) : 0}% doanh thu</div></div>
        <div className={'card stat' + (stats.debt > 0 ? ' stat-danger' : '')}><div className="stat-top">Công nợ phải thu<span className="stat-ico"><Icon name="alert" size={15} /></span></div><div className="stat-val num">{moneyShort(stats.debt)}</div><div className="stat-sub">{stats.debtCount} đơn còn nợ</div></div>
        <div className="card stat"><div className="stat-top">Đơn chưa hoàn tất<span className="stat-ico"><Icon name="receipt" size={15} /></span></div><div className="stat-val num">{stats.pending}</div><div className="stat-sub">thiếu tiền / hoá đơn / giấy tờ</div></div>
      </div>

      <div className="row gap8 wrap" style={{ marginBottom: 12 }}>
        {VIEWS.map(([k, l]) => (
          <button key={k} className={'chip' + (view === k ? ' chip-on' : '')} onClick={() => setView(k)}>{l} ({count(k)})</button>
        ))}
        <div className="search right" style={{ minWidth: 240 }}>
          <Icon name="search" />
          <input className="input" placeholder="Tìm mã đơn, khách hàng, sản phẩm…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {list.length === 0 && <div className="card"><Empty icon="receipt" text={view === 'debt' ? 'Không có đơn nào còn công nợ 🎉' : 'Không có đơn hàng nào khớp bộ lọc.'} /></div>}
      {list.map(({ o, c }) => (
        <OrderCard key={o.id} c={c} o={o} showCustomer onOpenCustomer={() => openCustomer(c.id, 'orders')} ownerName={isAdmin ? nameOf(c.owner_id) : undefined} />
      ))}
    </>
  );
}
