import type { Lifecycle, Priority, Stage } from './types';

export const SCHOOL_TYPES = ['Công lập', 'Tư thục', 'Quốc tế', 'Trung tâm', 'Đại học', 'Khác'];
export const SOURCES = ['Facebook', 'Website', 'Hội thảo', 'Giới thiệu', 'Email', 'Gọi điện', 'Khác'];
export const PRODUCTS = [
  'VEX GO', 'VEX IQ', 'VEX EXP', 'VEX V5', 'VEX AIM', 'VEX CTE', 'VEX 123',
  'KCBot', 'Máy in 3D', 'Laser', 'CNC', 'Khác',
];
export const PROVINCES = [
  'Hà Nội', 'TP.HCM', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Bình Dương', 'Đồng Nai',
  'Quảng Ninh', 'Khánh Hòa', 'Nghệ An', 'Thừa Thiên Huế', 'Bắc Ninh', 'Khác',
];

export interface Meta<K extends string> { key: K; label: string; tone: string }

export const STAGES: Meta<Stage>[] = [
  { key: 'lead', label: 'Lead', tone: 'yellow' },
  { key: 'contacted', label: 'Đã liên hệ', tone: 'blue' },
  { key: 'consulted', label: 'Đã tư vấn', tone: 'purple' },
  { key: 'quoted', label: 'Đã báo giá', tone: 'orange' },
  { key: 'negotiating', label: 'Đang đàm phán', tone: 'amber' },
  { key: 'pending', label: 'Chờ quyết định', tone: 'sky' },
  { key: 'won', label: 'Chốt đơn', tone: 'green' },
  { key: 'paused', label: 'Tạm dừng', tone: 'gray' },
  { key: 'lost', label: 'Thất bại', tone: 'red' },
];

/** Các stage đang "mở" — còn cơ hội */
export const OPEN_STAGES: Stage[] = ['lead', 'contacted', 'consulted', 'quoted', 'negotiating', 'pending'];

export const LIFECYCLES: Meta<Lifecycle>[] = [
  { key: 'never', label: 'Chưa mua', tone: 'gray' },
  { key: 'first', label: 'Mua lần đầu', tone: 'green' },
  { key: 'returning', label: 'Khách quay lại', tone: 'blue' },
  { key: 'vip', label: 'VIP', tone: 'purple' },
  { key: 'dormant', label: 'Tạm ngưng', tone: 'yellow' },
  { key: 'churned', label: 'Không còn hợp tác', tone: 'red' },
];

export const PRIORITIES: Meta<Priority>[] = [
  { key: 'low', label: 'Thấp', tone: 'gray' },
  { key: 'medium', label: 'Trung bình', tone: 'blue' },
  { key: 'high', label: 'Cao', tone: 'orange' },
  { key: 'urgent', label: 'Khẩn', tone: 'red' },
];

export const ACTIVITY_TYPES = [
  { key: 'call', label: 'Đã gọi' },
  { key: 'email', label: 'Đã gửi Email' },
  { key: 'zalo', label: 'Đã gửi Zalo' },
  { key: 'demo', label: 'Đã Demo' },
  { key: 'workshop', label: 'Đã Workshop' },
  { key: 'meet', label: 'Đã gặp' },
  { key: 'quote', label: 'Đã gửi báo giá' },
  { key: 'contract', label: 'Đã ký hợp đồng' },
  { key: 'delivery', label: 'Đã giao hàng' },
  { key: 'stage', label: 'Chuyển stage' },
  { key: 'other', label: 'Hoạt động khác' },
];

export const stageMeta = (k: Stage) => STAGES.find((s) => s.key === k) ?? STAGES[0];
export const lifecycleMeta = (k: Lifecycle) => LIFECYCLES.find((s) => s.key === k) ?? LIFECYCLES[0];
export const priorityMeta = (k: Priority) => PRIORITIES.find((s) => s.key === k) ?? PRIORITIES[1];
export const activityLabel = (k: string) => ACTIVITY_TYPES.find((a) => a.key === k)?.label ?? k;
