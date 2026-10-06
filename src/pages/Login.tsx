import { useState, type FormEvent } from 'react';
import { useStore } from '../lib/store';
import { Icon } from '../components/Icon';
import { Button, Field, Input, toast } from '../components/ui';

export function LoginPage() {
  const { api } = useStore();
  const [tab, setTab] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [otp, setOtp] = useState('');
  const [needOtp, setNeedOtp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setInfo('');
    try {
      if (tab === 'in') await api.signIn(email, pw, needOtp ? otp.trim() : undefined);
      else {
        if (!name.trim()) throw new Error('Vui lòng nhập họ tên');
        const needConfirm = await api.signUp(email, pw, name.trim(), code.trim());
        if (needConfirm) setInfo('Đã gửi email xác nhận. Mở email, bấm link xác nhận rồi quay lại đăng nhập.');
      }
    } catch (err) {
      // Tài khoản bật xác thực 2 bước: hiện ô nhập mã rồi gửi lại
      if ((err as { needOtp?: boolean }).needOtp && !needOtp) { setNeedOtp(true); setOtp(''); }
      else toast.err(err);
    } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="auth-box">
        <div className="auth-brand">
          <div className="auth-logo-wrap"><img className="auth-logo" src="/logo.png" alt="KC Education — STEM.AI.Robotics" /></div>
          <h1>KC CRM</h1>
          <p className="muted">Quản lý khách hàng cho đội ngũ kinh doanh.</p>
        </div>
        <form className="card card-pad" onSubmit={submit}>
          <h3>Truy cập tài khoản</h3>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Đăng nhập hoặc tạo tài khoản nhân viên mới.</p>
          <div className="seg">
            <button type="button" className={tab === 'in' ? 'on' : ''} onClick={() => setTab('in')}>Đăng nhập</button>
            <button type="button" className={tab === 'up' ? 'on' : ''} onClick={() => setTab('up')}>Đăng ký</button>
          </div>
          <div className="col gap12">
            {tab === 'up' && <Field label="Họ và tên"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nguyễn Văn A" /></Field>}
            <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
            <Field label="Mật khẩu"><Input type="password" required={api.mode !== 'demo'} minLength={api.mode === 'demo' || tab === 'in' ? 0 : 8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={tab === 'in' ? 'current-password' : 'new-password'} /></Field>
            {tab === 'in' && needOtp && (
              <Field label="Mã xác thực 2 bước (6 số trong ứng dụng, hoặc mã dự phòng)">
                <Input autoFocus inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" required />
              </Field>
            )}
            {tab === 'up' && api.signupCodeRequired && <Field label="Mã đăng ký (hỏi quản lý)"><Input value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="off" /></Field>}
            <Button type="submit" disabled={busy}>{busy ? 'Đang xử lý…' : tab === 'in' ? 'Đăng nhập' : 'Tạo tài khoản'}</Button>
            {tab === 'up' && <p className="small muted" style={{ margin: 0 }}>Tài khoản mới cần <b>Quản lý duyệt</b> trước khi sử dụng.</p>}
            {info && <div className="warn">{info}</div>}
          </div>

          {api.demoAccounts && (
            <>
              <div className="divider">Đăng nhập nhanh (demo)</div>
              <div className="col gap8">
                {api.demoAccounts.map((a) => (
                  <Button key={a.email} type="button" variant="outline" onClick={() => api.signIn(a.email, '').catch(toast.err)}>
                    <Icon name={a.label.startsWith('Quản') ? 'shield' : 'users'} /> {a.label} <span className="muted small">({a.email})</span>
                  </Button>
                ))}
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

export function PendingPage() {
  const { me, api, refreshMe } = useStore();
  return (
    <div className="auth">
      <div className="auth-box card card-pad" style={{ textAlign: 'center' }}>
        <div className="brand-logo" style={{ margin: '0 auto 12px' }}><Icon name="clock" size={20} /></div>
        <h3>Tài khoản đang chờ duyệt</h3>
        <p className="muted">
          Xin chào <b>{me?.full_name || me?.email}</b>. Quản lý cần duyệt tài khoản của bạn trước khi bạn có thể quản lý khách hàng.
        </p>
        <div className="row gap8" style={{ justifyContent: 'center' }}>
          <Button variant="outline" icon="refresh" onClick={() => refreshMe()}>Kiểm tra lại</Button>
          <Button variant="ghost" icon="logout" onClick={() => api.signOut()}>Đăng xuất</Button>
        </div>
      </div>
    </div>
  );
}
