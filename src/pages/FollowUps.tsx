import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { useNav } from '../lib/nav';
import { Empty, PageHeader, PriorityBadge, Select, toast } from '../components/ui';
import { addDays, fmtDate, relDay, toDateStr, todayStr } from '../lib/format';
import type { Customer, FollowUp } from '../lib/types';

type Row = { f: FollowUp; c: Customer };

export function FollowUpsPage() {
  const { customers, isAdmin, profiles, nameOf, api, reload } = useStore();
  const { openCustomer } = useNav();
  const [owner, setOwner] = useState('');
  const [showDone, setShowDone] = useState(false);

  const groups = useMemo(() => {
    const today = todayStr();
    const week = toDateStr(addDays(new Date(), 7));
    const rows: Row[] = customers
      .filter((c) => !owner || c.owner_id === owner)
      .flatMap((c) => c.follow_ups.filter((f) => showDone || !f.done).map((f) => ({ f, c })))
      .sort((a, b) => a.f.due_date.localeCompare(b.f.due_date));
    const open = rows.filter((r) => !r.f.done);
    return [
      { key: 'over', title: 'Quá hạn', tone: 'red', rows: open.filter((r) => r.f.due_date < today) },
      { key: 'today', title: 'Hôm nay', tone: 'orange', rows: open.filter((r) => r.f.due_date === today) },
      { key: 'week', title: '7 ngày tới', tone: 'blue', rows: open.filter((r) => r.f.due_date > today && r.f.due_date <= week) },
      { key: 'later', title: 'Sau đó', tone: 'gray', rows: open.filter((r) => r.f.due_date > week) },
      ...(showDone ? [{ key: 'done', title: 'Đã hoàn thành', tone: 'green', rows: rows.filter((r) => r.f.done).reverse() }] : []),
    ];
  }, [customers, owner, showDone]);

  const toggle = async (f: FollowUp) => {
    try { await api.updateChild('follow_ups', f.id, { done: !f.done }); if (!f.done) toast.ok('Đã hoàn thành'); await reload(); }
    catch (e) { toast.err(e); }
  };

  const total = groups.filter((g) => g.key !== 'done').reduce((n, g) => n + g.rows.length, 0);

  return (
    <>
      <PageHeader title="Follow-up" subtitle={`${total} việc cần chăm sóc khách hàng`}
        actions={<>
          <label className="row gap8 small"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Hiện việc đã xong</label>
          {isAdmin && <Select style={{ width: 200 }} value={owner} onChange={(e) => setOwner(e.target.value)}
            options={[{ value: '', label: 'Tất cả nhân viên' }, ...profiles.map((p) => ({ value: p.id, label: p.full_name || p.email }))]} />}
        </>} />
      {total === 0 && !showDone && <div className="card"><Empty icon="check" text="Không còn follow-up nào. Tuyệt vời! 🎉" /></div>}
      {groups.filter((g) => g.rows.length).map((g) => (
        <div key={g.key} className="card card-pad" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3><span className={`badge tone-${g.tone}`}><span className="dot" />{g.title}</span></h3><span className="muted small">{g.rows.length}</span></div>
          {g.rows.map(({ f, c }) => (
            <div key={f.id} className="list-item">
              <input type="checkbox" checked={f.done} onChange={() => toggle(f)} style={{ marginTop: 3, accentColor: 'var(--primary)' }} aria-label="Hoàn thành" />
              <div className="grow" style={{ cursor: 'pointer' }} onClick={() => openCustomer(c.id)}>
                <div className={f.done ? 'done' : ''}><b>{c.school_name}</b> — {f.content}</div>
                <div className="row gap8 small muted wrap" style={{ marginTop: 2 }}>
                  <span>{fmtDate(f.due_date)}{!f.done && ` · ${relDay(f.due_date)}`}</span>
                  <PriorityBadge value={f.priority} />
                  {isAdmin && <span>· {nameOf(c.owner_id)}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
