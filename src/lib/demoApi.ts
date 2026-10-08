import type { Api } from './api';
import type { ChildTable, Customer, Profile, Stage, Lifecycle } from './types';
import { addDays, norm, toDateStr, uid } from './format';

/* =====================================================================
 *  CHẾ ĐỘ DEMO — chạy không cần server/database. Dữ liệu lưu trong localStorage
 *  của trình duyệt và mô phỏng đúng luật phân quyền của database.
 * ===================================================================== */

const KEY = 'kc-crm-demo-v3';
const SESSION = 'kc-crm-demo-session';

interface DB { profiles: Profile[]; customers: Customer[]; seq: number; oseq: number }

const ADMIN = 'u-admin', AN = 'u-an', BINH = 'u-binh', CUONG = 'u-cuong';

function seed(): DB {
  const now = new Date();
  const iso = (d: number) => addDays(now, -d).toISOString();
  const day = (d: number) => toDateStr(addDays(now, d));
  const profiles: Profile[] = [
    { id: ADMIN, email: 'quanly@kc.vn', full_name: 'Easton Hoàng', role: 'admin', is_active: true, created_at: iso(400) },
    { id: AN, email: 'an@kc.vn', full_name: 'Nguyễn Văn An', role: 'staff', is_active: true, created_at: iso(300) },
    { id: BINH, email: 'binh@kc.vn', full_name: 'Trần Thị Bình', role: 'staff', is_active: true, created_at: iso(200) },
    { id: CUONG, email: 'cuong@kc.vn', full_name: 'Lê Minh Cường', role: 'staff', is_active: false, created_at: iso(1) },
  ];

  let seq = 1, oseq = 1;
  const ocode = () => 'DH-' + String(oseq++).padStart(6, '0');
  type S = {
    name: string; type: string; prov: string; dist: string; owner: string; src: string; stage: Stage; life: Lifecycle;
    ev: number; students?: number; interests: string[]; tags?: string[]; age: number;
    contact: [string, string, string, string];
    orders?: [number, number, string[]][]; // [daysAgo, amount, products]
    fu?: [number, string, 'low' | 'medium' | 'high' | 'urgent'][]; // [dayOffset, content, priority]
    acts?: [number, string, string][]; notes?: string[];
  };
  const rows: S[] = [
    { name: 'THPT Chuyên Hà Nội – Amsterdam', type: 'Công lập', prov: 'Hà Nội', dist: 'Cầu Giấy', owner: AN, src: 'Hội thảo', stage: 'negotiating', life: 'first', ev: 180e6, students: 2100, interests: ['VEX V5', 'VEX IQ'], tags: ['Tiềm năng'], age: 30,
      contact: ['Cô Lan', 'Tổ trưởng Tin học', 'lan@ams.edu.vn', '0912345678'], orders: [[60, 45e6, ['VEX IQ']]],
      fu: [[1, 'Gửi báo giá bổ sung VEX V5', 'high']], acts: [[10, 'call', 'Gọi giới thiệu chương trình VEX V5'], [3, 'demo', 'Demo robot tại trường']], notes: ['Trường muốn lập đội thi VEX V5 cho năm học mới'] },
    { name: 'Trường Tiểu học Ngôi Sao', type: 'Tư thục', prov: 'Hà Nội', dist: 'Thanh Xuân', owner: AN, src: 'Facebook', stage: 'consulted', life: 'never', ev: 60e6, students: 900, interests: ['VEX 123', 'VEX GO'], tags: ['STEM'], age: 15,
      contact: ['Thầy Minh', 'Hiệu trưởng', 'minh@ngoisao.edu.vn', '0987654321'], fu: [[-2, 'Gọi lại chốt lịch workshop', 'urgent']], acts: [[8, 'zalo', 'Gửi tài liệu VEX GO qua Zalo']] },
    { name: 'Trường Quốc tế Sao Việt', type: 'Quốc tế', prov: 'TP.HCM', dist: 'Quận 7', owner: BINH, src: 'Giới thiệu', stage: 'won', life: 'vip', ev: 0, students: 1500, interests: ['VEX V5', 'VEX AIM'], tags: ['VIP', 'Quốc tế'], age: 240,
      contact: ['Chị Hương', 'Trưởng phòng IT', 'huong@saoviet.edu.vn', '0903111222'],
      orders: [[180, 120e6, ['VEX V5']], [90, 220e6, ['VEX V5', 'VEX AIM']], [20, 180e6, ['VEX AIM']], [5, 95e6, ['Máy in 3D']]],
      fu: [[0, 'Xác nhận lịch giao hàng đợt 4', 'high']], acts: [[15, 'contract', 'Ký hợp đồng khung năm học'], [3, 'delivery', 'Giao 20 bộ VEX AIM']] },
    { name: 'THCS Nguyễn Du', type: 'Công lập', prov: 'Đà Nẵng', dist: 'Hải Châu', owner: BINH, src: 'Website', stage: 'lead', life: 'never', ev: 40e6, interests: ['VEX IQ'], age: 2,
      contact: ['Thầy Hùng', 'Phó hiệu trưởng', 'hung@nguyendu.edu.vn', '0935222333'], fu: [[7, 'Gọi giới thiệu lần đầu', 'medium']] },
    { name: 'THPT Lê Quý Đôn', type: 'Công lập', prov: 'TP.HCM', dist: 'Quận 3', owner: AN, src: 'Hội thảo', stage: 'won', life: 'returning', ev: 0, students: 1800, interests: ['VEX V5'], tags: ['Workshop'], age: 365,
      contact: ['Anh Tuấn', 'Phó hiệu trưởng', 'tuan@lqd.edu.vn', '0909888777'], orders: [[300, 32e6, ['VEX IQ']], [120, 58e6, ['VEX V5']], [20, 90e6, ['VEX V5']]] },
    { name: 'Trường Tiểu học Kim Đồng', type: 'Công lập', prov: 'Hải Phòng', dist: 'Lê Chân', owner: BINH, src: 'Gọi điện', stage: 'contacted', life: 'never', ev: 35e6, interests: ['KCBot'], tags: ['Tiềm năng'], age: 6,
      contact: ['Cô Hạnh', 'Hiệu trưởng', 'hanh@kimdong.edu.vn', '0912000111'], fu: [[-1, 'Gửi brochure KCBot', 'medium']] },
    { name: 'Trung tâm STEM Sáng Tạo', type: 'Trung tâm', prov: 'Bình Dương', dist: 'Thủ Dầu Một', owner: AN, src: 'Facebook', stage: 'quoted', life: 'first', ev: 75e6, interests: ['Máy in 3D', 'Laser'], tags: ['STEM'], age: 80,
      contact: ['Anh Phong', 'Giám đốc', 'phong@sangtao.vn', '0977333444'], orders: [[40, 28e6, ['Máy in 3D']]], fu: [[4, 'Follow-up báo giá máy Laser', 'medium']] },
    { name: 'Đại học Bách khoa Hà Nội', type: 'Đại học', prov: 'Hà Nội', dist: 'Hai Bà Trưng', owner: BINH, src: 'Email', stage: 'paused', life: 'dormant', ev: 250e6, interests: ['CNC'], age: 700,
      contact: ['TS. Bình', 'Trưởng khoa', 'binh@hust.edu.vn', '0904555666'], orders: [[500, 250e6, ['CNC']]] },
    { name: 'THCS Trần Phú', type: 'Công lập', prov: 'Nghệ An', dist: 'TP. Vinh', owner: AN, src: 'Giới thiệu', stage: 'pending', life: 'first', ev: 55e6, interests: ['VEX IQ', 'VEX GO'], age: 220,
      contact: ['Cô Mai', 'Tổ trưởng KHTN', 'mai@tranphu.edu.vn', '0915777888'], orders: [[200, 30e6, ['VEX GO']], [50, 55e6, ['VEX IQ']]], fu: [[5, 'Chờ BGH duyệt ngân sách', 'low']] },
    { name: 'Trường Song ngữ Olympia', type: 'Tư thục', prov: 'Hà Nội', dist: 'Nam Từ Liêm', owner: BINH, src: 'Facebook', stage: 'lost', life: 'churned', ev: 0, interests: ['VEX V5'], age: 450,
      contact: ['Mr. David', 'STEM Coordinator', 'david@olympia.edu.vn', '0988999000'], orders: [[420, 48e6, ['VEX V5']]] },
    { name: 'THPT Phan Châu Trinh', type: 'Công lập', prov: 'Đà Nẵng', dist: 'Hải Châu', owner: AN, src: 'Website', stage: 'lead', life: 'never', ev: 50e6, interests: ['VEX IQ'], age: 1,
      contact: ['Thầy Quang', 'Giáo viên Tin', 'quang@pct.edu.vn', '0905123123'], fu: [[0, 'Gọi giới thiệu chương trình', 'high']] },
    { name: 'Trường Tiểu học Victoria', type: 'Tư thục', prov: 'TP.HCM', dist: 'Thủ Đức', owner: ADMIN, src: 'Hội thảo', stage: 'consulted', life: 'never', ev: 90e6, interests: ['VEX 123', 'VEX GO'], age: 12,
      contact: ['Cô Thảo', 'Phó hiệu trưởng', 'thao@victoria.edu.vn', '0933456456'], fu: [[2, 'Hẹn demo VEX 123', 'medium']] },
    { name: 'Anh Trần Quốc Hải', type: 'Khách lẻ', prov: 'Hà Nội', dist: '', owner: AN, src: 'Facebook', stage: 'quoted', life: 'first', ev: 18e6, interests: ['VEX IQ'], age: 25,
      contact: ['Anh Trần Quốc Hải', 'Khách lẻ', 'hai.tran@gmail.com', '0913222444'], orders: [[12, 9.5e6, ['VEX GO']]] },
    { name: 'Chị Phạm Thu Trang', type: 'Khách lẻ', prov: 'TP.HCM', dist: '', owner: BINH, src: 'Giới thiệu', stage: 'lead', life: 'never', ev: 12e6, interests: ['VEX 123'], age: 3,
      contact: ['Chị Phạm Thu Trang', 'Khách lẻ', 'trang.pham@gmail.com', '0938555111'], fu: [[1, 'Gọi tư vấn bộ VEX 123 cho bé', 'medium']] },
  ];

  const customers: Customer[] = rows.map((r) => {
    const id = uid();
    const created = iso(r.age);
    return {
      id, code: 'KH-' + String(seq++).padStart(6, '0'),
      customer_type: r.type === 'Khách lẻ' ? 'individual' : 'school',
      school_name: r.name, school_type: r.type === 'Khách lẻ' ? 'Khác' : r.type, province: r.prov, district: r.dist, address: '', website: '', fanpage: '',
      student_count: r.students ?? null, source: r.src, lifecycle: r.life,
      interests: r.interests, tags: r.tags ?? [], owner_id: r.owner, created_by: r.owner, created_at: created, updated_at: created,
      contacts: [{ id: uid(), customer_id: id, name: r.contact[0], role: r.contact[1], email: r.contact[2], phone: r.contact[3], zalo: r.contact[3], is_primary: true, created_at: created }],
      activities: (r.acts ?? []).map(([d, type, content]) => ({ id: uid(), customer_id: id, type, content, created_by: r.owner, created_at: iso(d) })),
      notes: (r.notes ?? []).map((text) => ({ id: uid(), customer_id: id, text, author_id: r.owner, created_at: iso(5) })),
      follow_ups: (r.fu ?? []).map(([d, content, priority]) => ({ id: uid(), customer_id: id, due_date: day(d), content, priority, done: false, assignee_id: r.owner, created_at: iso(3) })),
      documents: [],
      orders: [
        // Đơn đã chốt: đơn cũ đã hoàn tất; đơn gần đây còn nợ / thiếu hoá đơn, giấy tờ
        ...(r.orders ?? []).map(([d, amount, products]) => ({
          id: uid(), customer_id: id, code: ocode(), order_date: day(-d), amount, products, stage: 'won' as Stage,
          paid_amount: d > 60 ? amount : d > 15 ? Math.round(amount * 0.5) : 0, invoice_issued: d > 10, docs_received: d > 30,
          note: '', created_by: r.owner, created_at: iso(d),
        })),
        // Cơ hội đang theo đuổi (hoặc tạm dừng / thất bại)
        ...(r.stage !== 'won' && (r.ev > 0 || r.stage === 'lost') ? [{
          id: uid(), customer_id: id, code: ocode(), order_date: day(-Math.min(r.age, 20)), amount: r.ev, products: r.interests, stage: r.stage,
          paid_amount: 0, invoice_issued: false, docs_received: false, note: '', created_by: r.owner, created_at: iso(Math.min(r.age, 20)),
        }] : []),
      ],
    };
  });
  return { profiles, customers, seq, oseq };
}

