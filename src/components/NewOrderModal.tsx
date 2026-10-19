import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { Icon } from './Icon';
import { Button, Chips, Field, Input, Modal, Select, cx, toast } from './ui';
import { PRODUCTS, PROVINCES, SCHOOL_TYPES, SOURCES, STAGES, stageMeta } from '../lib/constants';
import { createOrder, typeLabel } from '../lib/deals';
import { isOpen, moneyShort } from '../lib/format';
import type { Customer, CustomerBase, CustomerType, Duplicate, Stage } from '../lib/types';
import type { NewContact } from '../lib/api';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
const digits = (s: string) => s.replace(/\D/g, '');

/** Thêm đơn nhanh từ Pipeline: chọn khách cũ, hoặc tạo khách mới kèm đơn. */
export function NewOrderModal({ onClose, defaultStage = 'lead' }: { onClose: () => void; defaultStage?: Stage }) {
  const { api, me, isAdmin, profiles, customers, reload } = useStore();
  const [mode, setMode] = useState<'old' | 'new'>('old');
  const [busy, setBusy] = useState(false);

  // --- khách cũ
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Customer | null>(null);
  const matches = useMemo(() => {
    const t = norm(q.trim()), d = digits(q);
    const list = !t ? [...customers].sort((a, b) => b.updated_at.localeCompare(a.updated_at)) : customers.filter((c) =>
      norm(c.school_name).includes(t) || norm(c.code).includes(t)
      || (d.length >= 3 && c.contacts.some((x) => digits(x.phone).includes(d))));
    return list.slice(0, 8);
  }, [q, customers]);

  // --- khách mới
  const [type, setType] = useState<CustomerType>('school');
  const [name, setName] = useState('');
  const [ct, setCt] = useState<NewContact>({ name: '', role: '', email: '', phone: '', zalo: '' });
  const [cust, setCust] = useState({ school_type: 'Công lập', province: 'Hà Nội', address: '', source: 'Facebook', owner_id: me!.id as string | null });
  const [dups, setDups] = useState<Duplicate[]>([]);
  useEffect(() => {
    if (mode !== 'new' || !name.trim()) { setDups([]); return; }
    const t = setTimeout(() => api.findDuplicates(name).then(setDups).catch(() => setDups([])), 400);
    return () => clearTimeout(t);
  }, [name, mode, api]);

  // --- đơn hàng
  const [o, setO] = useState({ amount: '', products: [] as string[], stage: defaultStage, note: '' });

  const pick = (c: Customer) => { setPicked(c); setO((x) => ({ ...x, products: x.products.length ? x.products : c.interests })); };
  const chooseExisting = (code: string) => {
    const c = customers.find((x) => x.code === code);
    if (c) { setMode('old'); pick(c); }
  };

  const save = async () => {
    const amount = Number(o.amount) || 0;
    if (amount < 0) return toast.err('Giá trị đơn không hợp lệ');
    if (o.stage === 'won' && !amount) return toast.err('Đơn đã chốt cần có giá trị');
    if (mode === 'old' && !picked) return toast.err('Hãy chọn khách hàng cho đơn này');
    if (mode === 'new' && !name.trim()) return toast.err(type === 'school' ? 'Vui lòng nhập tên trường' : 'Vui lòng nhập họ tên khách hàng');
    setBusy(true);
    try {
      let c = picked;
      if (mode === 'new') {
        const data: CustomerBase = {
          customer_type: type, school_name: name.trim(), school_type: type === 'school' ? cust.school_type : '',
          province: cust.province, district: '', address: cust.address.trim(), website: '', fanpage: '', student_count: null,
          source: cust.source, lifecycle: 'never', interests: o.products, tags: [],
          owner_id: isAdmin ? cust.owner_id : me!.id,
        };
        const contact: NewContact = type === 'school' ? { ...ct, zalo: ct.phone }
          : { ...ct, name: data.school_name, role: 'Khách lẻ', zalo: ct.phone };
        c = await api.createCustomer(data, contact);
      }
      const created = await createOrder(api, me!.id, c!, { amount, products: o.products, note: o.note, stage: o.stage });
      toast.ok(mode === 'new' ? `Đã tạo khách ${c!.code} kèm đơn ${created.code}` : `Đã thêm đơn ${created.code} cho ${c!.school_name}`);
      await reload();
      onClose();
    } catch (e) { toast.err(e); } finally { setBusy(false); }
  };

  const opt = (arr: string[]) => arr.map((x) => ({ value: x, label: x }));
  const isSchool = type === 'school';

  return (
    <Modal wide title="Thêm đơn hàng mới" onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Huỷ</Button>
        <Button onClick={save} disabled={busy}>{busy ? 'Đang lưu…' : mode === 'new' ? 'Tạo khách & đơn' : 'Thêm đơn'}</Button></>}>
      <div className="seg" style={{ marginTop: 0 }}>
        <button type="button" className={cx(mode === 'old' && 'on')} onClick={() => setMode('old')}>Khách cũ</button>
        <button type="button" className={cx(mode === 'new' && 'on')} onClick={() => setMode('new')}>Khách mới</button>
      </div>

      {mode === 'old' ? (
        picked ? (
          <div className="list-item picked">
            <Icon name={picked.customer_type === 'individual' ? 'user' : 'building'} />
            <div className="grow">
              <b>{picked.school_name}</b>
              <div className="small muted">{picked.code} · {typeLabel(picked)}{picked.province ? ` · ${picked.province}` : ''}
                {' · '}{picked.orders.filter(isOpen).length} đơn đang theo đuổi</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPicked(null)}>Đổi khách</Button>
          </div>
        ) : (
          <>
            <Field label="Tìm khách hàng (tên, mã KH hoặc số điện thoại)">
              <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="VD: Nguyễn Du, KH-0012, 0912…" />
            </Field>
            <div className="pick-list">
              {matches.map((c) => {
                const phone = c.contacts.find((x) => x.phone)?.phone;
                return (
                  <button type="button" key={c.id} className="list-item" onClick={() => pick(c)}>
                    <Icon name={c.customer_type === 'individual' ? 'user' : 'building'} className="muted" />
                    <div className="grow">
                      <b className="truncate" style={{ display: 'block' }}>{c.school_name}</b>
                      <span className="small muted">{c.code} · {typeLabel(c)}{phone ? ` · ${phone}` : ''}</span>
                    </div>
                  </button>
                );
              })}
              {matches.length === 0 && (
                <div className="small muted" style={{ padding: 8 }}>
                  Không tìm thấy khách nào. <a href="#" onClick={(e) => { e.preventDefault(); setName(q); setMode('new'); }}>Tạo khách mới “{q}” →</a>
                </div>
              )}
            </div>
          </>
        )
      ) : (
        <div className="form-grid">
          <div className="span2 type-pick">
            <button type="button" className={'type-card' + (isSchool ? ' on' : '')} onClick={() => setType('school')}>
              <Icon name="building" size={20} /><div><b>Trường học / Tổ chức</b><span>Trường, trung tâm, đại học…</span></div></button>
            <button type="button" className={'type-card' + (!isSchool ? ' on' : '')} onClick={() => setType('individual')}>
              <Icon name="user" size={20} /><div><b>Khách lẻ</b><span>Cá nhân, phụ huynh</span></div></button>
          </div>
          <Field label={isSchool ? 'Tên trường *' : 'Họ tên khách hàng *'} span2>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={isSchool ? 'VD: THCS Nguyễn Du' : 'VD: Anh Nguyễn Văn Hải'} />
          </Field>
          {dups.length > 0 && (
            <div className="warn span2">
              ⚠️ Có thể đã có khách này:{' '}
              {dups.map((d, i) => (
                <span key={d.code}>{i > 0 && '; '}{d.school_name} ({d.code} – {d.owner_name})
                  {customers.some((x) => x.code === d.code) && <> — <a href="#" onClick={(e) => { e.preventDefault(); chooseExisting(d.code); }}>dùng khách này</a></>}
                </span>
              ))}
            </div>
          )}
          {isSchool && <>
            <Field label="Người liên hệ"><Input value={ct.name} onChange={(e) => setCt({ ...ct, name: e.target.value })} /></Field>
            <Field label="Chức vụ"><Input value={ct.role} onChange={(e) => setCt({ ...ct, role: e.target.value })} /></Field>
          </>}
          <Field label="Điện thoại"><Input value={ct.phone} onChange={(e) => setCt({ ...ct, phone: e.target.value })} placeholder="09xx xxx xxx" /></Field>
          <Field label="Email"><Input type="email" value={ct.email} onChange={(e) => setCt({ ...ct, email: e.target.value })} /></Field>
          {isSchool && <Field label="Loại trường"><Select value={cust.school_type} onChange={(e) => setCust({ ...cust, school_type: e.target.value })} options={opt(SCHOOL_TYPES)} /></Field>}
          <Field label="Tỉnh / Thành"><Select value={cust.province} onChange={(e) => setCust({ ...cust, province: e.target.value })} options={opt(PROVINCES)} /></Field>
          <Field label="Địa chỉ" span2={isSchool}><Input value={cust.address} onChange={(e) => setCust({ ...cust, address: e.target.value })} /></Field>
          <Field label="Nguồn"><Select value={cust.source} onChange={(e) => setCust({ ...cust, source: e.target.value })} options={opt(SOURCES)} /></Field>
          {isAdmin && (
            <Field label="Nhân viên phụ trách">
              <Select value={cust.owner_id ?? ''} onChange={(e) => setCust({ ...cust, owner_id: e.target.value || null })}
                options={[{ value: '', label: '— Chưa gán —' }, ...profiles.filter((p) => p.is_active).map((p) => ({ value: p.id, label: `${p.full_name || p.email}${p.role === 'admin' ? ' (QL)' : ''}` }))]} />
            </Field>
          )}
          <div className="small muted span2">Thông tin khác (website, số học sinh, tags…) bổ sung sau trong chi tiết khách hàng.</div>
        </div>
      )}

      <div className="box" style={{ marginTop: 14, marginBottom: 0 }}>
        <div className="box-title"><Icon name="cart" /> Thông tin đơn hàng</div>
        <div className="form-grid">
          <Field label="Giá trị (₫)"><Input type="number" min={0} step={1000000} value={o.amount} onChange={(e) => setO({ ...o, amount: e.target.value })} placeholder="Dự kiến, sửa lại sau được" /></Field>
          <Field label="Giai đoạn"><Select value={o.stage} onChange={(e) => setO({ ...o, stage: e.target.value as Stage })} options={STAGES.map((s) => ({ value: s.key, label: s.label }))} /></Field>
          <Field label="Sản phẩm" span2><Chips options={PRODUCTS} value={o.products} onChange={(v) => setO({ ...o, products: v })} /></Field>
          <Field label="Ghi chú đơn" span2><Input value={o.note} onChange={(e) => setO({ ...o, note: e.target.value })} placeholder="VD: 20 bộ VEX IQ cho CLB robot" /></Field>
        </div>
        <div className="small muted" style={{ marginTop: 8 }}>
          Đơn sẽ nằm ở cột “{stageMeta(o.stage).label}” trên Pipeline{o.amount ? ` · ${moneyShort(Number(o.amount))}` : ''}.
        </div>
      </div>
    </Modal>
  );
}
