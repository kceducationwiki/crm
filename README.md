# KC CRM — Web quản lý khách hàng có phân quyền

- Giao diện: React + TypeScript + Vite
- Backend: Node.js (`server/index.js`) + **PostgreSQL**, toàn bộ dữ liệu nằm trên server của bạn (Dokploy)
- Đăng nhập bằng email + mật khẩu (mật khẩu được mã hoá scrypt, phiên đăng nhập lưu bằng cookie bảo mật)

## Phân quyền

| | Quản lý tổng (admin) | Nhân viên (staff) |
|---|---|---|
| Xem khách hàng | **Toàn bộ** công ty | Chỉ khách **mình phụ trách** |
| Thêm khách hàng | Gán cho bất kỳ ai | Tự động gán cho chính mình |
| Sửa, ghi chú, follow-up, đơn hàng | Tất cả | Khách của mình |
| Chuyển giao khách cho người khác | ✅ (từng khách hoặc hàng loạt) | ❌ |
| Xoá khách hàng | ✅ | ❌ |
| Duyệt / khoá / cấp quyền / đặt lại mật khẩu | ✅ (mục **Nhân viên**) | ❌ |
| Dashboard | Toàn công ty + hiệu suất từng nhân viên | Số liệu của riêng mình |

Mọi quyền được kiểm tra **ở server** cho từng yêu cầu, nên nhân viên không thể xem dữ liệu của người khác
kể cả khi gọi API trực tiếp. Khoá tài khoản có hiệu lực ngay lập tức.

## Khách hàng, đơn hàng và công nợ

- **Hai loại khách**: *Trường học / Tổ chức* (đầy đủ thông tin trường, người liên hệ) và *Khách lẻ* (chỉ cần họ tên, điện thoại, email, địa chỉ).
- **Pipeline chạy theo ĐƠN HÀNG**: mỗi thẻ trên Kanban là 1 đơn (cơ hội). Một khách có thể có nhiều đơn.
- Kéo đơn sang cột **Chốt đơn** → đơn tự được tính vào *doanh thu* và *số đơn* của khách, tự cập nhật vòng đời
  (Mua lần đầu / Khách quay lại) và ghi vào timeline. Không phải nhập đơn bằng tay lần nữa.
- Mỗi đơn đã chốt theo dõi: **đã thu bao nhiêu – còn nợ bao nhiêu**, **đã xuất hoá đơn**, **đã nhận đủ giấy tờ**.
  Đơn *Hoàn tất* = thu đủ + có hoá đơn + đủ giấy tờ.
  Đơn hoàn tất tự rời khỏi Pipeline (vẫn xem được ở trang Đơn hàng & công nợ và trong chi tiết khách).
- Trang **Đơn hàng & công nợ**: lọc nhanh đơn còn nợ / chưa xuất hoá đơn / thiếu giấy tờ, tổng công nợ phải thu, xuất CSV.

- Người đăng ký **đầu tiên** tự động là Quản lý tổng.
- Người đăng ký sau là Nhân viên ở trạng thái **Chờ duyệt** → Quản lý bấm **Duyệt**.
- Nhân viên quên mật khẩu → Quản lý vào **Nhân viên → Mật khẩu** để đặt lại.

---

## Giao hàng thành công

Đơn đã chốt có nút **Giao hàng thành công** (trong thẻ đơn ở tab Đơn hàng của khách, trang Đơn hàng & công nợ, và trên thẻ ở cột "Chốt đơn" của Pipeline). Bấm vào là ghi nhận **ngày hôm đó** là ngày giao; **công nợ tính từ ngày này** — sau 10 ngày chưa thu đủ tiền thì nhân viên phụ trách nhận nhắc nợ.

- Giao từ hôm trước mới nhập: bấm ✏️ Sửa đơn → đổi "Ngày giao hàng". Bấm nhầm: bấm **Huỷ** cạnh dòng "Đã giao hàng".
- Đơn chỉ **Hoàn tất** (tự rời Pipeline) khi đã giao + thu đủ + xuất hoá đơn + đủ giấy tờ.
- Khi nâng cấp lên bản này, các đơn đã chốt từ trước được coi như đã giao vào ngày chốt (để nhắc nợ cũ không bị mất) — đơn nào chưa giao thật thì vào sửa / huỷ.

## Hồ sơ / hợp đồng theo khách hàng

Mở khách hàng → tab **Hồ sơ** để tải lên hợp đồng, biên bản nghiệm thu, thanh lý, hoá đơn, báo giá… (tối đa 20 MB/tệp, chọn nhiều tệp một lần được).

