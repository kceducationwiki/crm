import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { useNav } from '../lib/nav';
import { Icon } from '../components/Icon';
import { Avatar, Empty, PageHeader, PriorityBadge, Select, StageBadge } from '../components/ui';
import { STAGES } from '../lib/constants';
import { addDays, customerDebt, customerStage, isOpen, isWon, moneyShort, money, openDeals, orderDebt, relDay, revenue, toDateStr, todayStr, wonOrders } from '../lib/format';

export function DashboardPage() {
  const { customers: all, isAdmin, profiles, me, nameOf, api } = useStore();
  const { openCustomer, go } = useNav();
  const [owner, setOwner] = useState('all');

  const customers = useMemo(
    () => (owner === 'all' ? all : all.filter((c) => (owner === 'none' ? !c.owner_id : c.owner_id === owner))),
    [all, owner],
  );

  const d = useMemo(() => {
    const today = todayStr();
    const monthKey = today.slice(0, 7);
    const since30 = addDays(new Date(), -30).toISOString();
    const allOrders = customers.flatMap((c) => c.orders);
    const orders = allOrders.filter(isWon); // doanh thu chỉ tính đơn đã chốt
    const openOrders = allOrders.filter(isOpen);
    const fus = customers.flatMap((c) => c.follow_ups.filter((f) => !f.done).map((f) => ({ f, c })));

    // Doanh thu 6 tháng gần nhất
    const months: { key: string; label: string; value: number }[] = [];
    const base = new Date(); base.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const m = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const key = toDateStr(m).slice(0, 7);
      months.push({ key, label: `T${m.getMonth() + 1}`, value: 0 });
    }
    for (const o of orders) { const m = months.find((x) => x.key === o.order_date.slice(0, 7)); if (m) m.value += Number(o.amount); }

    const won = orders.length;
    const closed = allOrders.filter((o) => o.stage === 'won' || o.stage === 'lost').length;

    return {
      total: customers.length,
      open: openOrders.length,
      newLeads: customers.filter((c) => c.created_at >= since30).length,
      revMonth: orders.filter((o) => o.order_date.startsWith(monthKey)).reduce((s, o) => s + Number(o.amount), 0),
      revTotal: orders.reduce((s, o) => s + Number(o.amount), 0),
      pipeValue: openOrders.reduce((s, o) => s + Number(o.amount), 0),
      debt: orders.reduce((s, o) => s + orderDebt(o), 0),
      debtCount: orders.filter((o) => orderDebt(o) > 0).length,
      fuToday: fus.filter((x) => x.f.due_date === today).length,
      fuOverdue: fus.filter((x) => x.f.due_date < today).length,
      winRate: closed ? Math.round((won / closed) * 100) : 0,
      months,
      stages: STAGES.map((s) => ({ ...s, n: allOrders.filter((o) => o.stage === s.key).length })),
      todo: fus.filter((x) => x.f.due_date <= toDateStr(addDays(new Date(), 3)))
        .sort((a, b) => a.f.due_date.localeCompare(b.f.due_date)).slice(0, 7),
    };
  }, [customers]);

  const team = useMemo(() => {
    if (!isAdmin) return [];
    const today = todayStr();
    return profiles.filter((p) => p.is_active).map((p) => {
      const mine = all.filter((c) => c.owner_id === p.id);
      return {
        p,
        total: mine.length,
        open: mine.reduce((n, c) => n + openDeals(c).length, 0),
        won: mine.reduce((n, c) => n + wonOrders(c).length, 0),
        debt: mine.reduce((n, c) => n + customerDebt(c), 0),
        rev: mine.reduce((s, c) => s + revenue(c), 0),
        overdue: mine.reduce((n, c) => n + c.follow_ups.filter((f) => !f.done && f.due_date < today).length, 0),
      };
    }).sort((a, b) => b.rev - a.rev);
  }, [isAdmin, profiles, all]);

  const maxMonth = Math.max(1, ...d.months.map((m) => m.value));
  const maxStage = Math.max(1, ...d.stages.map((s) => s.n));
  const hello = new Date().getHours() < 12 ? 'Chào buổi sáng' : new Date().getHours() < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

  return (
    <>
      <PageHeader
        title={`${hello}, ${me?.full_name || 'bạn'} 👋`}
        subtitle={isAdmin ? 'Tổng quan toàn bộ khách hàng của công ty.' : 'Tổng quan khách hàng bạn đang phụ trách.'}
        actions={isAdmin && (
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} style={{ minWidth: 200 }}
            options={[{ value: 'all', label: 'Tất cả nhân viên' }, ...profiles.map((p) => ({ value: p.id, label: p.full_name || p.email })), { value: 'none', label: 'Chưa gán' }]} />
        )}
      />

      {isAdmin && api.twoFactorSetup && !me?.totp_enabled && (
        <a href="#/settings" className="warn" style={{ display: 'block', marginBottom: 14 }}>
          🔐 Tài khoản quản lý của bạn chưa bật <b>xác thực 2 bước</b>. Nếu lộ mật khẩu, người khác xem được toàn bộ khách hàng — bấm để bật trong Cài đặt →
        </a>
      )}
      <div className="stats">
        <Stat icon="users" label="Khách hàng" value={String(d.total)} sub={`${d.open} đơn đang theo đuổi`} />
        <Stat icon="userplus" label="Lead mới (30 ngày)" value={String(d.newLeads)} sub="khách hàng mới tạo" />
        <Stat icon="money" label="Doanh thu tháng này" value={moneyShort(d.revMonth)} sub={`Tổng: ${moneyShort(d.revTotal)}`} />
        <Stat icon="target" label="Giá trị pipeline" value={moneyShort(d.pipeValue)} sub={`Tỉ lệ chốt ${d.winRate}%`} />
        <Stat icon="receipt" label="Công nợ phải thu" value={moneyShort(d.debt)} sub={`${d.debtCount} đơn còn nợ`} danger={d.debt > 0} />
        <Stat icon="alert" label="Follow-up cần làm" value={String(d.fuToday + d.fuOverdue)} sub={`${d.fuOverdue} quá hạn · ${d.fuToday} hôm nay`} danger={d.fuOverdue > 0} />
      </div>

      <div className="grid2">
        <div className="card card-pad">
          <div className="card-head"><h3>Doanh thu 6 tháng</h3><span className="small muted">VNĐ</span></div>
          <div className="vbars">
            {d.months.map((m) => (
              <div className="vbar" key={m.key} title={`${m.label}: ${money(m.value)}`}>
                <span className="vbar-val">{m.value ? moneyShort(m.value) : ''}</span>
                <div className="vbar-col" style={{ height: `${(m.value / maxMonth) * 100}%` }} />
                <span className="vbar-lbl">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card card-pad">
          <div className="card-head"><h3>Đơn hàng theo giai đoạn</h3><a href="#/pipeline" className="small">Xem Kanban →</a></div>
          {d.stages.map((s) => (
            <div className="hbar" key={s.key}>
              <span className="truncate">{s.label}</span>
              <div className="hbar-track"><div className="hbar-fill" style={{ width: `${(s.n / maxStage) * 100}%` }} /></div>
              <span className="num small muted" style={{ textAlign: 'right' }}>{s.n} đơn</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid2-eq">
        <div className="card card-pad">
          <div className="card-head"><h3>Follow-up cần làm (3 ngày tới)</h3><a href="#/followups" className="small">Tất cả →</a></div>
          {d.todo.length === 0 && <Empty icon="check" text="Không có follow-up nào sắp đến hạn 🎉" />}
          {d.todo.map(({ f, c }) => (
            <div key={f.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => openCustomer(c.id)}>
              <div className="grow">
                <div className="row gap8"><b className="truncate">{c.school_name}</b><PriorityBadge value={f.priority} /></div>
                <div className="small muted truncate">{f.content}{isAdmin && ` · ${nameOf(c.owner_id)}`}</div>
              </div>
              <span className={'small ' + (f.due_date < todayStr() ? 'badge tone-red' : 'badge tone-blue')}>{relDay(f.due_date)}</span>
            </div>
          ))}
        </div>

        {isAdmin ? (
          <div className="card card-pad">
            <div className="card-head"><h3>Hiệu suất nhân viên</h3><a href="#/staff" className="small">Quản lý →</a></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Nhân viên</th><th>KH</th><th>Đơn mở</th><th>Đơn chốt</th><th>Doanh thu</th><th>Công nợ</th><th>FU trễ</th></tr></thead>
                <tbody>
                  {team.map((t) => (
                    <tr key={t.p.id} onClick={() => setOwner(t.p.id)} title="Lọc dashboard theo nhân viên này">
                      <td><div className="row gap8"><Avatar name={t.p.full_name || t.p.email} size={24} /><span className="truncate">{t.p.full_name}</span></div></td>
                      <td className="num">{t.total}</td><td className="num">{t.open}</td><td className="num">{t.won}</td>
                      <td className="num">{moneyShort(t.rev)}</td>
                      <td className="num">{t.debt > 0 ? <span style={{ color: 'var(--danger)' }}>{moneyShort(t.debt)}</span> : <span className="muted">0</span>}</td>
                      <td>{t.overdue ? <span className="badge tone-red">{t.overdue}</span> : <span className="muted">0</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="card card-pad">
            <div className="card-head"><h3>Khách hàng mới cập nhật</h3><a href="#/customers" className="small" onClick={() => go('customers')}>Tất cả →</a></div>
            {customers.length === 0 && <Empty icon="users" text="Bạn chưa có khách hàng nào. Vào mục Khách hàng để thêm mới." />}
            {[...customers].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6).map((c) => (
              <div key={c.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => openCustomer(c.id)}>
                <Icon name="building" className="muted" />
                <div className="grow"><b className="truncate" style={{ display: 'block' }}>{c.school_name}</b><span className="small muted">{c.province}</span></div>
                {customerStage(c) ? <StageBadge stage={customerStage(c)!} /> : <span className="small muted">Chưa có đơn</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ icon, label, value, sub, danger }: { icon: string; label: string; value: string; sub: string; danger?: boolean }) {
  return (
    <div className={'card stat' + (danger ? ' stat-danger' : '')}>
      <div className="stat-top">{label}<span className="stat-ico"><Icon name={icon} size={15} /></span></div>
      <div className="stat-val num">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}
