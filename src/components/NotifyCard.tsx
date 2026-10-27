import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { Badge, Button, Field, Input, Select, toast } from './ui';
import type { NotifyPrefs, NotifyStatus } from '../lib/types';

/** Cài đặt → Thông báo: nhắc follow-up, công nợ, hoá đơn, giấy tờ qua email / Zalo */
export function NotifyCard() {
  const { api, isAdmin } = useStore();
  const n = api.notify;
  const [st, setSt] = useState<NotifyStatus | null>(null);
  const [form, setForm] = useState({ hour: '8', milestones: '', repeat: '7' });
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!n) return;
    const s = await n.status();
    setSt(s);
    return s;
  }, [n]);
  useEffect(() => {
    load().then((s) => s && setForm({ hour: String(s.settings.hour), milestones: s.settings.milestones.join(', '), repeat: String(s.settings.repeat) }))
      .catch(toast.err);
  }, [load]);
  // Đang chờ nhắn mã cho bot → tự kiểm tra mỗi 3 giây
  useEffect(() => {
    if (!st?.me.zalo_code || st.me.zalo_linked) return;
    const t = setInterval(() => { load().then((s) => s?.me.zalo_linked && toast.ok('Đã kết nối Zalo')).catch(() => {}); }, 3000);
    return () => clearInterval(t);
  }, [st?.me.zalo_code, st?.me.zalo_linked, load]);

  if (!n) return null; // chế độ demo không có
  if (!st) return null;

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) toast.ok(ok); } catch (e) { toast.err(e); } finally { setBusy(false); }
  };
  const pref = (p: NotifyPrefs) => act(async () => { await n.savePrefs(p); await load(); });
  const result = (r: { email?: string; zalo?: string }) => {
    const parts = Object.entries(r).map(([k, v]) => `${k === 'email' ? 'Email' : 'Zalo'}: ${v === 'ok' ? 'đã gửi ✓' : v}`);
    const bad = Object.values(r).some((v) => v !== 'ok');
    (bad ? toast.err : toast.ok)(parts.join(' · '));
  };
  const { me } = st;
  const none = !st.email_ready && !st.zalo_ready;

  return (
    <div className="card card-pad col gap12" style={{ marginBottom: 16 }}>
      <div className="row gap8">
        <h3>Thông báo nhắc việc</h3>
        {none ? <Badge tone="gray" dot>Chưa cấu hình</Badge> : <Badge tone="green" dot>Đang hoạt động</Badge>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Mỗi sáng lúc <b>{st.settings.hour}h</b>, hệ thống gửi cho bạn 1 tin tổng hợp: follow-up đến hạn / đã trễ; <b>công nợ</b> của đơn đã{' '}
        <b>giao hàng được {st.settings.milestones.join(', ')} ngày</b> mà chưa thu đủ tiền; và đơn đã <b>chốt được {st.settings.milestones.join(', ')} ngày</b>{' '}
        mà chưa xuất hoá đơn hoặc chưa đủ giấy tờ
        {st.settings.repeat > 0 && <> (sau mốc cuối nhắc lại mỗi {st.settings.repeat} ngày tới khi xong)</>}.
        {' '}Nhân viên nhận nhắc của khách mình phụ trách.
      </p>
      {none && (
        <div className="warn">
          Server chưa cấu hình kênh gửi. {isAdmin ? 'Thêm biến môi trường SMTP_* (email) và/hoặc ZALO_BOT_TOKEN (Zalo) trên Dokploy rồi deploy lại — xem README mục "Thông báo nhắc việc".' : 'Hãy báo quản lý để cài đặt.'}
        </div>
      )}

      <div className="notify-ch">
        <div className="grow">
          <b>Email</b> {!st.email_ready && <Badge tone="gray">server chưa cấu hình</Badge>}
          <div className="small muted">Gửi về {me.email}</div>
        </div>
        <label className="row gap8 small"><input type="checkbox" checked={me.notify_email} disabled={busy} onChange={(e) => pref({ notify_email: e.target.checked })} /> Nhận qua email</label>
      </div>

      <div className="notify-ch">
        <div className="grow">
          <b>Zalo</b> {!st.zalo_ready ? <Badge tone="gray">server chưa cấu hình</Badge>
            : me.zalo_linked ? <Badge tone="green" dot>Đã kết nối</Badge> : <Badge tone="orange">Chưa kết nối</Badge>}
          <div className="small muted">Nhận tin qua Zalo Bot{st.bot_name ? ` “${st.bot_name}”` : ''} của công ty.</div>
        </div>
        {st.zalo_ready && (me.zalo_linked ? (
          <div className="row gap8">
            <label className="row gap8 small"><input type="checkbox" checked={me.notify_zalo} disabled={busy} onChange={(e) => pref({ notify_zalo: e.target.checked })} /> Nhận qua Zalo</label>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirm('Ngắt kết nối Zalo?') && act(async () => { await n.unlinkZalo(); await load(); }, 'Đã ngắt kết nối Zalo')}>Ngắt</Button>
          </div>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => act(async () => { await n.linkZalo(); await load(); })}>{me.zalo_code ? 'Lấy mã mới' : 'Kết nối Zalo'}</Button>
        ))}
      </div>
      {st.zalo_ready && !me.zalo_linked && me.zalo_code && (
        <div className="box" style={{ marginBottom: 0 }}>
          <div className="box-title">Kết nối Zalo — làm trong 15 phút</div>
          <ol className="small" style={{ margin: '0 0 8px', paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Mở Zalo trên điện thoại, tìm bot <b>{st.bot_name || 'nhắc việc của công ty'}</b> (hỏi quản lý nếu chưa biết tên / mã QR của bot).</li>
            <li>Nhắn cho bot đúng mã này:</li>
          </ol>
          <div className="row gap8">
            <code className="zalo-code">{me.zalo_code}</code>
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(me.zalo_code!).then(() => toast.ok('Đã copy mã'), () => {})}>Copy</Button>
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>Bot trả lời “Đã kết nối” là xong — trang này tự cập nhật.</div>
        </div>
      )}

      {isAdmin && (
        <div className="notify-ch">
          <div className="grow"><b>Nhắc của toàn bộ khách hàng</b><div className="small muted">Quản lý nhận thêm việc của tất cả nhân viên (kèm tên nhân viên phụ trách).</div></div>
          <label className="row gap8 small"><input type="checkbox" checked={me.notify_all} disabled={busy} onChange={(e) => pref({ notify_all: e.target.checked })} /> Bật</label>
        </div>
      )}

      {!none && (
        <div className="row gap8 wrap">
          <Button size="sm" variant="outline" icon="mail" disabled={busy} onClick={() => act(async () => result(await n.test()))}>Gửi tin thử cho tôi</Button>
          <Button size="sm" variant="outline" icon="search" disabled={busy} onClick={() => act(async () => setPreview((await n.preview()).text))}>Xem trước nhắc hôm nay</Button>
        </div>
      )}
      {preview !== null && (
        <div className="box" style={{ marginBottom: 0 }}>
          <div className="row"><div className="box-title grow">Nội dung nhắc hôm nay của bạn</div><Button size="sm" variant="ghost" icon="x" aria-label="Đóng" onClick={() => setPreview(null)} /></div>
          <pre className="notify-preview">{preview}</pre>
        </div>
      )}

      {isAdmin && (
        <div className="box" style={{ marginBottom: 0 }}>
          <div className="box-title">Cài đặt chung (quản lý)</div>
          <div className="form-grid">
            <Field label="Giờ gửi mỗi ngày">
              <Select value={form.hour} onChange={(e) => setForm({ ...form, hour: e.target.value })}
                options={Array.from({ length: 17 }, (_, i) => i + 6).map((h) => ({ value: String(h), label: `${h}:00` }))} />
            </Field>
            <Field label="Nhắc lại sau mốc cuối (ngày, 0 = không)">
              <Input type="number" min={0} max={365} value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} />
            </Field>
            <Field label="Mốc nhắc sau ngày chốt đơn (ngày, cách nhau bởi dấu phẩy)" span2>
              <Input value={form.milestones} onChange={(e) => setForm({ ...form, milestones: e.target.value })} placeholder="10, 20, 25, 30" />
            </Field>
          </div>
          <div className="row gap8 wrap" style={{ marginTop: 12 }}>
            <Button size="sm" disabled={busy} onClick={() => act(async () => {
              const s = await n.saveSettings({ hour: Number(form.hour), repeat: Number(form.repeat), milestones: form.milestones });
              setForm({ hour: String(s.hour), milestones: s.milestones.join(', '), repeat: String(s.repeat) });
              await load();
            }, 'Đã lưu cài đặt thông báo')}>Lưu cài đặt</Button>
            {!none && <Button size="sm" variant="outline" disabled={busy} onClick={() => confirm('Gửi nhắc việc cho mọi người ngay bây giờ? (Mốc đơn đã nhắc rồi sẽ không nhắc lại)') && act(async () => {
              const r = await n.runNow();
              if (r.skipped) toast.err(r.skipped);
              else toast.ok(r.sent?.length ? `Đã gửi cho ${r.sent.length} người` : 'Không có việc nào cần nhắc');
            })}>Gửi nhắc cho mọi người ngay</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