- Mỗi tệp ghi được **loại**, **số hợp đồng**, **đơn hàng liên quan** và ghi chú; sửa lại sau cũng được.
- Khi khách có đơn mới: vào tab Hồ sơ, bấm **Tải về** bộ cũ, sửa số hợp đồng / thông tin đơn rồi tải bản mới lên.
- Tệp gắn với đơn nào sẽ hiện ngay dưới đơn đó ở tab Đơn hàng.
- Quyền xem giống khách hàng: nhân viên chỉ thấy hồ sơ của khách mình phụ trách, quản lý thấy tất cả.
- Tệp được lưu **trong database** (bảng `documents`), nên backup database là backup luôn hồ sơ — và dung lượng backup sẽ tăng theo số tệp.

## Thông báo nhắc việc (email / Zalo)

Mỗi sáng (mặc định 8h, giờ Việt Nam) mỗi người nhận **1 tin tổng hợp**:

- **Follow-up** đến hạn hôm nay hoặc đã trễ (chưa đánh dấu xong).
- **Công nợ**: đơn đã **giao hàng thành công** được **10 / 20 / 25 / 30 ngày** mà chưa thu đủ tiền. Đơn chưa bấm "Giao hàng thành công" thì chưa nhắc nợ.
- **Hoá đơn / giấy tờ**: đơn đã **chốt** được 10 / 20 / 25 / 30 ngày mà chưa xuất hoá đơn hoặc chưa đủ giấy tờ.
- Sau mốc cuối, nhắc lại mỗi 7 ngày tới khi xong. Mỗi mốc của mỗi đơn chỉ nhắc 1 lần; thu đủ / xuất hoá đơn / đủ giấy tờ thì thôi nhắc phần đó.
- Nhân viên nhận việc của khách mình phụ trách. Quản lý nhận của toàn bộ khách, kèm tên nhân viên (tắt được).

Quản lý đổi giờ gửi, các mốc ngày và chu kỳ nhắc lại trong **Cài đặt → Thông báo nhắc việc**. Mỗi người tự bật / tắt email, kết nối Zalo, bấm **Gửi tin thử** và **Xem trước nhắc hôm nay** ở đó.

### Bật email

Thêm biến môi trường trên Dokploy (tab Environment) rồi Deploy lại. Ví dụ với Gmail / Google Workspace:

```
APP_URL=https://crm.kcedu.vn
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=crm@kcedu.vn
SMTP_PASS=<mật khẩu ứng dụng 16 ký tự>
SMTP_FROM=KC CRM <crm@kcedu.vn>
```

`SMTP_PASS` **không** phải mật khẩu đăng nhập Gmail. Bật xác minh 2 bước cho tài khoản Google đó, rồi vào myaccount.google.com → Bảo mật → **Mật khẩu ứng dụng** để tạo. Nên dùng 1 hộp thư riêng cho hệ thống (vd. crm@…). Mail công ty khác: hỏi bên cung cấp host / cổng (465 hoặc 587).

### Bật Zalo

1. Vào https://bot.zaloplatforms.com, đăng nhập Zalo, tạo bot (vd. "KC CRM nhắc việc") và copy **Bot Token**.
2. Thêm `ZALO_BOT_TOKEN=<token>` (và `APP_URL=https://crm.kcedu.vn`) trên Dokploy rồi Deploy lại. Server tự đăng ký webhook `https://crm.kcedu.vn/api/zalo/webhook`.
3. Mỗi người: **Cài đặt → Thông báo → Kết nối Zalo** → nhắn mã `KC-XXXXXX` cho bot trong 15 phút → bot trả lời "Đã kết nối".

Chạy trên máy (không có https) thì server tự hỏi Zalo mỗi vài giây thay cho webhook — vẫn kết nối được bình thường.

## Deploy lên Dokploy

Cần 2 service trong cùng 1 project Dokploy: **PostgreSQL** (lưu dữ liệu) và **Application** (web).

### Bước 1 — Tạo database PostgreSQL

1. Dokploy → **Projects** → chọn/tạo project (VD `kc-crm`) → **Create Service → Database → PostgreSQL**.
2. Đặt: Name `kc-crm-db`, Database Name `kccrm`, Database User `kccrm`, Password: một mật khẩu mạnh.
   (Chọn Docker image `postgres:16` nếu được hỏi.)
