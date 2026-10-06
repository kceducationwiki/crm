import { useEffect, useMemo, useState } from 'react';
import { NavCtx, ROUTES, type DetailTab, type Nav, type Route } from './lib/nav';
import { useStore } from './lib/store';
import { Icon } from './components/Icon';
import { Avatar, Button, Toaster } from './components/ui';
import { LoginPage, PendingPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { CustomersPage } from './pages/Customers';
import { PipelinePage } from './pages/Pipeline';
import { OrdersPage } from './pages/Orders';
import { FollowUpsPage } from './pages/FollowUps';
import { StaffPage } from './pages/Staff';
import { SettingsPage } from './pages/Settings';
import { CustomerDetail } from './pages/CustomerDetail';
import { todayStr } from './lib/format';


const readRoute = (): Route => {
  const r = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Route;
  return ROUTES.includes(r) ? r : 'dashboard';
};

export function App() {
  const { me, authLoading, isAdmin, customers, api, reload } = useStore();
  const [route, setRoute] = useState<Route>(readRoute);
  const [open, setOpen] = useState<{ id: string; tab?: DetailTab } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const h = () => { setRoute(readRoute()); setMenuOpen(false); setOpen(null); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  // Làm mới dữ liệu khi chuyển trang, khi quay lại tab trình duyệt và mỗi 2 phút
  // để thấy thay đổi của người khác (nhân viên mới đăng ký, khách được chuyển giao…)
  useEffect(() => { reload(); }, [route]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onFocus);
    const t = setInterval(onFocus, 120_000);
    return () => { document.removeEventListener('visibilitychange', onFocus); clearInterval(t); };
  }, [reload]);

  const nav = useMemo<Nav>(() => ({
    go: (r) => { window.location.hash = '/' + r; },
    openCustomer: (id, tab) => setOpen({ id, tab }),
  }), []);

  const overdue = useMemo(() => {
    const t = todayStr();
    return customers.reduce((n, c) => n + c.follow_ups.filter((f) => !f.done && f.due_date <= t).length, 0);
  }, [customers]);

  if (authLoading) return <div className="auth muted">Đang tải…</div>;
  if (!me) return <><LoginPage /><Toaster /></>;
  if (!me.is_active) return <><PendingPage /><Toaster /></>;

  const page = route === 'staff' && !isAdmin ? 'dashboard' : route;

  const links: { r: Route; label: string; icon: string; badge?: number; admin?: boolean }[] = [
    { r: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { r: 'customers', label: 'Khách hàng', icon: 'users' },
    { r: 'pipeline', label: 'Pipeline', icon: 'kanban' },
    { r: 'orders', label: 'Đơn hàng & công nợ', icon: 'receipt' },
    { r: 'followups', label: 'Follow-up', icon: 'bell', badge: overdue },
    { r: 'staff', label: 'Nhân viên', icon: 'shield', admin: true },
    { r: 'settings', label: 'Cài đặt', icon: 'settings' },
  ];

  return (
    <NavCtx.Provider value={nav}>
      <div className="app">
        <aside className={'sidebar' + (menuOpen ? ' open' : '')}>
          <div className="brand">
            <div className="brand-logo"><img src="/logo-mark.png" alt="KC Education" /></div>
            <div><b>KC CRM</b><span>KC Education</span></div>
          </div>
          <div className="nav-label">Workspace</div>
          <nav className="nav">
            {links.filter((l) => !l.admin || isAdmin).map((l) => (
              <a key={l.r} href={'#/' + l.r} className={page === l.r ? 'active' : ''}>
                <Icon name={l.icon} /> {l.label}
                {!!l.badge && <span className="count">{l.badge}</span>}
              </a>
            ))}
          </nav>
          <div className="side-foot">
            <div className="me">
              <Avatar name={me.full_name || me.email} size={32} />
              <div className="who grow">
                <b className="truncate">{me.full_name || me.email}</b>
                <span className="small muted">{isAdmin ? 'Quản lý tổng' : 'Nhân viên'}</span>
              </div>
              <Button variant="ghost" size="sm" icon="logout" title="Đăng xuất" aria-label="Đăng xuất" onClick={() => api.signOut()} />
            </div>
          </div>
        </aside>

        <div className="main">
          {api.mode === 'demo' && (
            <div className="demo-bar">Chế độ DEMO — dữ liệu mẫu lưu trên trình duyệt. Chạy kèm server + PostgreSQL để dùng thật (xem README).</div>
          )}
          <div className="topbar">
            <Button variant="ghost" icon="menu" className="menu-btn" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)} />
            <div className="small muted">
              Hôm nay · {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
            <div className="right row gap8">
              <span className={'badge ' + (isAdmin ? 'tone-purple' : 'tone-blue')}>
                <Icon name={isAdmin ? 'shield' : 'users'} size={12} /> {isAdmin ? 'Quản lý tổng — xem toàn bộ khách hàng' : 'Nhân viên — khách hàng của tôi'}
              </span>
            </div>
          </div>
          <main className="content">
            {page === 'dashboard' && <DashboardPage />}
            {page === 'customers' && <CustomersPage />}
            {page === 'pipeline' && <PipelinePage />}
            {page === 'orders' && <OrdersPage />}
            {page === 'followups' && <FollowUpsPage />}
            {page === 'staff' && <StaffPage />}
            {page === 'settings' && <SettingsPage />}
          </main>
        </div>
      </div>
      {open && <CustomerDetail key={open.id + (open.tab ?? '')} id={open.id} initialTab={open.tab} onClose={() => setOpen(null)} />}
      <Toaster />
    </NavCtx.Provider>
  );
}
