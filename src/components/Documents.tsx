import { useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { Icon } from './Icon';
import { Badge, Button, Empty, Field, Input, Select, toast } from './ui';
import { DOC_KINDS, MAX_FILE_MB, docKindMeta } from '../lib/constants';
import { fmtDate } from '../lib/format';
import type { Customer, DocFile, DocKind, DocMeta } from '../lib/types';

export const fileSize = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

/** Tab "Hồ sơ": lưu hợp đồng, biên bản, hoá đơn… theo khách hàng để lần sau tải về dùng lại */
export function Documents({ c }: { c: Customer }) {
  const { api, me, reload, nameOf } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [meta, setMeta] = useState<DocMeta>({ kind: 'contract', contract_no: '', note: '', order_id: null });
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [filter, setFilter] = useState<'' | DocKind>('');
  const [editId, setEditId] = useState<string | null>(null);

  const orderOpts = [{ value: '', label: '— Không gắn đơn cụ thể —' }, ...c.orders.map((o) => ({ value: o.id, label: `${o.code}${o.products.length ? ' · ' + o.products.join(', ') : ''}` }))];
  const kindOpts = DOC_KINDS.map((k) => ({ value: k.key, label: k.label }));

  const pick = (list: FileList | null) => {
    if (!list) return;
    const ok: File[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE_MB * 1048576) toast.err(`"${f.name}" lớn hơn ${MAX_FILE_MB} MB`);
      else if (f.size === 0) toast.err(`"${f.name}" là tệp rỗng`);
      else ok.push(f);
    }
    setFiles((x) => [...x, ...ok]);
  };

  const upload = async () => {
    if (!files.length) return toast.err('Chọn ít nhất 1 tệp');
    setBusy(true);
    try {
      for (const f of files) await api.uploadDocument(c.id, f, { ...meta, contract_no: meta.contract_no.trim(), note: meta.note.trim() });
      await api.addChild('activities', {
        customer_id: c.id, type: 'other', created_by: me!.id,
        content: `Lưu hồ sơ (${docKindMeta(meta.kind).label}${meta.contract_no.trim() ? ' số ' + meta.contract_no.trim() : ''}): ${files.map((f) => f.name).join(', ')}`,
      });
      toast.ok(`Đã lưu ${files.length} tệp`);
      setFiles([]); setMeta({ ...meta, contract_no: '', note: '' });
      if (input.current) input.current.value = '';
      await reload();
    } catch (e) { toast.err(e); await reload(); } finally { setBusy(false); }
  };

  const list = c.documents.filter((d) => !filter || d.kind === filter);

  return (
    <>
      <div className="box">
        <div className="box-title"><Icon name="upload" /> Lưu hồ sơ / hợp đồng</div>
        <label className={'dropzone' + (drag ? ' on' : '')}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}>
          <Icon name="paperclip" size={18} />
          <span>Bấm để chọn tệp hoặc kéo thả vào đây <span className="muted">(Word, Excel, PDF, ảnh… tối đa {MAX_FILE_MB} MB / tệp)</span></span>
          <input ref={input} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />
        </label>
        {files.length > 0 && (
          <div className="chips" style={{ marginTop: 8 }}>
            {files.map((f, i) => (
              <span key={i} className="chip" style={{ cursor: 'default' }}>
                {f.name} <span className="muted">({fileSize(f.size)})</span>{' '}
                <button type="button" className="x" aria-label={'Bỏ ' + f.name} onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
          </div>
        )}
        <div className="form-grid" style={{ marginTop: 12 }}>
          <Field label="Loại hồ sơ"><Select value={meta.kind} onChange={(e) => setMeta({ ...meta, kind: e.target.value as DocKind })} options={kindOpts} /></Field>
          <Field label="Số hợp đồng"><Input value={meta.contract_no} onChange={(e) => setMeta({ ...meta, contract_no: e.target.value })} placeholder="VD: 15/2026/HĐMB-KC" /></Field>
          <Field label="Thuộc đơn hàng"><Select value={meta.order_id ?? ''} onChange={(e) => setMeta({ ...meta, order_id: e.target.value || null })} options={orderOpts} /></Field>
          <Field label="Ghi chú"><Input value={meta.note} onChange={(e) => setMeta({ ...meta, note: e.target.value })} placeholder="VD: bản đã ký đóng dấu" /></Field>
        </div>
        <Button style={{ marginTop: 12 }} icon="upload" onClick={upload} disabled={busy || !files.length}>{busy ? 'Đang tải lên…' : `Lưu ${files.length || ''} tệp`}</Button>
      </div>

      {c.documents.length > 0 && (
        <div className="row gap8 wrap" style={{ margin: '14px 0 10px' }}>
          <button className={'chip' + (!filter ? ' chip-on' : '')} onClick={() => setFilter('')}>Tất cả ({c.documents.length})</button>
          {DOC_KINDS.filter((k) => c.documents.some((d) => d.kind === k.key)).map((k) => (
            <button key={k.key} className={'chip' + (filter === k.key ? ' chip-on' : '')} onClick={() => setFilter(k.key)}>{k.label} ({c.documents.filter((d) => d.kind === k.key).length})</button>
          ))}
        </div>
      )}
      {c.documents.length === 0 && <Empty icon="file" text="Chưa có hồ sơ nào. Lưu hợp đồng ở đây để lần sau khách có đơn mới chỉ cần tải về, đổi số hợp đồng và thông tin đơn." />}

      {list.map((d) => (editId === d.id
        ? <DocEdit key={d.id} c={c} d={d} onClose={() => setEditId(null)} />
        : (
          <div key={d.id} className="list-item doc">
            <Icon name="file" className="muted" size={18} />
            <div className="grow">
              <div className="row gap8 wrap">
                <a href="#" className="doc-name" title="Tải về" onClick={(e) => { e.preventDefault(); api.downloadDocument(d); }}>{d.name}</a>
                <Badge tone={docKindMeta(d.kind).tone}>{docKindMeta(d.kind).label}</Badge>
                {d.contract_no && <Badge tone="sky">Số {d.contract_no}</Badge>}
              </div>
              <div className="small muted">
                {fileSize(d.size)} · {fmtDate(d.created_at)} · {nameOf(d.uploaded_by)}
                {d.order_id && ` · Đơn ${c.orders.find((o) => o.id === d.order_id)?.code ?? '(đã xoá)'}`}
                {d.note && ` · ${d.note}`}
              </div>
            </div>
            <Button variant="outline" size="sm" icon="download" onClick={() => api.downloadDocument(d)}>Tải về</Button>
            <Button variant="ghost" size="sm" icon="edit" aria-label="Sửa thông tin" title="Sửa thông tin" onClick={() => setEditId(d.id)} />
            <Button variant="ghost" size="sm" icon="trash" aria-label="Xoá tệp" title="Xoá tệp"
              onClick={async () => {
                if (!confirm(`Xoá vĩnh viễn tệp "${d.name}"?`)) return;
                try { await api.deleteChild('documents', d.id); toast.ok('Đã xoá tệp'); await reload(); } catch (e) { toast.err(e); }
              }} />
          </div>
        )))}
    </>
  );
}

function DocEdit({ c, d, onClose }: { c: Customer; d: DocFile; onClose: () => void }) {
  const { api, reload } = useStore();
  const [f, setF] = useState({ name: d.name, kind: d.kind, contract_no: d.contract_no, note: d.note, order_id: d.order_id });
  const save = async () => {
    if (!f.name.trim()) return toast.err('Tên tệp không được để trống');
    try {
      await api.updateChild('documents', d.id, { ...f, name: f.name.trim(), contract_no: f.contract_no.trim(), note: f.note.trim() });
      toast.ok('Đã lưu'); await reload(); onClose();
    } catch (e) { toast.err(e); }
  };
  return (
    <div className="box">
      <div className="form-grid">
        <Field label="Tên tệp" span2><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Loại hồ sơ"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as DocKind })} options={DOC_KINDS.map((k) => ({ value: k.key, label: k.label }))} /></Field>
        <Field label="Số hợp đồng"><Input value={f.contract_no} onChange={(e) => setF({ ...f, contract_no: e.target.value })} /></Field>
        <Field label="Thuộc đơn hàng"><Select value={f.order_id ?? ''} onChange={(e) => setF({ ...f, order_id: e.target.value || null })}
          options={[{ value: '', label: '— Không gắn đơn cụ thể —' }, ...c.orders.map((o) => ({ value: o.id, label: o.code }))]} /></Field>
        <Field label="Ghi chú"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <div className="row gap8" style={{ marginTop: 12 }}><Button size="sm" onClick={save}>Lưu</Button><Button size="sm" variant="ghost" onClick={onClose}>Huỷ</Button></div>
    </div>
  );
}