3. Bấm **Create**, rồi **Deploy**.
4. Trong trang database, copy **Internal Connection URL**, dạng:
   `postgresql://kccrm:matkhau@kc-crm-db-xxxx:5432/kccrm`
   ⚠️ **Không** bật "External Port" — database chỉ cần app bên trong truy cập, để kín an toàn hơn.

### Bước 2 — Tạo ứng dụng web

1. Đẩy thư mục code này lên GitHub / GitLab / Gitea (repo private được).
2. Cùng project → **Create Service → Application**, đặt tên `kc-crm`.
3. Tab **General**:
   - **Provider**: GitHub (hoặc Git) → chọn repo, branch `main`.
   - **Build Type**: `Dockerfile` (Docker File: `Dockerfile`, Build Path: `/`) → **Save**.
4. Tab **Environment** → dán rồi **Save**:
   ```
   DATABASE_URL=postgresql://kccrm:matkhau@kc-crm-db-xxxx:5432/kccrm
   ```
   (dán đúng Internal Connection URL ở Bước 1)
5. Tab **Domains** → **Add Domain**: tên miền (VD `crm.kidscode.vn`), **Container Port = 3000**,
   bật **HTTPS** + **Let's Encrypt**. Ở nơi quản lý tên miền, tạo bản ghi **A** trỏ về IP server.
   Chưa có tên miền thì dùng nút tạo domain `*.traefik.me` miễn phí để test.
6. Bấm **Deploy**. Xem log ở tab **Logs**, thấy dòng `✅ KC CRM đang chạy` là xong.
   Bảng dữ liệu được **tự động tạo** ở lần chạy đầu, không phải chạy SQL tay.
7. Mở web → **Đăng ký** tài khoản đầu tiên → tài khoản này là **Quản lý tổng**.

Tuỳ chọn: bật **Auto Deploy** để mỗi lần push code Dokploy tự build lại. Dữ liệu nằm trong database
nên deploy lại app không mất dữ liệu.

### Bước 3 — Bật backup tự động (rất nên làm)

Dữ liệu nằm trên server của bạn, server hỏng là mất. Dokploy backup database ra kho lưu trữ S3:

1. Tạo kho lưu trữ: Cloudflare R2 (miễn phí 10 GB), Backblaze B2, AWS S3… → lấy Access Key, Secret Key, Bucket, Endpoint.
2. Dokploy → **Settings → S3 Destinations** → **Add** → điền thông tin → **Test** → **Create**.
3. Vào database `kc-crm-db` → tab **Backups** → **Create Backup**: chọn Destination, Database `kccrm`,
   lịch `0 2 * * *` (2 giờ sáng mỗi ngày), bật **Enabled**.
4. Bấm **Test/Run** 1 lần để chắc chắn file backup xuất hiện trong bucket.

---

## Chạy trên máy tính (để thử / phát triển)

