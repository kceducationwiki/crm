import { createContext, useContext } from 'react';

export type Route = 'dashboard' | 'customers' | 'pipeline' | 'orders' | 'followups' | 'staff' | 'settings';
export const ROUTES: Route[] = ['dashboard', 'customers', 'pipeline', 'orders', 'followups', 'staff', 'settings'];

export type DetailTab = 'overview' | 'timeline' | 'notes' | 'followups' | 'orders';

export interface Nav { go: (r: Route) => void; openCustomer: (id: string, tab?: DetailTab) => void }
export const NavCtx = createContext<Nav>({ go: () => {}, openCustomer: () => {} });
export const useNav = () => useContext(NavCtx);
