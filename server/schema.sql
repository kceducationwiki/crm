-- =====================================================================
--  KC CRM — cấu trúc database PostgreSQL
--  Server TỰ ĐỘNG chạy file này mỗi lần khởi động (an toàn chạy nhiều lần),
--  bạn không cần chạy tay.
-- =====================================================================

create table if not exists app_settings (
  key   text primary key,
  value text not null
);
-- Khoá bí mật ký phiên đăng nhập (tự sinh 1 lần, lưu trong DB)
insert into app_settings (key, value)
values ('session_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create table if not exists users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique,
  password_hash  text not null,
  full_name      text not null default '',
  role           text not null default 'staff' check (role in ('admin','staff')),
  is_active      boolean not null default false,
  created_at     timestamptz not null default now()
);

create sequence if not exists customer_code_seq start 1;

create table if not exists customers (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique default ('KH-' || lpad(nextval('customer_code_seq')::text, 6, '0')),
  school_name     text not null,
  school_type     text not null default 'Công lập',
  province        text not null default '',
  district        text not null default '',
  address         text not null default '',
  website         text not null default '',
  fanpage         text not null default '',
  student_count   integer,
  source          text not null default 'Facebook',
  pipeline_stage  text not null default 'lead' check (pipeline_stage in
                  ('lead','contacted','consulted','quoted','negotiating','pending','won','paused','lost')),
  lifecycle       text not null default 'never' check (lifecycle in
                  ('never','first','returning','vip','dormant','churned')),
  expected_value  double precision not null default 0,
  interests       text[] not null default '{}',
  tags            text[] not null default '{}',
  owner_id        uuid references users(id) on delete set null,
  created_by      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists customers_owner_idx on customers(owner_id);

create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  name        text not null,
  role        text not null default '',
  email       text not null default '',
  phone       text not null default '',
  zalo        text not null default '',
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists activities (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  type        text not null default 'call',
  content     text not null,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  text        text not null,
  author_id   uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists follow_ups (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  due_date    date not null,
  content     text not null,
  priority    text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  done        boolean not null default false,
  assignee_id uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists orders (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  code        text not null default '',
  order_date  date not null default current_date,
  amount      double precision not null check (amount >= 0),
  products    text[] not null default '{}',
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists contacts_customer_idx   on contacts(customer_id);
create index if not exists activities_customer_idx on activities(customer_id);
create index if not exists notes_customer_idx      on notes(customer_id);
create index if not exists follow_ups_customer_idx on follow_ups(customer_id);
create index if not exists orders_customer_idx     on orders(customer_id);

-- =====================================================================
--  v2: khách lẻ + pipeline theo ĐƠN HÀNG (cơ hội) + thanh toán / công nợ
--  (các lệnh dưới đây an toàn khi chạy lại nhiều lần)
-- =====================================================================
alter table customers add column if not exists customer_type text not null default 'school';
do $$ begin
  alter table customers add constraint customers_type_chk check (customer_type in ('school','individual'));
exception when duplicate_object then null; end $$;

create sequence if not exists order_code_seq start 1;

-- Đơn cũ (trước v2) đều là đơn đã chốt
alter table orders add column if not exists stage text;
update orders set stage = 'won' where stage is null;
alter table orders alter column stage set default 'lead';
alter table orders alter column stage set not null;
do $$ begin
  alter table orders add constraint orders_stage_chk check (stage in
    ('lead','contacted','consulted','quoted','negotiating','pending','won','paused','lost'));
exception when duplicate_object then null; end $$;

alter table orders add column if not exists paid_amount     double precision not null default 0 check (paid_amount >= 0);
alter table orders add column if not exists invoice_issued  boolean not null default false;
alter table orders add column if not exists docs_received   boolean not null default false;
alter table orders add column if not exists note            text not null default '';
alter table orders alter column code set default ('DH-' || lpad(nextval('order_code_seq')::text, 6, '0'));
create index if not exists orders_stage_idx on orders(stage);

-- Chuyển dữ liệu 1 lần: khách đang ở giai đoạn mở (theo kiểu cũ) mà chưa có đơn → tạo 1 cơ hội tương ứng
do $$ begin
  if not exists (select 1 from app_settings where key = 'migrated_deals_v2') then
    insert into orders (customer_id, order_date, amount, products, stage, created_by)
    select c.id, current_date, c.expected_value, c.interests, c.pipeline_stage, c.owner_id
      from customers c
     where c.pipeline_stage <> 'won'
       and not exists (select 1 from orders o where o.customer_id = c.id);
    insert into app_settings (key, value) values ('migrated_deals_v2', 'done');
  end if;
end $$;

-- =====================================================================
--  v3: xác thực 2 bước (TOTP)
-- =====================================================================
alter table users add column if not exists totp_enabled   boolean not null default false;
alter table users add column if not exists totp_secret    text;
alter table users add column if not exists totp_last_step bigint  not null default 0;
alter table users add column if not exists totp_backup    text[]  not null default '{}';

-- =====================================================================
--  v4: hồ sơ / hợp đồng đính kèm theo khách hàng (tệp lưu ngay trong database)
-- =====================================================================
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  order_id    uuid references orders(id) on delete set null,
  name        text not null,
  kind        text not null default 'other',
  contract_no text not null default '',
  note        text not null default '',
  mime        text not null default 'application/octet-stream',
  size        integer not null,
  data        bytea not null,
  uploaded_by uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists documents_customer_idx on documents(customer_id);
create index if not exists documents_order_idx on documents(order_id);
