import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { Badge, Button, Field, Input, toast } from './ui';
import { qrMatrix, qrSvgPath } from '../lib/qr';

/** Thẻ bật / tắt xác thực 2 bước trong trang Cài đặt */
export function TwoFactorCard() {
  const { api, me, refreshMe, isAdmin } = useStore();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState<string[] | null>(null);
  const [pw, setPw] = useState('');
  const [turningOff, setTurningOff] = useState(false);
  const [busy, setBusy] = useState(false);

  const qr = useMemo(() => {
    if (!setup) return null;
    try { return qrSvgPath(qrMatrix(setup.uri)); } catch { return null; }
  }, [setup]);

  if (!api.twoFactorSetup) return null; // chế độ demo không có
  const on = !!me?.totp_enabled;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.err(e); } finally { setBusy(false); }
  };
  const start = () => act(async () => { setSetup(await api.twoFactorSetup!()); setCode(''); });
  const enable = () => act(async () => {
    const codes = await api.twoFactorEnable!(code.replace(/\s/g, ''));
    setBackup(codes); setSetup(null); await refreshMe();
    toast.ok('Đã bật xác thực 2 bước');
  });
  const disable = () => act(async () => {
    await api.twoFactorDisable!(pw);
    setPw(''); setTurningOff(false); await refreshMe();
    toast.ok('Đã tắt xác thực 2 bước');
  });
  const copyBackup = () => { navigator.clipboard?.writeText((backup ?? []).join('\n')).then(() => toast.ok('Đã copy mã dự phòng'), () => {}); };

  return (
    <div className="card card-pad col gap12">
      <div className="row gap8">
        <h3>Xác thực 2 bước</h3>
        {on ? <Badge tone="green" dot>Đang bật</Badge> : <Badge tone={isAdmin ? 'red' : 'gray'} dot>Chưa bật</Badge>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Khi đăng nhập, ngoài mật khẩu còn phải nhập mã 6 số trên điện thoại. Kẻ gian có lấy được mật khẩu cũng không vào được.
        {isAdmin && !on && <b style={{ color: 'var(--danger)' }}> Tài khoản quản lý xem được toàn bộ khách hàng — nên bật.</b>}
      </p>

      {/* Mã dự phòng — chỉ hiện 1 lần ngay sau khi bật */}
      {backup && (
        <div className="box" style={{ marginBottom: 0 }}>
          <div className="box-title">Mã dự phòng — lưu lại ngay, chỉ hiện 1 lần</div>
          <p className="small muted" style={{ marginTop: 0 }}>Dùng khi mất / đổi điện thoại. Mỗi mã dùng được 1 lần thay cho mã 6 số.</p>
          <div className="backup-codes">{backup.map((c) => <code key={c}>{c}</code>)}</div>
          <div className="row gap8" style={{ marginTop: 10 }}>
            <Button size="sm" variant="outline" onClick={copyBackup}>Copy</Button>
            <Button size="sm" onClick={() => setBackup(null)}>Tôi đã lưu lại</Button>
          </div>
        </div>
      )}

      {!on && !setup && !backup && <div><Button icon="shield" onClick={start} disabled={busy}>Bật xác thực 2 bước</Button></div>}

      {!on && setup && (
        <div className="col gap12">
          <div className="small"><b>Bước 1.</b> Cài ứng dụng <b>Google Authenticator</b> (hoặc Microsoft Authenticator) trên điện thoại.</div>
          <div className="small"><b>Bước 2.</b> Trong ứng dụng bấm dấu <b>+</b> → <b>Quét mã QR</b> và quét mã dưới đây:</div>
          {qr && (
            <svg className="qr" viewBox={`0 0 ${qr.size} ${qr.size}`} width={200} height={200} role="img" aria-label="Mã QR thiết lập xác thực 2 bước">
              <rect width={qr.size} height={qr.size} fill="#fff" /><path d={qr.d} fill="#000" />
            </svg>
          )}
          <div className="small muted">Không quét được? Chọn "Nhập khoá thiết lập" và gõ: <code style={{ wordBreak: 'break-all' }}>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code></div>
          <Field label="Bước 3. Nhập mã 6 số đang hiện trong ứng dụng">
            <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enable()} placeholder="123456" style={{ maxWidth: 180 }} />
          </Field>
          <div className="row gap8">
            <Button onClick={enable} disabled={busy || code.replace(/\s/g, '').length !== 6}>Xác nhận & bật</Button>
            <Button variant="ghost" onClick={() => setSetup(null)}>Huỷ</Button>
          </div>
        </div>
      )}

      {on && !backup && !turningOff && <div><Button variant="outline" icon="unlock" onClick={() => setTurningOff(true)}>Tắt xác thực 2 bước</Button></div>}
      {on && turningOff && (
        <div className="col gap12">
          <Field label="Nhập mật khẩu để xác nhận tắt"><Input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} style={{ maxWidth: 260 }} /></Field>
          <div className="row gap8">
            <Button variant="danger" onClick={disable} disabled={busy || !pw}>Tắt</Button>
            <Button variant="ghost" onClick={() => { setTurningOff(false); setPw(''); }}>Huỷ</Button>
          </div>
        </div>
      )}
    </div>
  );
}
