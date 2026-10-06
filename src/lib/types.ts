export type Role = 'admin' | 'staff';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  /** đã bật xác thực 2 bước */
  totp_enabled?: boolean;
}

export type Stage =
  | 'lead' | 'contacted' | 'consulted' | 'quoted' | 'negotiating'
  | 'pending' | 'won' | 'paused' | 'lost';

export type Lifecycle = 'never' | 'first' | 'returning' | 'vip' | 'dormant' | 'churned';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface Contact {
  id: string;
  customer_id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  zalo: string;
  is_primary: boolean;
  created_at: string;
}

export interface Activity {
  id: string;
  customer_id: string;
  type: string;
  content: string;
  created_by: string | null;
  created_at: string;
}

export interface Note {
  id: string;
  customer_id: string;
  text: string;
  author_id: string | null;
  created_at: string;
}

export interface FollowUp {
  id: string;
  customer_id: string;
  due_date: string; // yyyy-mm-dd
  content: string;
  priority: Priority;
  done: boolean;
  assignee_id: string | null;
  created_at: string;
}

/**
 * Đơn hàng = cơ hội bán hàng, chạy trên Pipeline.
 * stage 'won' = đã chốt → tính vào doanh thu & số đơn của khách. Các stage khác = đang theo đuổi.
 */
export interface Order {
  id: string;
  customer_id: string;
  code: string;
  order_date: string; // yyyy-mm-dd — ngày tạo; khi chốt sẽ đổi thành ngày chốt
  amount: number;     // giá trị đơn (dự kiến khi chưa chốt)
  products: string[];
  stage: Stage;
  paid_amount: number;      // đã thanh toán
  invoice_issued: boolean;  // đã xuất hoá đơn
  docs_received: boolean;   // đã nhận đủ giấy tờ (HĐ, biên bản…)
  note: string;
  created_by: string | null;
  created_at: string;
}

export type CustomerType = 'school' | 'individual';

export interface CustomerBase {
  customer_type: CustomerType;
  /** Tên trường, hoặc họ tên nếu là khách lẻ */
  school_name: string;
  school_type: string;
  province: string;
  district: string;
  address: string;
  website: string;
  fanpage: string;
  student_count: number | null;
  source: string;
  lifecycle: Lifecycle;
  interests: string[];
  tags: string[];
  owner_id: string | null;
}

export interface Customer extends CustomerBase {
  id: string;
  code: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  contacts: Contact[];
  activities: Activity[];
  notes: Note[];
  follow_ups: FollowUp[];
  orders: Order[];
}

export type ChildTable = 'contacts' | 'activities' | 'notes' | 'follow_ups' | 'orders';

export interface ChildRowMap {
  contacts: Contact;
  activities: Activity;
  notes: Note;
  follow_ups: FollowUp;
  orders: Order;
}

export type NewChild<T extends ChildTable> = Omit<ChildRowMap[T], 'id' | 'created_at'>;

export interface Duplicate {
  code: string;
  school_name: string;
  owner_name: string;
}
