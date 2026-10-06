import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Icon } from './Icon';
import { lifecycleMeta, stageMeta, priorityMeta } from '../lib/constants';
import type { Lifecycle, Priority, Stage } from '../lib/types';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------- Toast ---------- */
type ToastItem = { id: number; text: string; kind: 'ok' | 'err' };
let push: (t: Omit<ToastItem, 'id'>) => void = () => {};
export const toast = {
  ok: (text: string) => push({ text, kind: 'ok' }),
  err: (e: unknown) => push({ text: e instanceof Error ? e.message : String(e), kind: 'err' }),
};
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    push = (t) => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { ...t, id }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3200);
    };
  }, []);
  return (
    <div className="toaster" role="status">
      {items.map((t) => (
        <div key={t.id} className={cx('toast', t.kind === 'err' && 'toast-err')}>
          <Icon name={t.kind === 'err' ? 'alert' : 'check'} /> {t.text}
        </div>
      ))}
    </div>
  );
}

/* ---------- Basic controls ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' | 'danger'; size?: 'sm' | 'md'; icon?: string };
export function Button({ variant = 'primary', size = 'md', icon, className, children, ...rest }: BtnProps) {
  return (
    <button className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', !children && 'btn-icon', className)} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx('input', p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx('input', p.className)} />;
export function Select({ options, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...rest} className={cx('input select', className)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export function Field({ label, children, span2 }: { label: string; children: ReactNode; span2?: boolean }) {
  return <label className={cx('field', span2 && 'span2')}><span className="field-label">{label}</span>{children}</label>;
}

/* ---------- Badges ---------- */
export const Badge = ({ tone = 'gray', children, dot }: { tone?: string; children: ReactNode; dot?: boolean }) => (
  <span className={`badge tone-${tone}`}>{dot && <span className="dot" />}{children}</span>
);
export const StageBadge = ({ stage }: { stage: Stage }) => { const m = stageMeta(stage); return <Badge tone={m.tone} dot>{m.label}</Badge>; };
export const LifeBadge = ({ value }: { value: Lifecycle }) => { const m = lifecycleMeta(value); return <Badge tone={m.tone} dot>{m.label}</Badge>; };
export const PriorityBadge = ({ value }: { value: Priority }) => { const m = priorityMeta(value); return <Badge tone={m.tone}>{m.label}</Badge>; };

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[parts.length - 1]?.[0] ?? '') + (parts.length > 1 ? parts[0][0] : '')).toUpperCase();
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${h} 60% 50%)` }}>{initials || '?'}</span>;
}

/* ---------- Overlays ---------- */
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEsc(onClose);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal', wide && 'modal-wide')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h3>{title}</h3><Button variant="ghost" icon="x" onClick={onClose} aria-label="Đóng" /></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEsc(onClose);
  return (
    <div className="overlay overlay-right" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true">{children}</aside>
    </div>
  );
}

function useEsc(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && fn();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fn]);
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} className={cx('tab', value === t.key && 'tab-active')} onClick={() => onChange(t.key)}>
          {t.label}{t.count ? <span className="tab-count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Chips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button type="button" key={o} className={cx('chip', on && 'chip-on')}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}>{o}</button>
        );
      })}
    </div>
  );
}

export const Empty = ({ icon = 'search', text }: { icon?: string; text: string }) => (
  <div className="empty"><Icon name={icon} size={22} /><span>{text}</span></div>
);

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
      {actions && <div className="row gap8 wrap">{actions}</div>}
    </div>
  );
}

export { cx };