Cần [Node.js](https://nodejs.org) 20+.

**Chỉ xem giao diện (dữ liệu demo, không cần database):**
```bash
npm install
npm run dev
```
Mở http://localhost:5173 → bấm **Đăng nhập nhanh** Quản lý / Nhân viên.

**Chạy đầy đủ với PostgreSQL:**
```bash
docker run -d --name kc-pg -e POSTGRES_USER=kccrm -e POSTGRES_PASSWORD=matkhau -e POSTGRES_DB=kccrm -p 5432:5432 postgres:16
cp .env.example .env          # sửa DATABASE_URL nếu cần
npm run dev:server            # cửa sổ 1: backend cổng 3000
npm run dev                   # cửa sổ 2: giao diện cổng 5173
```

**Chạy thử bản Docker giống trên Dokploy:**
```bash
docker build -t kc-crm .
docker run -p 3000:3000 -e DATABASE_URL=postgresql://kccrm:matkhau@host.docker.internal:5432/kccrm kc-crm
```

---

## Quản trị thường gặp

- **Thêm nhân viên**: gửi link web → nhân viên bấm Đăng ký → Quản lý vào **Nhân viên** bấm **Duyệt**.
- **Nhân viên nghỉ việc**: bấm **Khoá** → vào **Khách hàng**, lọc theo tên người đó → chọn tất cả → **Gán cho nhân viên** mới.
- **Thêm quản lý**: đổi vai trò thành **Quản lý tổng** trong mục Nhân viên.
- **Lỡ mất quyền quản lý / quên mật khẩu quản lý**: vào Dokploy → database → tab **Terminal** (hoặc dùng psql), chạy:
  ```sql
  update users set role = 'admin', is_active = true where email = 'email@cua-ban.vn';
  ```
  Quên mật khẩu admin: nhờ một quản lý khác đặt lại, hoặc xoá dòng user đó và đăng ký lại với cùng email
  (`delete from users where email = '...'` — khách hàng của người đó sẽ thành "Chưa gán", không mất dữ liệu).

## Bảo mật khi đưa lên mạng — checklist

Đã có sẵn trong code: mật khẩu mã hoá (scrypt), phiên đăng nhập bằng cookie HttpOnly/Secure, kiểm tra quyền ở server
cho mọi yêu cầu, chống CSRF, giới hạn đăng nhập sai (10 lần / 15 phút / IP), CSP, không cho Google lập chỉ mục.

**Xác thực 2 bước:** mỗi người tự bật trong **Cài đặt → Xác thực 2 bước** (quét mã QR bằng Google Authenticator /
Microsoft Authenticator). Tài khoản quản lý chưa bật sẽ thấy cảnh báo trên Dashboard. Mất điện thoại: dùng 1 trong 8 mã
dự phòng, hoặc nhờ quản lý khác bấm **Tắt 2 bước** ở mục Nhân viên. Quản lý duy nhất mà mất cả điện thoại lẫn mã dự phòng
thì chạy trong database: `update users set totp_enabled = false, totp_secret = null where email = 'email@cua-ban.vn';`

Việc BẠN cần làm trên Dokploy:

1. **Bắt buộc HTTPS** (Let's Encrypt trong tab Domains). Không dùng http thường.
2. **Đặt `SIGNUP_CODE`** trong Environment — người lạ có link cũng không tạo được tài khoản.
3. **Không mở External Port cho PostgreSQL.** Database chỉ để app nội bộ truy cập.
4. **Mật khẩu mạnh** cho tài khoản quản lý, cho Dokploy và cho database (≥ 12 ký tự, không dùng lại ở nơi khác).
5. **Bật backup** database ra S3/R2 (bucket để chế độ private).
6. **Khoá tài khoản ngay** khi nhân viên nghỉ việc (mục Nhân viên → Khoá).
7. Cập nhật Dokploy và hệ điều hành server định kỳ; chỉ mở cổng 80, 443 và SSH (SSH nên dùng key, tắt đăng nhập bằng mật khẩu).

Muốn chắc hơn nữa (tuỳ chọn): đặt web sau **Cloudflare Access** hoặc VPN (Tailscale/WireGuard) để chỉ người trong công ty mở được trang đăng nhập.

## Biến môi trường

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | ✅ | Chuỗi kết nối PostgreSQL |
| `PORT` | | Cổng server, mặc định `3000` |
| `SESSION_SECRET` | | Khoá ký phiên đăng nhập. Bỏ trống = tự sinh & lưu trong DB. Đổi giá trị = đăng xuất tất cả mọi người |
| `SIGNUP_CODE` | nên đặt | Mã đăng ký nội bộ. Có đặt → form Đăng ký yêu cầu nhập mã này |
| `DATABASE_SSL` | | `true` nếu dùng database bên ngoài yêu cầu SSL |
| `APP_URL` | | Địa chỉ web, vd. `https://crm.kcedu.vn` — dùng cho link trong tin nhắc và webhook Zalo |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | | Gửi email nhắc việc (xem mục Thông báo nhắc việc). Cổng 465 dùng TLS, cổng 587 dùng STARTTLS (tự động) |
| `ZALO_BOT_TOKEN` | | Token Zalo Bot để gửi nhắc qua Zalo |

## Cấu trúc code

```
server/index.js          Backend: API, đăng nhập, kiểm tra phân quyền, phục vụ giao diện
server/schema.sql        Cấu trúc bảng (tự chạy khi server khởi động)
server/db.js             Kết nối PostgreSQL
server/notify.js         Nhắc việc: gửi email (SMTP) và Zalo Bot, lịch gửi hằng ngày
src/lib/httpApi.ts       Giao diện gọi API backend
src/lib/demoApi.ts       Dữ liệu demo (khi không có backend)
src/lib/constants.ts     Danh mục: giai đoạn, lifecycle, sản phẩm, tỉnh… (sửa ở đây)
src/lib/deals.ts         Logic chốt đơn (cập nhật doanh thu, vòng đời, timeline)
src/components/OrderCard.tsx  Thẻ đơn hàng: thanh toán, công nợ, hoá đơn, giấy tờ
src/pages/               Các trang giao diện
src/styles.css           Giao diện (màu sắc ở đầu file)
Dockerfile               Đóng gói cho Dokploy
```
