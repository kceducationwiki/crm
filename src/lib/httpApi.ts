import type { Api } from './api';
import type { Customer, DocFile, Profile } from './types';

/** Gọi backend Node (server/index.js) cùng domain, đăng nhập bằng cookie */
async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-KC-Request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const d = data as { error?: string; need_otp?: boolean } | null;
    const err = new Error(d?.error || `Lỗi ${res.status}`) as Error & { needOtp?: boolean };
    if (d?.need_otp) err.needOtp = true;
    throw err;
  }
  return data as T;
}

export function createHttpApi(): Api {
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  return {
    mode: 'server',
    signupCodeRequired: (window as unknown as { __ENV__?: Record<string, string> }).__ENV__?.SIGNUP_CODE_REQUIRED === '1',

    currentProfile: () => call<Profile | null>('GET', '/auth/me'),
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    async signIn(email, password, otp) { await call('POST', '/auth/login', { email, password, otp }); emit(); },
    async signUp(email, password, full_name, signup_code) { await call('POST', '/auth/register', { email, password, full_name, signup_code }); emit(); return false; },
    async signOut() { await call('POST', '/auth/logout'); emit(); },
    async changePassword(old_password, new_password) { await call('POST', '/auth/password', { old_password, new_password }); },

    twoFactorSetup: () => call<{ secret: string; uri: string }>('POST', '/auth/2fa/setup'),
    async twoFactorEnable(code) { return (await call<{ backup_codes: string[] }>('POST', '/auth/2fa/enable', { code })).backup_codes; },
    async twoFactorDisable(password) { await call('POST', '/auth/2fa/disable', { password }); },
    async adminDisableTwoFactor(id) { await call('POST', `/profiles/${id}/disable-2fa`); },

    listProfiles: () => call<Profile[]>('GET', '/profiles'),
    async updateProfile(id, patch) { await call('PATCH', `/profiles/${id}`, patch); },
    async resetPassword(id, password) { await call('POST', `/profiles/${id}/reset-password`, { password }); },

    listCustomers: () => call<Customer[]>('GET', '/customers'),
    createCustomer: (data, contact) => call<Customer>('POST', '/customers', { data, contact }),
    async updateCustomer(id, patch) { await call('PATCH', `/customers/${id}`, patch); },
    async updateCustomers(ids, patch) { await call('POST', '/customers/bulk-update', { ids, patch }); },
    async deleteCustomers(ids) { await call('POST', '/customers/bulk-delete', { ids }); },

    addChild: (table, row) => call('POST', `/children/${table}`, row),
    async updateChild(table, id, patch) { await call('PATCH', `/children/${table}/${id}`, patch); },
    async deleteChild(table, id) { await call('DELETE', `/children/${table}/${id}`); },

    async uploadDocument(customerId, file, meta) {
      const qs = new URLSearchParams({ name: file.name, mime: file.type || 'application/octet-stream', kind: meta.kind, contract_no: meta.contract_no, note: meta.note });
      if (meta.order_id) qs.set('order_id', meta.order_id);
      const res = await fetch(`/api/customers/${customerId}/documents?${qs}`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/octet-stream', 'X-KC-Request': '1' },
        body: file,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Lỗi ${res.status}`);
      return data as DocFile;
    },
    downloadDocument(doc) {
      const a = document.createElement('a');
      a.href = `/api/documents/${doc.id}/download`;
      a.download = doc.name;
      document.body.appendChild(a); a.click(); a.remove();
    },

    findDuplicates: (name) => call('GET', `/duplicates?name=${encodeURIComponent(name)}`),
  };
}
