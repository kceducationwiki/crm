import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { useNav } from '../lib/nav';
import { Icon } from '../components/Icon';
import { Avatar, Button, Empty, LifeBadge, PageHeader, Select, StageBadge, toast } from '../components/ui';
import { CustomerForm } from './CustomerForm';
import { LIFECYCLES, PROVINCES, SCHOOL_TYPES, STAGES, lifecycleMeta, stageMeta } from '../lib/constants';
import { typeLabel } from '../lib/deals';
import { customerDebt, customerStage, downloadCsv, fmtDate, moneyShort, nextFollowUp, norm, openDeals, primaryContact, relDay, revenue, todayStr, wonOrders } from '../lib/format';

type Sort = 'updated' | 'name' | 'revenue' | 'followup';

export function CustomersPage() {
  const { customers, isAdmin, profiles, nameOf, api, reload, loading } = useStore();
  const { openCustomer } = useNav();
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [life, setLife] = useState('');
  const [type, setType] = useState('');
  const [prov, setProv] = useState('');
  const [owner, setOwner] = useState('');
  const [quick, setQuick] = useState<'all' | 'open' | 'won' | 'debt' | 'overdue'>('all');
  const [sort, setSort] = useState<Sort>('updated');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    const nq = norm(q.trim());
    const today = todayStr();
    const r = customers.filter((c) => {
      if (stage && !c.orders.some((o) => o.stage === stage)) return false;
      if (life && c.lifecycle !== life) return false;
      if (type && (type === 'individual' ? c.customer_type !== 'individual' : c.customer_type !== 'school' || c.school_type !== type)) return false;
      if (prov && c.province !== prov) return false;
      if (owner && (owner === 'none' ? c.owner_id : c.owner_id !== owner)) return false;
      if (quick === 'open' && openDeals(c).length === 0) return false;
      if (quick === 'won' && wonOrders(c).length === 0) return false;
      if (quick === 'debt' && customerDebt(c) === 0) return false;
      if (quick === 'overdue' && !c.follow_ups.some((f) => !f.done && f.due_date < today)) return false;
      if (nq) {
        const hay = norm([c.code, c.school_name, c.province, c.district, nameOf(c.owner_id), ...c.tags,
          ...c.contacts.flatMap((x) => [x.name, x.email, x.phone])].join(' '));
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
    const fu = (id: string) => nextFollowUp(customers.find((c) => c.id === id)!)?.due_date ?? '9999';
    return r.sort((a, b) =>
      sort === 'name' ? a.school_name.localeCompare(b.school_name, 'vi')
        : sort === 'revenue' ? revenue(b) - revenue(a)
          : sort === 'followup' ? fu(a.id).localeCompare(fu(b.id))
            : b.updated_at.localeCompare(a.updated_at));
  }, [customers, q, stage, life, type, prov, owner, quick, sort, nameOf]);

  const allSel = list.length > 0 && list.every((c) => sel.has(c.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearFilters = () => { setStage(''); setLife(''); setType(''); setProv(''); setOwner(''); setQ(''); setQuick('all'); };
  const hasFilter = stage || life || type || prov || owner || q || quick !== 'all';

  const bulk = async (fn: () => Promise<void>, msg: string) => {
    try { await fn(); toast.ok(msg); setSel(new Set()); await reload(); } catch (e) { toast.err(e); }
  };

  const exportCsv = () => {
    downloadCsv(`khach-hang-${todayStr()}.csv`, [
      ['Mã', 'Khách hàng', 'Loại', 'Tỉnh', 'Quận/Huyện', 'Địa chỉ', 'Số HS', 'Người liên hệ', 'Chức vụ', 'Điện thoại', 'Email',
        'Giai đoạn', 'Lifecycle', 'Nguồn', 'Sản phẩm quan tâm', 'Đơn đang mở', 'Đơn đã chốt', 'Doanh thu', 'Công nợ', 'Phụ trách', 'Ngày tạo'],
      ...list.map((c) => {
        const p = primaryContact(c);
        const st = customerStage(c);
        return [c.code, c.school_name, typeLabel(c), c.province, c.district, c.address, c.student_count ?? '', p?.name ?? '', p?.role ?? '',
          p?.phone ?? '', p?.email ?? '', st ? stageMeta(st).label : '', lifecycleMeta(c.lifecycle).label, c.source,
          c.interests.join(', '), openDeals(c).length, wonOrders(c).length, revenue(c), customerDebt(c), nameOf(c.owner_id), fmtDate(c.created_at)];
      }),
    ]);
  };

  const today = todayStr();

  return (
    <>
      <PageHeader
        title="Khách hàng"
        subtitle={isAdmin ? `Toàn bộ ${customers.length} khách hàng của công ty` : `${customers.length} khách hàng bạn đang phụ trách`}
        actions={<>
          <Button variant="outline" icon="download" onClick={exportCsv}>Xuất CSV</Button>
          <Button icon="plus" onClick={() => setCreating(true)}>Thêm khách hàng</Button>
        </>}
      />

      <div className="row gap8 wrap" style={{ marginBottom: 12 }}>
        {([['all', 'Tất cả'], ['open', 'Đang có cơ hội'], ['won', 'Đã có đơn chốt'], ['debt', 'Còn công nợ'], ['overdue', 'Follow-up quá hạn']] as const).map(([k, l]) => (
          <button key={k} className={'chip' + (quick === k ? ' chip-on' : '')} onClick={() => setQuick(k)}>{l}</button>
        ))}
      </div>

      {sel.size > 0 && (
        <div className="bulk">
          <b>Đã chọn {sel.size}</b>
          {isAdmin && (
            <Select style={{ width: 190 }} value="" onChange={(e) => e.target.value && bulk(() => api.updateCustomers([...sel], { owner_id: e.target.value === 'none' ? null : e.target.value }), 'Đã chuyển giao khách hàng')}
              options={[{ value: '', label: 'Gán cho nhân viên…' }, ...profiles.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.full_name || p.email })), { value: 'none', label: '— Bỏ gán —' }]} />
          )}
          {isAdmin && (
            <Button variant="danger" size="sm" icon="trash" onClick={() => confirm(`Xoá vĩnh viễn ${sel.size} khách hàng?`) && bulk(() => api.deleteCustomers([...sel]), 'Đã xoá')}>Xoá</Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setSel(new Set())}>Bỏ chọn</Button>
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <div className="search">
            <Icon name="search" />
            <input className="input" placeholder="Tìm tên khách, mã, người liên hệ, SĐT, email, tag…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={stage} onChange={(e) => setStage(e.target.value)} title="Lọc khách có đơn hàng ở giai đoạn này" options={[{ value: '', label: 'Mọi giai đoạn đơn' }, ...STAGES.map((s) => ({ value: s.key, label: s.label }))]} />
          <Select value={life} onChange={(e) => setLife(e.target.value)} options={[{ value: '', label: 'Mọi lifecycle' }, ...LIFECYCLES.map((s) => ({ value: s.key, label: s.label }))]} />
          <Select className="hide-sm" value={type} onChange={(e) => setType(e.target.value)} options={[{ value: '', label: 'Mọi loại khách' }, { value: 'individual', label: 'Khách lẻ' }, ...SCHOOL_TYPES.map((s) => ({ value: s, label: 'Trường ' + s.toLowerCase() }))]} />
          <Select className="hide-sm" value={prov} onChange={(e) => setProv(e.target.value)} options={[{ value: '', label: 'Mọi tỉnh' }, ...PROVINCES.map((s) => ({ value: s, label: s }))]} />
          {isAdmin && (
            <Select value={owner} onChange={(e) => setOwner(e.target.value)} options={[{ value: '', label: 'Mọi nhân viên' }, ...profiles.map((p) => ({ value: p.id, label: p.full_name || p.email })), { value: 'none', label: 'Chưa gán' }]} />
          )}
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} options={[
            { value: 'updated', label: 'Mới cập nhật' }, { value: 'followup', label: 'Follow-up gần nhất' },
            { value: 'revenue', label: 'Doanh thu cao nhất' }, { value: 'name', label: 'Tên A → Z' }]} />
          {hasFilter && <Button variant="ghost" icon="x" onClick={clearFilters}>Xoá lọc</Button>}
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="chk"><input type="checkbox" checked={allSel} aria-label="Chọn tất cả"
                  onChange={() => setSel(allSel ? new Set() : new Set(list.map((c) => c.id)))} /></th>
                <th>Mã</th><th>Khách hàng</th><th className="hide-sm">Liên hệ</th><th>Đơn hàng</th><th className="hide-sm">Lifecycle</th>
                <th>Doanh thu</th><th>Công nợ</th><th className="hide-sm">Follow-up</th>{isAdmin && <th>Phụ trách</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const p = primaryContact(c);
                const fu = nextFollowUp(c);
                const st = customerStage(c);
                const nOpen = openDeals(c).length, nWon = wonOrders(c).length, debt = customerDebt(c);
                return (
                  <tr key={c.id} className={sel.has(c.id) ? 'selected' : ''} onClick={() => openCustomer(c.id)}>
                    <td className="chk" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={'Chọn ' + c.school_name} /></td>
                    <td className="mono muted">{c.code}</td>
                    <td className="school"><b>{c.school_name}</b><span className="small muted">{typeLabel(c)}{c.province ? ' · ' + c.province : ''}</span></td>
                    <td className="hide-sm">{p ? <><div>{c.customer_type === 'individual' ? (p.email || '—') : p.name}</div><span className="small muted">{p.phone}</span></> : <span className="muted">—</span>}</td>
                    <td>{st ? <><StageBadge stage={st} />{nOpen > 1 && <div className="small muted">{nOpen} đơn đang mở</div>}</> : <span className="muted small">Chưa có đơn</span>}</td>
                    <td className="hide-sm"><LifeBadge value={c.lifecycle} /></td>
                    <td className="num">{nWon ? <>{moneyShort(revenue(c))}<div className="small muted">{nWon} đơn chốt</div></> : <span className="muted">—</span>}</td>
                    <td className="num">{debt > 0 ? <span className="badge tone-red">{moneyShort(debt)}</span> : nWon ? <span className="small" style={{ color: '#16a34a' }}>Đã thu đủ</span> : <span className="muted">—</span>}</td>
                    <td className="hide-sm">{fu ? <span className={'badge ' + (fu.due_date < today ? 'tone-red' : fu.due_date === today ? 'tone-orange' : 'tone-gray')}>{relDay(fu.due_date)}</span> : <span className="muted small">Chưa đặt lịch</span>}</td>
                    {isAdmin && <td><div className="row gap8"><Avatar name={nameOf(c.owner_id)} size={22} /><span className="small truncate" style={{ maxWidth: 120 }}>{nameOf(c.owner_id)}</span></div></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && <Empty icon={loading ? 'refresh' : 'users'} text={loading ? 'Đang tải…' : hasFilter ? 'Không có khách hàng nào khớp bộ lọc.' : 'Chưa có khách hàng. Bấm "Thêm khách hàng" để bắt đầu.'} />}
        </div>
      </div>

      {creating && <CustomerForm onClose={() => setCreating(false)} onSaved={(c) => openCustomer(c.id)} />}
    </>
  );
}
