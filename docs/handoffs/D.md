# Bàn giao vai trò D

- Mốc: M0 — review v1, deploy scaffold và chuẩn bị kiểm thử
- Branch / commit hoặc PR: `D_role`, dựa trên merge `8ece671`; thay đổi mới chưa commit
- Phiên bản hợp đồng đang sử dụng: v1 đề xuất của C, chưa được các bên review/chốt

## Đã làm

- Cập nhật Docker Compose dùng `/health`, `RELAY_ADDRESS`, `LIMIT_*` theo server C;
  cố định IP Caddy trên mạng proxy và chỉ tin IP đó qua `TRUST_PROXY`.
- Cập nhật tài liệu deploy, kịch bản kiểm thử vé/worker và test cấu hình Compose.
- Review đề xuất v1 và ghi các vấn đề cần C/B thống nhất vào `D-contract-requests.md`:
  callback upload cũ, giữ phiên bản khi thu, xoá bài, reconnect và chính sách relay.
- Chưa code distribution/worker vì hợp đồng cần review; chưa có engine croc thật của B.

## Giao tiếp

- Compose dùng server `0.0.0.0:3000`, `/data`, `GET /health`, `RELAY_ADDRESS`,
  `RELAY_PASS`, `TRUST_PROXY` và `LIMIT_*` theo cấu hình server C hiện tại.
- C đã cung cấp interface vé/worker, session, schema v1 và khung croc-engine cùng
  loopback giả. Croc-engine do B quản lý; chưa có phê duyệt review hoặc engine thật.

## Kiểm chứng

| Lệnh hoặc kịch bản | Môi trường | Kết quả | Mock hay thật |
|---|---|---|---|
| Đối chiếu image croc 10.7.0, lệnh relay và healthcheck của image | Tài liệu Docker Hub/GitHub công khai | Đã đối chiếu; chưa pull/chạy image | Tài liệu |
| `node --test tests/e2e/deploy.test.mjs` | Windows, Node 22 + Docker Compose CLI | 3 test đạt: health/config, port mapping, thiếu password | Kiểm tra cấu hình; không chạy container |
| croc 10.7.0, relay loopback, `send --no-local` và receive, so SHA-256 | Windows; binary release kiểm tra SHA-256 | Gửi/nhận một file giả thành công; relay và client đã dừng | Relay thật cục bộ; không qua Docker/VPS |
| `npm test -- packages/croc-engine/test/loopback.test.ts apps/server/test/fake-ticket-issuer.test.ts apps/server/test/submissions.test.ts` | Windows, Node 24.11.1 | 3 file, 26 test đạt | Engine/vé giả; test do B/C cung cấp, không phải implementation D |
| `npm run lint`, `npm run typecheck`, `npm run build` | Windows, Node 24.11.1 | Đạt | Workspace hiện tại |
| `npm ci` | Windows, Node 24.11.1 / npm 11.6.2 | Lỗi: native rebuild cần Visual Studio C++; sau đó dùng `npm install --ignore-scripts --no-save --package-lock=false` và test trên chạy được | Khôi phục dependency, không thay lockfile |
| Docker daemon / Caddy validate | Windows | Không kết nối được daemon `dockerDesktopLinuxEngine` | Chưa chạy |
| Deploy VPS, HTTPS/WSS, relay từ mạng trường | VPS/domain/mạng trường | Chưa chạy; chưa có server Dockerfile và môi trường thực tế | Chưa chạy |
| E2E đa client | Server, engine và client | Chưa chạy; chưa có implementation | Chưa chạy |

## Cách chạy

Sau khi C cung cấp `apps/server/Dockerfile` tương thích workspace:

1. Sao chép `deploy/.env.example` thành `deploy/.env`, điền domain, relay host và
   mật khẩu relay đủ mạnh.
2. Chọn subnet proxy không xung đột và địa chỉ Caddy trong subnet đó.
3. Tại thư mục `deploy`, chạy `docker compose config --quiet`, sau đó `docker compose up -d --build`.
4. Tạo tài khoản giảng viên theo hướng dẫn CLI của C.

Không đưa `.env` hoặc bí mật thật vào repository.

## Còn thiếu / đang bị chặn

- `distribution` và `vps-worker` chưa thể triển khai phụ thuộc: v1 có định nghĩa
  nhưng chưa được review; race upload, thu/xoá và chính sách relay còn chờ C/B.
- Deploy chưa thể khởi động: `apps/server/Dockerfile` chưa tồn tại, Docker daemon
  máy hiện tại không hoạt động.
- Chưa có VPS/mạng trường để kiểm tra cổng, tải, backup/restore hoặc truyền LAN thật.
- Chưa có client/engine thật và test E2E để chạy các kịch bản của ứng dụng.
- `npm install` báo 11 high trong dependency audit; chưa phân tích chi tiết, cần C
  xem xét theo quy trình quản lý dependency; không tự chạy `npm audit fix`.

## Yêu cầu bên khác

- C: review `D-contract-requests.md`; chốt callback upload, đồng bộ thu/xoá,
  ticket/worker và cung cấp server Dockerfile cùng quyền ghi volume.
- B: review croc-engine lifecycle, mã croc, hủy/timeout và WS reconnect/correlation.
- C/B/D: chốt chính sách sai hash trước khi triển khai ban/blacklist.
