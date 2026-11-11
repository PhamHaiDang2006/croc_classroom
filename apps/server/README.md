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

## Việc cần làm (phần khung chung)

- [ ] Khởi tạo Fastify + TypeScript trong workspace; dùng [`packages/shared`](../../packages/shared/README.md) và [`packages/croc-engine`](../../packages/croc-engine/README.md).
- [ ] Đọc cấu hình từ biến môi trường: tên miền, địa chỉ/cổng/mật khẩu relay, đường dẫn `/data`, các giới hạn ở mục 13.
- [ ] SQLite: tạo các bảng ở mục 9 bằng migration; bật WAL.
- [ ] Middleware: xác thực token phiên, phân quyền theo vai trò (`lecturer` / `student`), giới hạn tần suất.
- [ ] Lấy IP thật của client khi chạy sau Caddy, chỉ tin header từ proxy đã khai báo.
- [ ] Endpoint `/config` trả địa chỉ, mật khẩu relay và các giới hạn, chỉ cho người đã đăng nhập.
- [ ] Lệnh CLI chạy trong container: `create-lecturer`, `reset-lecturer-password`.
- [ ] Log có cấu trúc; **không** ghi code croc, mật khẩu hay token.
- [ ] Dockerfile cài sẵn croc 10.7.0.
- [ ] Endpoint kiểm tra sức khoẻ cho Docker.
