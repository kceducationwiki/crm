import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Api } from './api';
import type { Customer, Profile } from './types';
import { createHttpApi } from './httpApi';
import { createDemoApi } from './demoApi';

// env.js do server sinh ra (BACKEND=1). Không có server (vd: chỉ chạy giao diện) → chế độ DEMO.
const runtime = (window as unknown as { __ENV__?: Record<string, string> }).__ENV__ ?? {};
export const api: Api = runtime.BACKEND === '1' ? createHttpApi() : createDemoApi();

interface Store {
  api: Api;
  me: Profile | null;
  authLoading: boolean;
  isAdmin: boolean;
  profiles: Profile[];
  customers: Customer[];
  loading: boolean;
  reload: () => Promise<void>;
  refreshMe: () => Promise<void>;
  /** cập nhật lạc quan 1 khách hàng trong bộ nhớ */
  patchLocal: (id: string, fn: (c: Customer) => Customer) => void;
  nameOf: (id: string | null | undefined) => string;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshMe = useCallback(async () => {
    try { setMe(await api.currentProfile()); } finally { setAuthLoading(false); }
  }, []);

  useEffect(() => {
    refreshMe();
    return api.onAuthChange(() => { refreshMe(); });
  }, [refreshMe]);

  const reload = useCallback(async () => {
    if (!me?.is_active) { setCustomers([]); setProfiles([]); return; }
    setLoading(true);
    try {
      const [p, c] = await Promise.all([api.listProfiles(), api.listCustomers()]);
      setProfiles(p); setCustomers(c);
    } finally { setLoading(false); }
  }, [me?.id, me?.is_active, me?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload(); }, [reload]);

  const patchLocal = useCallback((id: string, fn: (c: Customer) => Customer) => {
    setCustomers((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  const value = useMemo<Store>(() => {
    const map = new Map(profiles.map((p) => [p.id, p.full_name || p.email]));
    return {
      api, me, authLoading, isAdmin: !!me && me.role === 'admin' && me.is_active,
      profiles, customers, loading, reload, refreshMe, patchLocal,
      nameOf: (id) => (id ? map.get(id) ?? '—' : 'Chưa gán'),
    };
  }, [me, authLoading, profiles, customers, loading, reload, refreshMe, patchLocal]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
