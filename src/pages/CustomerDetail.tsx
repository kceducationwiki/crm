import { useState } from 'react';
import { useStore } from '../lib/store';
import { Icon } from '../components/Icon';
import { Badge, Button, Chips, Drawer, Empty, Field, Input, LifeBadge, PriorityBadge, Select, StageBadge, Tabs, Textarea, toast } from '../components/ui';
import { CustomerForm } from './CustomerForm';
import { OrderCard } from '../components/OrderCard';
import { Documents } from '../components/Documents';
import { ACTIVITY_TYPES, PRIORITIES, PRODUCTS, STAGES, activityLabel } from '../lib/constants';
import { newOrder, setOrderStage, typeLabel } from '../lib/deals';
import { customerDebt, customerStage, fmtDate, fmtDateTime, isOpen, isWon, money, openDeals, primaryContact, relDay, revenue, todayStr, wonOrders } from '../lib/format';
import type { ChildTable, Customer, Priority, Stage } from '../lib/types';

import type { DetailTab } from '../lib/nav';

type Tab = DetailTab;

export function CustomerDetail({ id, onClose, initialTab }: { id: string; onClose: () => void; initialTab?: Tab }) {
  const { customers, api, reload, me, isAdmin, profiles, nameOf } = useStore();
  const c = customers.find((x) => x.id === id);
  const [tab, setTab] = useState<Tab>(initialTab ?? 'overview');
  const [editing, setEditing] = useState(false);

  if (!c) return null;

  const run = async (fn: () => Promise<unknown>, msg?: string) => {
    try { await fn(); if (msg) toast.ok(msg); await reload(); } catch (e) { toast.err(e); }
  };
  const log = (type: string, content: string) =>
    api.addChild('activities', { customer_id: c.id, type, content, created_by: me!.id });

  const transfer = (owner: string) => run(async () => {
    await api.updateCustomer(c.id, { owner_id: owner || null });
    await log('other', `Chuyển giao khách hàng cho ${nameOf(owner || null)}`);
  }, 'Đã chuyển giao');

  const p = primaryContact(c);
  const rev = revenue(c);
  const openFu = c.follow_ups.filter((f) => !f.done).length;
  const stage = customerStage(c);

  return (
    <Drawer onClose={onClose}>
      <div className="drawer-head">
        <div className="row gap12" style={{ alignItems: 'flex-start' }}>
          <div className="grow">
            <div className="mono muted">{c.code}</div>
            <h2 style={{ fontSize: 20, margin: '2px 0 8px' }}>{c.school_name}</h2>
            <div className="row gap8 wrap">
              <Badge tone={c.customer_type === 'individual' ? 'purple' : 'gray'}>{typeLabel(c)}</Badge>
              {stage && <StageBadge stage={stage} />}
              <LifeBadge value={c.lifecycle} />
              {c.tags.slice(0, 4).map((t) => <Badge key={t} tone="sky">#{t}</Badge>)}
            </div>
          </div>
          <Button variant="outline" size="sm" icon="edit" onClick={() => setEditing(true)}>Sửa</Button>
          {isAdmin && (
            <Button variant="ghost" size="sm" icon="trash" aria-label="Xoá khách hàng" title="Xoá khách hàng"
              onClick={() => confirm(`Xoá vĩnh viễn ${c.school_name}?`) && run(async () => { await api.deleteCustomers([c.id]); onClose(); }, 'Đã xoá')} />
          )}
          <Button variant="ghost" size="sm" icon="x" aria-label="Đóng" onClick={onClose} />
        </div>

        <div className="row gap8 wrap" style={{ marginTop: 12 }}>
          <Button variant="outline" size="sm" icon="phone" disabled={!p?.phone}
            onClick={() => { window.location.href = `tel:${p!.phone}`; run(() => log('call', `Gọi ${p!.name} (${p!.phone})`)); }}>Gọi</Button>
          <Button variant="outline" size="sm" icon="mail" disabled={!p?.email}
            onClick={() => { window.location.href = `mailto:${p!.email}`; run(() => log('email', `Gửi email tới ${p!.email}`)); }}>Email</Button>
          <Button variant="outline" size="sm" icon="message" disabled={!p?.zalo && !p?.phone}
            onClick={() => { const z = p!.zalo || p!.phone; window.open(`https://zalo.me/${z.replace(/\D/g, '')}`, '_blank', 'noopener'); run(() => log('zalo', `Nhắn Zalo ${z}`)); }}>Zalo</Button>
          <div className="right row gap8 wrap">
            {isAdmin ? (
              <Select style={{ width: 180, height: 30 }} value={c.owner_id ?? ''} aria-label="Nhân viên phụ trách" title="Chuyển giao khách hàng"
                onChange={(e) => transfer(e.target.value)}
                options={[{ value: '', label: '— Chưa gán —' }, ...profiles.filter((x) => x.is_active || x.id === c.owner_id).map((x) => ({ value: x.id, label: '👤 ' + (x.full_name || x.email) }))]} />
            ) : null}
          </div>
        </div>
      </div>

      <div className="drawer-body">
        <Tabs<Tab> value={tab} onChange={setTab} tabs={[
          { key: 'overview', label: 'Tổng quan' },
          { key: 'timeline', label: 'Timeline', count: c.activities.length },
          { key: 'notes', label: 'Ghi chú', count: c.notes.length },
          { key: 'followups', label: 'Follow-up', count: openFu },
          { key: 'orders', label: 'Đơn hàng', count: c.orders.length },
          { key: 'docs', label: 'Hồ sơ', count: c.documents.length },
        ]} />

        {tab === 'overview' && <Overview c={c} rev={rev} run={run} />}
        {tab === 'timeline' && <Timeline c={c} run={run} />}
        {tab === 'notes' && <Notes c={c} run={run} />}
        {tab === 'followups' && <FollowUps c={c} run={run} />}
        {tab === 'orders' && <Orders c={c} run={run} />}
        {tab === 'docs' && <Documents c={c} />}
      </div>

      {editing && <CustomerForm customer={c} onClose={() => setEditing(false)} />}
    </Drawer>
  );
}

type Run = (fn: () => Promise<unknown>, msg?: string) => Promise<void>;

function Overview({ c, rev, run }: { c: Customer; rev: number; run: Run }) {
  const { api, nameOf } = useStore();
  const [adding, setAdding] = useState(false);
  const [ct, setCt] = useState({ name: '', role: '', email: '', phone: '', zalo: '' });
  const debt = customerDebt(c);
  const open = openDeals(c);

  const addContact = () => {
    if (!ct.name.trim()) return toast.err('Nhập tên người liên hệ');
    run(async () => {
      await api.addChild('contacts', { ...ct, customer_id: c.id, is_primary: c.contacts.length === 0 });
      setCt({ name: '', role: '', email: '', phone: '', zalo: '' }); setAdding(false);
    }, 'Đã thêm liên hệ');
  };
  const makePrimary = (id: string) => run(async () => {
    for (const x of c.contacts) if (x.is_primary !== (x.id === id)) await api.updateChild('contacts', x.id, { is_primary: x.id === id });
  });

  return (
    <>
      <div className="kv">
        <div className="kv-item"><span>Đơn đã chốt</span><b>{wonOrders(c).length}</b></div>
        <div className="kv-item"><span>Tổng doanh thu</span><b>{money(rev)}</b></div>
        <div className="kv-item"><span>Công nợ</span><b style={{ color: debt > 0 ? 'var(--danger)' : undefined }}>{debt > 0 ? money(debt) : 'Không nợ'}</b></div>
        <div className="kv-item"><span>Cơ hội đang mở</span><b>{open.length ? `${open.length} · ${money(open.reduce((t, o) => t + o.amount, 0))}` : '—'}</b></div>
      </div>

      <div className="box">
        <div className="box-title"><Icon name={c.customer_type === 'individual' ? 'user' : 'building'} /> {c.customer_type === 'individual' ? 'Thông tin khách lẻ' : 'Thông tin trường'}</div>
        <div className="info-line"><Icon name="map" size={14} />{[c.address, c.district, c.province].filter(Boolean).join(', ') || '—'}</div>
        {c.website && <div className="info-line"><Icon name="globe" size={14} /><a href={/^https?:/.test(c.website) ? c.website : 'https://' + c.website} target="_blank" rel="noreferrer">{c.website}</a></div>}
        {c.fanpage && <div className="info-line"><Icon name="message" size={14} />{c.fanpage}</div>}
        {c.student_count != null && <div className="info-line"><Icon name="users" size={14} />{c.student_count.toLocaleString('vi-VN')} học sinh</div>}
        <div className="small muted" style={{ marginTop: 8 }}>
          Phụ trách: <b style={{ color: 'var(--fg)' }}>{nameOf(c.owner_id)}</b> · Nguồn: {c.source} · Tạo ngày {fmtDate(c.created_at)}
        </div>
      </div>

      <div className="box">
        <div className="box-title"><Icon name="users" /> Người liên hệ
          <Button className="right" variant="ghost" size="sm" icon="plus" onClick={() => setAdding((v) => !v)}>Thêm</Button>
        </div>
        {adding && (
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <Field label="Họ tên"><Input value={ct.name} onChange={(e) => setCt({ ...ct, name: e.target.value })} /></Field>
            <Field label="Chức vụ"><Input value={ct.role} onChange={(e) => setCt({ ...ct, role: e.target.value })} /></Field>
            <Field label="Điện thoại"><Input value={ct.phone} onChange={(e) => setCt({ ...ct, phone: e.target.value })} /></Field>
            <Field label="Email"><Input value={ct.email} onChange={(e) => setCt({ ...ct, email: e.target.value })} /></Field>
            <Field label="Zalo"><Input value={ct.zalo} onChange={(e) => setCt({ ...ct, zalo: e.target.value })} placeholder="Để trống = dùng SĐT" /></Field>
            <div className="row gap8" style={{ alignItems: 'flex-end' }}><Button onClick={addContact}>Lưu liên hệ</Button></div>
          </div>
        )}
        {c.contacts.length === 0 && <div className="small muted">Chưa có liên hệ</div>}
        {c.contacts.map((x) => (
          <div key={x.id} className="row gap8" style={{ borderTop: '1px solid var(--border)', padding: '8px 0', alignItems: 'flex-start' }}>
            <div className="grow">
              <div><b>{x.name}</b> <span className="small muted">· {x.role}</span> {x.is_primary && <Badge tone="blue">Chính</Badge>}</div>
              <div className="small muted row gap12 wrap">
                {x.phone && <span className="row gap4"><Icon name="phone" size={12} />{x.phone}</span>}
                {x.email && <span className="row gap4"><Icon name="mail" size={12} />{x.email}</span>}
                {x.zalo && x.zalo !== x.phone && <span>Zalo: {x.zalo}</span>}
              </div>
            </div>
            {!x.is_primary && <Button variant="ghost" size="sm" onClick={() => makePrimary(x.id)}>Đặt chính</Button>}
            <Button variant="ghost" size="sm" icon="trash" aria-label="Xoá liên hệ" onClick={() => run(() => api.deleteChild('contacts', x.id))} />
          </div>
        ))}
      </div>

      <div className="box">
        <div className="box-title">Sản phẩm quan tâm</div>
        <Chips options={PRODUCTS} value={c.interests} onChange={(v) => run(() => api.updateCustomer(c.id, { interests: v }))} />
      </div>
    </>
  );
}

function Timeline({ c, run }: { c: Customer; run: Run }) {
  const { api, me, nameOf } = useStore();
  const [type, setType] = useState('call');
  const [text, setText] = useState('');
  const add = () => text.trim() && run(async () => {
    await api.addChild('activities', { customer_id: c.id, type, content: text.trim(), created_by: me!.id }); setText('');
  });
  return (
    <>
      <div className="row gap8" style={{ marginBottom: 14 }}>
        <Select style={{ width: 160 }} value={type} onChange={(e) => setType(e.target.value)} options={ACTIVITY_TYPES.filter((a) => a.key !== 'stage').map((a) => ({ value: a.key, label: a.label }))} />
        <Input placeholder="Nội dung hoạt động…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button icon="plus" onClick={add} aria-label="Thêm hoạt động" />
      </div>
      {c.activities.length === 0 && <Empty icon="activity" text="Chưa có hoạt động" />}
      {c.activities.map((a) => (
        <div key={a.id} className="list-item">
          <Icon name="activity" className="muted" />
          <div className="grow">
            <div className="small muted">{fmtDateTime(a.created_at)} · {activityLabel(a.type)} · {nameOf(a.created_by)}</div>
            <div>{a.content}</div>
          </div>
          <DelBtn table="activities" id={a.id} run={run} />
        </div>
      ))}
    </>
  );
}

function Notes({ c, run }: { c: Customer; run: Run }) {
  const { api, me, nameOf } = useStore();
  const [text, setText] = useState('');
  const add = () => text.trim() && run(async () => {
    await api.addChild('notes', { customer_id: c.id, text: text.trim(), author_id: me!.id }); setText('');
  });
  return (
    <>
      <div className="row gap8" style={{ marginBottom: 14, alignItems: 'flex-start' }}>
        <Textarea rows={2} placeholder="Ghi chú mới…" value={text} onChange={(e) => setText(e.target.value)} />
        <Button icon="plus" onClick={add} aria-label="Thêm ghi chú" />
      </div>
      {c.notes.length === 0 && <Empty icon="note" text="Chưa có ghi chú" />}
      {c.notes.map((n) => (
        <div key={n.id} className="list-item">
          <Icon name="note" className="muted" />
          <div className="grow">
            <div className="small muted">{fmtDateTime(n.created_at)} · {nameOf(n.author_id)}</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
          </div>
          <DelBtn table="notes" id={n.id} run={run} />
        </div>
      ))}
    </>
  );
}

function FollowUps({ c, run }: { c: Customer; run: Run }) {
  const { api, me } = useStore();
  const [f, setF] = useState({ due_date: todayStr(), content: '', priority: 'medium' as Priority });
  const add = () => {
    if (!f.content.trim()) return toast.err('Nhập nội dung follow-up');
    run(async () => {
      await api.addChild('follow_ups', { customer_id: c.id, ...f, content: f.content.trim(), done: false, assignee_id: c.owner_id ?? me!.id });
      setF({ ...f, content: '' });
    }, 'Đã thêm follow-up');
  };
  const today = todayStr();
  const sorted = [...c.follow_ups].sort((a, b) => Number(a.done) - Number(b.done) || a.due_date.localeCompare(b.due_date));
  return (
    <>
      <div className="box">
        <div className="form-grid">
          <Field label="Ngày hẹn"><Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
          <Field label="Ưu tiên"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })} options={PRIORITIES.map((p) => ({ value: p.key, label: p.label }))} /></Field>
          <Field label="Nội dung" span2><Input value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="VD: Gọi lại xác nhận lịch demo" /></Field>
        </div>
        <Button style={{ marginTop: 12 }} icon="plus" onClick={add}>Thêm follow-up</Button>
      </div>
      {sorted.length === 0 && <Empty icon="calendar" text="Chưa có follow-up" />}
      {sorted.map((x) => (
        <div key={x.id} className="list-item">
          <input type="checkbox" checked={x.done} style={{ marginTop: 3, accentColor: 'var(--primary)' }} aria-label="Hoàn thành"
            onChange={() => run(() => api.updateChild('follow_ups', x.id, { done: !x.done }), x.done ? undefined : 'Đã hoàn thành')} />
          <div className="grow">
            <div className={x.done ? 'done' : ''}>{x.content}</div>
            <div className="row gap8 small muted" style={{ marginTop: 2 }}>
              {fmtDate(x.due_date)}
              {!x.done && <span className={'badge ' + (x.due_date < today ? 'tone-red' : x.due_date === today ? 'tone-orange' : 'tone-gray')}>{relDay(x.due_date)}</span>}
              <PriorityBadge value={x.priority} />
            </div>
          </div>
          <DelBtn table="follow_ups" id={x.id} run={run} />
        </div>
      ))}
    </>
  );
}

