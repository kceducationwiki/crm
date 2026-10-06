import { useState } from 'react';
import { useStore } from '../lib/store';
import { Button, Field, Input, PageHeader, toast } from '../components/ui';
import { TwoFactorCard } from '../components/TwoFactor';

export function SettingsPage() {
  const { me, api, refreshMe, reload, isAdmin } = useStore();
  const [name, setName] = useState(me?.full_name ?? '');
  const [pw, setPw] = useState({ old: '', next: '', again: '' });
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');

  const saveName = async () => {
    try { await api.updateProfile(me!.id, { full_name: name.trim() }); await refreshMe(); await reload(); toast.ok('Đã lưu'); }
    catch (e) { toast.err(e); }
  };
  const changePw = async () => {
    if (pw.next.length < 8) return toast.err('Mật khẩu mới tối thiểu 8 ký tự');
    if (pw.next !== pw.again) return toast.err('Nhập lại mật khẩu mới chưa khớp');
    try { await api.changePassword(pw.old, pw.next); setPw({ old: '', next: '', again: '' }); toast.ok('Đã đổi mật khẩu'); }
    catch (e) { toast.err(e); }
  };
  const toggleTheme = () => {
    const next = !dark; setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try { localStorage.setItem('kc-theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
  };

  return (
    <>
      <PageHeader title="Cài đặt" subtitle="Thông tin cá nhân và giao diện." />
      <div className="grid2-eq">
        <div className="card card-pad col gap12">
          <h3>Thông tin cá nhân</h3>
          <Field label="Họ và tên"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email"><Input value={me?.email ?? ''} disabled /></Field>
          <Field label="Vai trò"><Input value={isAdmin ? 'Quản lý tổng' : 'Nhân viên'} disabled /></Field>
          <div><Button onClick={saveName} disabled={!name.trim()}>Lưu</Button></div>
          {api.mode === 'server' && <>
          <h3 style={{ marginTop: 8 }}>Đổi mật khẩu</h3>
          <Field label="Mật khẩu hiện tại"><Input type="password" autoComplete="current-password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} /></Field>
          <Field label="Mật khẩu mới"><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <Field label="Nhập lại mật khẩu mới"><Input type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></Field>
          <div><Button variant="outline" icon="lock" onClick={changePw} disabled={!pw.old || !pw.next}>Đổi mật khẩu</Button></div>
          </>}
        </div>
        <div className="card card-pad col gap12">
          <h3>Giao diện</h3>
          <div className="row gap12">
            <div className="grow"><b>Dark mode</b><div className="small muted">Giao diện tối, dịu mắt khi làm việc buổi tối.</div></div>
            <Button variant="outline" icon={dark ? 'sun' : 'moon'} onClick={toggleTheme}>{dark ? 'Chế độ sáng' : 'Chế độ tối'}</Button>
          </div>
          {api.resetDemo && (
            <div className="row gap12" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div className="grow"><b>Dữ liệu demo</b><div className="small muted">Khôi phục dữ liệu mẫu ban đầu.</div></div>
              <Button variant="outline" icon="refresh" onClick={() => { api.resetDemo!(); reload(); toast.ok('Đã khôi phục dữ liệu mẫu'); }}>Khôi phục</Button>
            </div>
          )}
        </div>
      </div>
      <TwoFactorCard />
    </>
  );
}
