import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { Icon } from '../components/Icon';
import { Button, Chips, Field, Input, Modal, Select, toast } from '../components/ui';
import { LIFECYCLES, PRODUCTS, PROVINCES, SCHOOL_TYPES, SOURCES } from '../lib/constants';
import { newOrder } from '../lib/deals';
import type { Customer, CustomerBase, CustomerType, Duplicate } from '../lib/types';
import type { NewContact } from '../lib/api';

const EMPTY: CustomerBase = {
  customer_type: 'school', school_name: '', school_type: 'Công lập', province: 'Hà Nội', district: '', address: '',
  website: '', fanpage: '', student_count: null, source: 'Facebook', lifecycle: 'never', interests: [], tags: [], owner_id: null,
};

export function CustomerForm({ customer, onClose, onSaved }: { customer?: Customer; onClose: () => void; onSaved?: (c: Customer) => void }) {
  const { api, me, isAdmin, profiles, reload } = useStore();
  const [f, setF] = useState<CustomerBase>(() => {
    if (!customer) return { ...EMPTY, owner_id: me!.id };
    const { customer_type, school_name, school_type, province, district, address, website, fanpage, student_count, source,
      lifecycle, interests, tags, owner_id } = customer;
    return { customer_type, school_name, school_type, province, district, address, website, fanpage, student_count, source,
      lifecycle, interests, tags, owner_id };
  });
  const [ct, setCt] = useState<NewContact>({ name: '', role: '', email: '', phone: '', zalo: '' });
  const [tagText, setTagText] = useState((customer?.tags ?? []).join(', '));
  const [deal, setDeal] = useState({ create: true, amount: '' });
  const [dups, setDups] = useState<Duplicate[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<CustomerBase>) => setF((x) => ({ ...x, ...p }));
  const isSchool = f.customer_type === 'school';

  // Cảnh báo trùng (kể cả khách do nhân viên khác phụ trách)
  useEffect(() => {
    if (customer) return;
    const t = setTimeout(() => {
      api.findDuplicates(f.school_name).then(setDups).catch(() => setDups([]));
    }, 400);
    return () => clearTimeout(t);
  }, [f.school_name, customer, api]);

  const save = async () => {
    if (!f.school_name.trim()) return toast.err(isSchool ? 'Vui lòng nhập tên trường' : 'Vui lòng nhập họ tên khách hàng');
    setBusy(true);
    const data: CustomerBase = {
      ...f, school_name: f.school_name.trim(),
      tags: tagText.split(',').map((t) => t.trim()).filter(Boolean),
      owner_id: isAdmin ? f.owner_id : me!.id,
    };
    try {
      if (customer) {
        const patch: Partial<CustomerBase> = { ...data };
        if (!isAdmin) delete patch.owner_id;
        await api.updateCustomer(customer.id, patch);
        toast.ok('Đã lưu thay đổi');
      } else {
        // Khách lẻ: chính họ là người liên hệ
        const contact: NewContact = isSchool ? ct : { ...ct, name: data.school_name, role: 'Khách lẻ', zalo: ct.zalo || ct.phone };
        const c = await api.createCustomer(data, contact);
        if (deal.create) {
          await api.addChild('orders', newOrder(c.id, me!.id, { amount: Number(deal.amount) || 0, products: data.interests }));
        }
        toast.ok(`Đã thêm ${c.code}`);
        onSaved?.(c);
      }
      await reload();
      onClose();
    } catch (e) { toast.err(e); } finally { setBusy(false); }
  };

  const opt = (arr: string[]) => arr.map((x) => ({ value: x, label: x }));
  const provinces = opt(PROVINCES.includes(f.province) || !f.province ? PROVINCES : [f.province, ...PROVINCES]);
  const TypeBtn = ({ type, icon, title, desc }: { type: CustomerType; icon: string; title: string; desc: string }) => (
    <button type="button" className={'type-card' + (f.customer_type === type ? ' on' : '')} onClick={() => set({ customer_type: type })}>
      <Icon name={icon} size={20} /><div><b>{title}</b><span>{desc}</span></div>
    </button>
  );

  return (
    <Modal wide title={customer ? `Sửa ${customer.code}` : 'Thêm khách hàng mới'} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Huỷ</Button><Button onClick={save} disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu'}</Button></>}>
      <div className="form-grid">
        <div className="span2 type-pick">
          <TypeBtn type="school" icon="building" title="Trường học / Tổ chức" desc="Trường, trung tâm, đại học…" />
          <TypeBtn type="individual" icon="user" title="Khách lẻ" desc="Cá nhân, phụ huynh — chỉ cần tên & liên hệ" />
        </div>

        <Field label={isSchool ? 'Tên trường *' : 'Họ tên khách hàng *'} span2>
          <Input autoFocus value={f.school_name} onChange={(e) => set({ school_name: e.target.value })} placeholder={isSchool ? 'VD: THCS Nguyễn Du' : 'VD: Anh Nguyễn Văn Hải'} />
        </Field>
        {dups.length > 0 && (
          <div className="warn span2">
            ⚠️ Có thể trùng với: {dups.map((d) => `${d.school_name} (${d.code} – ${d.owner_name})`).join('; ')}
          </div>
        )}

        {isSchool ? (
          <>
            <Field label="Loại trường"><Select value={f.school_type} onChange={(e) => set({ school_type: e.target.value })} options={opt(SCHOOL_TYPES)} /></Field>
            <Field label="Tỉnh / Thành"><Select value={f.province} onChange={(e) => set({ province: e.target.value })} options={provinces} /></Field>
            <Field label="Quận / Huyện"><Input value={f.district} onChange={(e) => set({ district: e.target.value })} /></Field>
            <Field label="Số học sinh"><Input type="number" min={0} value={f.student_count ?? ''} onChange={(e) => set({ student_count: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Địa chỉ" span2><Input value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
            <Field label="Website"><Input value={f.website} onChange={(e) => set({ website: e.target.value })} /></Field>
            <Field label="Fanpage"><Input value={f.fanpage} onChange={(e) => set({ fanpage: e.target.value })} /></Field>
            {!customer && (
              <>
                <div className="form-section">Người liên hệ chính</div>
                <Field label="Họ tên"><Input value={ct.name} onChange={(e) => setCt({ ...ct, name: e.target.value })} /></Field>
                <Field label="Chức vụ"><Input value={ct.role} onChange={(e) => setCt({ ...ct, role: e.target.value })} /></Field>
                <Field label="Điện thoại"><Input value={ct.phone} onChange={(e) => setCt({ ...ct, phone: e.target.value, zalo: e.target.value })} /></Field>
                <Field label="Email"><Input type="email" value={ct.email} onChange={(e) => setCt({ ...ct, email: e.target.value })} /></Field>
              </>
            )}
          </>
        ) : (
          <>
            {!customer && (
              <>
                <Field label="Điện thoại"><Input value={ct.phone} onChange={(e) => setCt({ ...ct, phone: e.target.value, zalo: e.target.value })} placeholder="09xx xxx xxx" /></Field>
                <Field label="Email"><Input type="email" value={ct.email} onChange={(e) => setCt({ ...ct, email: e.target.value })} /></Field>
              </>
            )}
            <Field label="Địa chỉ"><Input value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
            <Field label="Tỉnh / Thành"><Select value={f.province} onChange={(e) => set({ province: e.target.value })} options={provinces} /></Field>
          </>
        )}

        <div className="form-section">Bán hàng</div>
        <Field label="Nhân viên phụ trách">
          {isAdmin ? (
            <Select value={f.owner_id ?? ''} onChange={(e) => set({ owner_id: e.target.value || null })}
              options={[{ value: '', label: '— Chưa gán —' }, ...profiles.filter((p) => p.is_active).map((p) => ({ value: p.id, label: `${p.full_name || p.email}${p.role === 'admin' ? ' (QL)' : ''}` }))]} />
          ) : (
            <Input disabled value={me?.full_name ?? ''} title="Chỉ quản lý mới được chuyển giao khách hàng" />
          )}
        </Field>
        <Field label="Nguồn"><Select value={f.source} onChange={(e) => set({ source: e.target.value })} options={opt(SOURCES)} /></Field>
        {customer && <Field label="Vòng đời (Lifecycle)"><Select value={f.lifecycle} onChange={(e) => set({ lifecycle: e.target.value as CustomerBase['lifecycle'] })} options={LIFECYCLES.map((s) => ({ value: s.key, label: s.label }))} /></Field>}
        <Field label="Tags (cách nhau bởi dấu phẩy)" span2={!customer}><Input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Tiềm năng, STEM" /></Field>
        <Field label="Sản phẩm quan tâm" span2><Chips options={PRODUCTS} value={f.interests} onChange={(v) => set({ interests: v })} /></Field>

        {!customer && (
          <div className="span2 box" style={{ marginBottom: 0 }}>
            <label className="row gap8" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={deal.create} onChange={(e) => setDeal({ ...deal, create: e.target.checked })} />
              <b>Tạo luôn 1 đơn hàng (cơ hội) ở cột "Lead" trên Pipeline</b>
            </label>
            {deal.create && (
              <div style={{ marginTop: 10, maxWidth: 320 }}>
                <Field label="Giá trị dự kiến (₫) — có thể để trống"><Input type="number" min={0} step={1000000} value={deal.amount} onChange={(e) => setDeal({ ...deal, amount: e.target.value })} /></Field>
              </div>
            )}
            <div className="small muted" style={{ marginTop: 6 }}>Khi kéo đơn sang "Chốt đơn", đơn tự được tính vào doanh thu và số đơn của khách.</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
