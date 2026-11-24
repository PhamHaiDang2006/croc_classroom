# apps/server

Server điều phối chạy trên VPS. Server lo tài khoản, bài tập, cấp vé, chọn nguồn phát, bài nộp, và điều khiển croc trên VPS.
Server **không** tự truyền nội dung file qua HTTP. Mọi file đi bằng croc.

Thiết kế: mục 5, 7, 8, 9, 10 và 11 trong [system-design.md](../../docs/system-design.md).

## Các module

| Module | Việc |
|---|---|
| [`src/accounts`](src/accounts/README.md) | Đăng nhập, phiên, kích hoạt, nhập danh sách sinh viên |
| [`src/assignments`](src/assignments/README.md) | Bài tập, code phrase, manifest, thống kê |
| [`src/distribution`](src/distribution/README.md) | Vé, chọn nguồn (phương án A), seeder online, WebSocket |
| [`src/submissions`](src/submissions/README.md) | Nộp bài, biên nhận, giảng viên thu bài |
| [`src/vps-worker`](src/vps-worker/README.md) | Chạy croc trên VPS, kho file `/data` |

## Cấu trúc khung (M0)

| Đường dẫn | Việc |
|---|---|
| `src/index.ts` | Đọc cấu hình, mở CSDL, migrate, listen, tắt êm khi SIGTERM |
| `src/app.ts` | `buildApp()`: Fastify, xử lý lỗi theo hợp đồng, nhận `modules` đăng ký route |
| `src/config.ts` | Biến môi trường → `ServerConfig` (mẫu: [`.env.example`](.env.example)) |
| `src/db/` | Mở SQLite (WAL, khoá ngoại), migration trong `migrations.ts` |
| `src/http/route.ts` | `registerEndpoint()`: xác thực, phân quyền, kiểm tra đầu vào/đầu ra theo `endpoints` của shared |
| `src/http/errors.ts` | `AppError` / `appError()` với mã lỗi hợp đồng |
| `src/ports/` | Interface nội bộ: phiên (`SessionResolver`), vé/worker (`TicketIssuer`, `TransferOutcomeHandler`), đồng hồ |
| `src/testing/` | `FakeTicketIssuer` cho test nghiệp vụ |

Module mới export một `RouteModule` và được thêm vào `buildApp({ modules })` trong `index.ts`.

Đã gắn: `accounts` (M1), `assignments` (M2), `submissions` (M3). `src/outcomes.ts` ghép
`TransferOutcomeHandler` với worker thật. Mặc định server mở dịch vụ vé REST, WebSocket và kho file trong DATA_DIR/payloads. Chạy croc 10.7.0 từ CROC_BINARY, binary đã tải trong workspace, hoặc PATH. Đặt `DEV_FAKE_TRANSFERS=true` để dùng vé giả,
mọi lượt truyền tự "thành công" (chỉ để thử giao diện; log cảnh báo khi khởi động).

## Việc cần làm (phần khung chung)

- [x] Khởi tạo Fastify + TypeScript trong workspace; dùng [`packages/shared`](../../packages/shared/README.md). (croc-engine dùng ở vps-worker — D.)
- [x] Đọc cấu hình từ biến môi trường: địa chỉ/mật khẩu relay, thư mục dữ liệu, các giới hạn ở mục 13. (Tên miền thuộc deploy — D.)
- [x] SQLite: tạo các bảng ở mục 9 bằng migration; bật WAL.
- [x] Middleware:
  - [x] Đọc token Bearer, phân quyền theo vai trò (`lecturer` / `student`) trong `registerEndpoint`.
  - [x] Tra phiên thật trong bảng `sessions` (`accounts/sessions.ts`).
  - [x] Giới hạn tần suất đăng nhập, kích hoạt (`http/rate-limit.ts`); nhập code phrase dùng lại ở M2.
- [x] Lấy IP thật của client khi chạy sau Caddy, chỉ tin proxy khai báo trong `TRUST_PROXY`.
- [x] Endpoint `/config` trả địa chỉ, mật khẩu relay và các giới hạn, chỉ cho người đã đăng nhập.
- [x] Lệnh CLI chạy trong container: `create-lecturer`, `reset-lecturer-password` (`src/cli.ts`).

### Lệnh CLI

Mật khẩu không truyền qua tham số: có bàn phím thì nhập ẩn hai lần, không có thì đọc dòng đầu của stdin.

```bash
npm run cli -w @croc-classroom/server -- create-lecturer --username giangvien --full-name "Nguyễn Văn Giảng"
```

```bash
npm run cli -w @croc-classroom/server -- reset-lecturer-password
```

Trong container: `node dist/cli.js <lệnh>` với `DATA_DIR=/data`.
- [x] Log có cấu trúc (pino); không ghi header Authorization, che các trường `password`, `token`, `crocCode`.
- [ ] Dockerfile cài sẵn croc 10.7.0 (phối hợp D).
- [x] Endpoint kiểm tra sức khoẻ cho Docker: `GET /health`.