function Orders({ c, run }: { c: Customer; run: Run }) {
  const { api, me } = useStore();
  const [o, setO] = useState({ amount: '', products: c.interests, stage: 'lead' as Stage, note: '' });
  const add = () => {
    const amount = Number(o.amount) || 0;
    if (amount < 0) return toast.err('Giá trị đơn không hợp lệ');
    if (o.stage === 'won' && !amount) return toast.err('Đơn đã chốt cần có giá trị');
    run(async () => {
      // Tạo ở giai đoạn trước rồi mới chuyển "Chốt đơn" để chạy đủ logic chốt (vòng đời, timeline)
      const created = await api.addChild('orders', newOrder(c.id, me!.id, { amount, products: o.products, note: o.note.trim(), stage: o.stage === 'won' ? 'pending' : o.stage }));
      if (o.stage === 'won') await setOrderStage(api, me!.id, c, created, 'won');
      setO({ amount: '', products: c.interests, stage: 'lead', note: '' });
    }, o.stage === 'won' ? 'Đã thêm đơn đã chốt' : 'Đã thêm đơn vào Pipeline');
  };
  const open = c.orders.filter(isOpen), won = c.orders.filter(isWon), other = c.orders.filter((x) => !isOpen(x) && !isWon(x));
  return (
    <>
      <div className="box">
        <div className="box-title"><Icon name="plus" /> Thêm đơn hàng / cơ hội</div>
        <div className="form-grid">
          <Field label="Giá trị (₫)"><Input type="number" min={0} step={1000000} value={o.amount} onChange={(e) => setO({ ...o, amount: e.target.value })} placeholder="Dự kiến, sửa lại sau được" /></Field>
          <Field label="Giai đoạn"><Select value={o.stage} onChange={(e) => setO({ ...o, stage: e.target.value as Stage })} options={STAGES.map((s) => ({ value: s.key, label: s.label }))} /></Field>
          <Field label="Sản phẩm" span2><Chips options={PRODUCTS} value={o.products} onChange={(v) => setO({ ...o, products: v })} /></Field>
          <Field label="Ghi chú" span2><Input value={o.note} onChange={(e) => setO({ ...o, note: e.target.value })} placeholder="VD: 20 bộ VEX IQ cho CLB robot" /></Field>
        </div>
        <Button style={{ marginTop: 12 }} icon="plus" onClick={add}>Thêm đơn</Button>
      </div>
      {c.orders.length === 0 && <Empty icon="cart" text="Chưa có đơn hàng. Thêm đơn để theo dõi trên Pipeline." />}
      {open.length > 0 && <div className="box-title" style={{ marginTop: 14 }}>Đang theo đuổi ({open.length})</div>}
      {open.map((x) => <OrderCard key={x.id} c={c} o={x} />)}
      {won.length > 0 && <div className="box-title" style={{ marginTop: 14 }}>Đã chốt ({won.length})</div>}
      {won.map((x) => <OrderCard key={x.id} c={c} o={x} />)}
      {other.length > 0 && <div className="box-title" style={{ marginTop: 14 }}>Tạm dừng / Thất bại ({other.length})</div>}
      {other.map((x) => <OrderCard key={x.id} c={c} o={x} />)}
    </>
  );
}

function DelBtn({ table, id, run }: { table: ChildTable; id: string; run: Run }) {
  const { api } = useStore();
  return <Button variant="ghost" size="sm" icon="trash" aria-label="Xoá" onClick={() => confirm('Xoá mục này?') && run(() => api.deleteChild(table, id))} />;
}