const demoFiles = new Map<string, File>();

export function createDemoApi(): Api {
  let db: DB;
  try { db = JSON.parse(localStorage.getItem(KEY) || 'null') ?? seed(); } catch { db = seed(); }
  const listeners = new Set<() => void>();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore */ } };
  save();

  const meId = () => { try { return localStorage.getItem(SESSION); } catch { return null; } };
  const me = () => db.profiles.find((p) => p.id === meId()) ?? null;
  const need = () => { const m = me(); if (!m) throw new Error('Chưa đăng nhập'); return m; };
  const isAdmin = () => { const m = me(); return !!m && m.role === 'admin' && m.is_active; };
  const canSee = (c: Customer) => { const m = me(); return !!m && m.is_active && (isAdmin() || c.owner_id === m.id); };
  const findCust = (id: string) => {
    const c = db.customers.find((x) => x.id === id);
    if (!c || !canSee(c)) throw new Error('Bạn không có quyền thực hiện thao tác này');
    return c;
  };
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  const delay = () => new Promise((r) => setTimeout(r, 60));
  const emit = () => listeners.forEach((l) => l());

  const findChild = (table: ChildTable, id: string) => {
    for (const c of db.customers) {
      const arr = c[table] as { id: string }[];
      const i = arr.findIndex((r) => r.id === id);
      if (i >= 0) { if (!canSee(c)) break; return { c, arr, i }; }
    }
    throw new Error('Bạn không có quyền thực hiện thao tác này');
  };

  return {
    mode: 'demo',
    demoAccounts: [
      { email: 'quanly@kc.vn', label: 'Quản lý tổng' },
      { email: 'an@kc.vn', label: 'Nhân viên An' },
      { email: 'binh@kc.vn', label: 'Nhân viên Bình' },
    ],

    async currentProfile() { await delay(); return me() ? clone(me()) : null; },
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },

    async signIn(email) {
      await delay();
      const p = db.profiles.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!p) throw new Error('Sai email hoặc mật khẩu (demo: dùng các nút đăng nhập nhanh)');
      localStorage.setItem(SESSION, p.id); emit();
    },
    async signUp(email, _pw, fullName) {
      await delay();
      if (db.profiles.some((x) => x.email === email)) throw new Error('Email này đã được đăng ký');
      const p: Profile = { id: uid(), email, full_name: fullName || email.split('@')[0], role: 'staff', is_active: false, created_at: new Date().toISOString() };
      db.profiles.push(p); save(); localStorage.setItem(SESSION, p.id); emit();
      return false;
    },
    async signOut() { localStorage.removeItem(SESSION); emit(); },
    async changePassword() { await delay(); /* demo: không có mật khẩu thật */ },

    async listProfiles() { await delay(); need(); return clone(db.profiles); },
    async updateProfile(id, patch) {
      await delay();
      const m = need();
      const p = db.profiles.find((x) => x.id === id);
      if (!p) throw new Error('Không tìm thấy tài khoản');
      if (!isAdmin()) {
        if (id !== m.id || patch.role !== undefined || patch.is_active !== undefined)
          throw new Error('Chỉ quản lý mới được đổi vai trò / trạng thái tài khoản');
      }
      if (id === m.id && p.role === 'admin' && (patch.role === 'staff' || patch.is_active === false))
        throw new Error('Không thể tự hạ quyền hoặc tự khoá tài khoản quản lý của chính mình');
      Object.assign(p, patch); save();
      if (id === m.id) emit();
    },

    async resetPassword() { await delay(); if (!isAdmin()) throw new Error('Chỉ quản lý mới được thực hiện thao tác này'); },

    async listCustomers() {
      await delay();
      return clone(db.customers.filter(canSee).sort((a, b) => b.created_at.localeCompare(a.created_at)));
    },
    async createCustomer(data, contact) {
      await delay();
      const m = need();
      if (!m.is_active) throw new Error('Tài khoản chưa được duyệt');
      const owner = isAdmin() ? data.owner_id : m.id;
      const id = uid(); const now = new Date().toISOString();
      const c: Customer = {
        ...data, owner_id: owner, id, code: 'KH-' + String(db.seq++).padStart(6, '0'), created_by: m.id, created_at: now, updated_at: now,
        contacts: contact && contact.name.trim() ? [{ ...contact, id: uid(), customer_id: id, is_primary: true, created_at: now }] : [],
        activities: [], notes: [], follow_ups: [], orders: [], documents: [],
      };
      db.customers.push(c); save();
      return clone(c);
    },
    async updateCustomer(id, patch) {
      await delay();
      const c = findCust(id);
      if (!isAdmin() && patch.owner_id !== undefined && patch.owner_id !== c.owner_id)
        throw new Error('Chỉ quản lý mới được chuyển giao khách hàng');
      Object.assign(c, patch, { updated_at: new Date().toISOString() }); save();
    },
    async updateCustomers(ids, patch) {
      for (const id of ids) await this.updateCustomer(id, patch);
    },
    async deleteCustomers(ids) {
      await delay();
      if (!isAdmin()) throw new Error('Chỉ quản lý mới được xoá khách hàng');
      db.customers = db.customers.filter((c) => !ids.includes(c.id)); save();
    },

    async addChild(table, row) {
      await delay();
      const c = findCust(row.customer_id);
      const full: Record<string, unknown> = { ...row, id: uid(), created_at: new Date().toISOString() };
      if (table === 'orders' && !String(full.code ?? '').trim()) full.code = 'DH-' + String(db.oseq++).padStart(6, '0');
      (c[table] as unknown[]).push(full); save();
      return clone(full) as never;
    },
    async updateChild(table, id, patch) {
      await delay();
      const { arr, i } = findChild(table, id);
      Object.assign(arr[i], patch); save();
    },
    async deleteChild(table, id) {
      await delay();
      const { arr, i } = findChild(table, id);
      arr.splice(i, 1); save();
    },

    // Demo: tệp chỉ giữ trong bộ nhớ của tab này (tải lại trang là mất nội dung tệp)
    async uploadDocument(customerId, file, meta) {
      await delay();
      const c = findCust(customerId);
      const d = { ...meta, id: uid(), customer_id: customerId, name: file.name, mime: file.type, size: file.size, uploaded_by: meId(), created_at: new Date().toISOString() };
      demoFiles.set(d.id, file);
      c.documents.push(d); save();
      return clone(d);
    },
    downloadDocument(doc) {
      const f = demoFiles.get(doc.id);
      if (!f) { alert('Chế độ demo: nội dung tệp không được lưu sau khi tải lại trang.'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(f); a.download = doc.name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },

    async findDuplicates(name) {
      const q = norm(name.trim());
      if (q.length < 3) return [];
      return db.customers.filter((c) => norm(c.school_name).includes(q)).slice(0, 5).map((c) => ({
        code: c.code, school_name: c.school_name,
        owner_name: db.profiles.find((p) => p.id === c.owner_id)?.full_name ?? '—',
      }));
    },

    resetDemo() { db = seed(); save(); emit(); },
  };
}
