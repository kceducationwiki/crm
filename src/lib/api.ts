import type {
  ChildRowMap, ChildTable, Customer, CustomerBase, DocFile, DocMeta, Duplicate, NewChild, Profile,
} from './types';

export interface NewContact { name: string; role: string; email: string; phone: string; zalo: string }

/**
 * Lớp truy cập dữ liệu. Có 2 bản cài đặt:
 *  - httpApi: gọi backend Node + PostgreSQL (server/index.js) — phân quyền kiểm tra ở server
 *  - demoApi: dữ liệu mẫu lưu trên trình duyệt, mô phỏng đúng các luật phân quyền
 */
export interface Api {
  mode: 'server' | 'demo';

  currentProfile(): Promise<Profile | null>;
  onAuthChange(cb: () => void): () => void;
  /** Nếu tài khoản bật 2 bước mà chưa gửi `otp`, sẽ ném lỗi có `needOtp = true` */
  signIn(email: string, password: string, otp?: string): Promise<void>;
  signUp(email: string, password: string, fullName: string, signupCode?: string): Promise<boolean>;
  /** server yêu cầu mã đăng ký nội bộ */
  signupCodeRequired?: boolean;
  signOut(): Promise<void>;
  changePassword(oldPassword: string, newPassword: string): Promise<void>;

  // Xác thực 2 bước (chỉ có khi chạy với server)
  twoFactorSetup?(): Promise<{ secret: string; uri: string }>;
  twoFactorEnable?(code: string): Promise<string[]>;
  twoFactorDisable?(password: string): Promise<void>;
  /** chỉ quản lý: tắt 2 bước giúp người mất điện thoại */
  adminDisableTwoFactor?(id: string): Promise<void>;

  listProfiles(): Promise<Profile[]>;
  updateProfile(id: string, patch: Partial<Pick<Profile, 'full_name' | 'role' | 'is_active'>>): Promise<void>;
  /** chỉ quản lý: đặt lại mật khẩu cho nhân viên */
  resetPassword(id: string, password: string): Promise<void>;

  listCustomers(): Promise<Customer[]>;
  createCustomer(data: CustomerBase, contact?: NewContact): Promise<Customer>;
  updateCustomer(id: string, patch: Partial<CustomerBase>): Promise<void>;
  updateCustomers(ids: string[], patch: Partial<CustomerBase>): Promise<void>;
  deleteCustomers(ids: string[]): Promise<void>;

  addChild<T extends ChildTable>(table: T, row: NewChild<T>): Promise<ChildRowMap[T]>;
  updateChild<T extends ChildTable>(table: T, id: string, patch: Partial<ChildRowMap[T]>): Promise<void>;
  deleteChild(table: ChildTable, id: string): Promise<void>;

  /** Tải 1 tệp hồ sơ / hợp đồng lên, lưu theo khách hàng */
  uploadDocument(customerId: string, file: File, meta: DocMeta): Promise<DocFile>;
  /** Tải tệp về máy */
  downloadDocument(doc: DocFile): void;

  findDuplicates(name: string): Promise<Duplicate[]>;

  /** chỉ bản demo */
  resetDemo?(): void;
  demoAccounts?: { email: string; label: string }[];
}
