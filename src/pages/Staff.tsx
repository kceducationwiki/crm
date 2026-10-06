import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { Avatar, Badge, Button, PageHeader, Select, toast } from '../components/ui';
import { fmtDate, moneyShort, openDeals, revenue } from '../lib/format';
import type { Profile, Role } from '../lib/types';

export function StaffPage() {
  const { profiles, customers, api, reload, me, refreshMe } = useStore();

  const rows = useMemo(() => profiles.map((p) => {
    const mine = customers.filter((c) => c.owner_id === p.id);
    return { p, total: mine.length, open: mine.reduce((n, c) => n + openDeals(c).length, 0), rev: mine.reduce((s, c) => s + revenue(c), 0) };
  }).sort((a, b) => Number(a.p.is_active) - Number(b.p.is_active) || a.p.created_at.localeCompare(b.p.created_at)), [profiles, customers]);

  const pending = profiles.filter((p) => !p.is_active).length;
  const unassigned = customers.filter((c) => !c.owner_id).length;

  const update = async (p: Profile, patch: Partial<Pick<Profile, 'role' | 'is_active'>>, msg: string) => {
    try { await api.updateProfile(p.id, patch); toast.ok(msg); await reload(); if (p.id === me?.id) await refreshMe(); }
    catch (e) { toast.err(e); }
  };

  const resetPw = async (p: Profile) => {
    const pw = prompt(`Đặt mật khẩu mới cho ${p.full_name || p.email} (tối thiểu 8 ký tự):`);
    if (pw === null) return;
    if (pw.length < 8) return toast.err('Mật khẩu tối thiểu 8 ký tự');
    try { await api.resetPassword(p.id, pw); toast.ok('Đã đặt lại mật khẩu — hãy gửi mật khẩu mới cho nhân viên'); }
    catch (e) { toast.err(e); }
  };

  const off2fa = async (p: Profile) => {
    if (!confirm(`Tắt xác thực 2 bước của ${p.full_name || p.email}? Chỉ làm khi họ mất điện thoại; nhắc họ bật lại ngay sau đó.`)) return;
    try { await api.adminDisableTwoFactor!(p.id); toast.ok('Đã tắt xác thực 2 bước'); await reload(); } catch (e) { toast.err(e); }
  };

  const signupUrl = window.location.origin + window.location.pathname;

  return (
    <>
      <PageHeader title="Nhân viên & phân quyền" subtitle="Duyệt tài khoản mới, cấp quyền quản lý, khoá tài khoản nghỉ việc." />

      <div className="stats">
        <div className="card stat"><div className="stat-top">Tài khoản</div><div className="stat-val">{profiles.length}</div><div className="stat-sub">{profiles.filter((p) => p.role === 'admin').length} quản lý</div></div>
        <div className={'card stat' + (pending ? ' stat-danger' : '')}><div className="stat-top">Chờ duyệt / đã khoá</div><div className="stat-val">{pending}</div><div className="stat-sub">tài khoản chưa hoạt động</div></div>
        <div className="card stat"><div className="stat-top">Khách chưa gán</div><div className="stat-val">{unassigned}</div><div className="stat-sub">gán trong mục Khách hàng</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nhân viên</th><th>Vai trò</th><th>Trạng thái</th><th>Khách hàng</th><th>Đơn đang mở</th><th>Doanh thu</th><th className="hide-sm">Ngày tạo</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ p, total, open, rev }) => (
                <tr key={p.id} style={{ cursor: 'default' }}>
                  <td><div className="row gap8"><Avatar name={p.full_name || p.email} /><div><b>{p.full_name || '—'}</b>{p.id === me?.id && <span className="small muted"> (bạn)</span>}{p.totp_enabled && <span className="badge tone-green" style={{ marginLeft: 6 }} title="Đã bật xác thực 2 bước">2 bước</span>}{!p.totp_enabled && p.role === 'admin' && <span className="badge tone-red" style={{ marginLeft: 6 }} title="Tài khoản quản lý nên bật xác thực 2 bước (Cài đặt)">chưa bật 2 bước</span>}<div className="small muted">{p.email}</div></div></div></td>
                  <td>
                    <Select style={{ width: 150, height: 30 }} value={p.role} disabled={p.id === me?.id}
                      onChange={(e) => update(p, { role: e.target.value as Role }, 'Đã đổi vai trò')}
                      options={[{ value: 'staff', label: 'Nhân viên' }, { value: 'admin', label: 'Quản lý tổng' }]} />
                  </td>
                  <td>{p.is_active ? <Badge tone="green" dot>Hoạt động</Badge> : total > 0 ? <Badge tone="red" dot>Đã khoá</Badge> : <Badge tone="yellow" dot>Chờ duyệt</Badge>}</td>
                  <td className="num">{total}</td>
                  <td className="num">{open}</td>
                  <td className="num">{moneyShort(rev)}</td>
                  <td className="hide-sm small muted">{fmtDate(p.created_at)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {p.id !== me?.id && <Button variant="ghost" size="sm" icon="refresh" title="Đặt lại mật khẩu" onClick={() => resetPw(p)}>Mật khẩu</Button>}{' '}
                    {p.id !== me?.id && p.totp_enabled && api.adminDisableTwoFactor && <Button variant="ghost" size="sm" icon="unlock" title="Tắt xác thực 2 bước (khi mất điện thoại)" onClick={() => off2fa(p)}>Tắt 2 bước</Button>}{' '}
                    {p.id !== me?.id && (p.is_active
                      ? <Button variant="outline" size="sm" icon="lock" onClick={() => confirm(`Khoá tài khoản ${p.full_name}? Nhân viên sẽ không đăng nhập vào dữ liệu được nữa. Khách hàng vẫn giữ nguyên, bạn có thể chuyển giao cho người khác.`) && update(p, { is_active: false }, 'Đã khoá tài khoản')}>Khoá</Button>
                      : <Button size="sm" icon="check" onClick={() => update(p, { is_active: true }, 'Đã kích hoạt tài khoản')}>{total > 0 ? 'Mở khoá' : 'Duyệt'}</Button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card card-pad">
        <h3 style={{ marginBottom: 8 }}>Cách thêm nhân viên mới</h3>
        <ol className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
          <li>Gửi link web cho nhân viên: <code>{signupUrl}</code></li>
          <li>Nhân viên bấm <b>Đăng ký</b>, nhập họ tên, email, mật khẩu.</li>
          <li>Tài khoản hiện ở bảng trên với trạng thái <b>Chờ duyệt</b> → bấm <b>Duyệt</b>.</li>
          <li>Vào <b>Khách hàng</b>, chọn khách → <b>Gán cho nhân viên</b> để giao việc.</li>
        </ol>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Nhân viên nghỉ việc: bấm <b>Khoá</b>, sau đó lọc Khách hàng theo tên người đó và chuyển giao hàng loạt cho người mới.
          Nhân viên quên mật khẩu: bấm <b>Mật khẩu</b> để đặt lại rồi gửi mật khẩu mới cho họ.
          Nhân viên mất điện thoại (không lấy được mã 2 bước): bấm <b>Tắt 2 bước</b>, họ đăng nhập lại rồi tự bật lại trong Cài đặt.
        </p>
      </div>
    </>
  );
}
