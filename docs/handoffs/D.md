# Bàn giao vai trò D

- Mốc: M0 — deploy scaffold và yêu cầu hợp đồng
- Branch / commit hoặc PR: chưa tạo
- Phiên bản hợp đồng đang sử dụng: chưa có v1

## Đã làm

- Thêm Docker Compose cho Caddy, server và croc relay 10.7.0.
- Thêm Caddy reverse proxy HTTPS/WSS, cấu hình môi trường mẫu, healthcheck, bind
  mount dữ liệu server và hướng dẫn vận hành.
- Ghi yêu cầu hợp đồng cho phân phối, vé/worker, WebSocket, healthcheck và chính
  sách báo sai hash tại `D-contract-requests.md`.
- Bổ sung cổng vào để kiểm thử cấu hình và E2E sau khi B/C có implementation.

## Giao tiếp

- Compose dự kiến server lắng nghe `0.0.0.0:3000`, lưu dữ liệu dưới `/data`, có
  `GET /healthz`, và đọc các biến cấu hình được liệt kê trong `.env.example`.
- Các yêu cầu trên chưa phải hợp đồng được C chấp thuận; chưa có shared schema hay
  server image thực thi trong repository.

## Kiểm chứng

| Lệnh hoặc kịch bản | Môi trường | Kết quả | Mock hay thật |
|---|---|---|---|
| Đối chiếu image croc 10.7.0, lệnh relay và healthcheck của image | Tài liệu Docker Hub/GitHub công khai | Đã đối chiếu; chưa pull/chạy image | Tài liệu |
| `docker compose -f deploy/docker-compose.yml config --quiet` với biến môi trường kiểm thử | Máy phát triển | Thành công (exit code 0) | Kiểm tra cấu hình |
| `git diff --check` | Worktree hiện tại | Thành công (exit code 0) | Kiểm tra tĩnh |
| `docker run ... caddy validate ...` | Máy phát triển | Chưa chạy được: Docker daemon không hoạt động (`dockerDesktopLinuxEngine` pipe không tồn tại) | Chưa chạy |
| Deploy VPS, HTTPS/WSS, relay từ mạng trường | VPS/domain/mạng trường | Chưa chạy; chưa có server Dockerfile và `.env` thực tế | Chưa chạy |
| E2E đa client | Server, engine và client | Chưa chạy; chưa có implementation | Chưa chạy |

## Cách chạy

Sau khi C cung cấp `apps/server/Dockerfile` và các endpoint/biến cấu hình được
chấp thuận:

1. Sao chép `deploy/.env.example` thành `deploy/.env`, điền domain, relay host và
   mật khẩu relay đủ mạnh.
2. Tại thư mục `deploy`, chạy `docker compose config`, sau đó `docker compose up -d --build`.
3. Tạo tài khoản giảng viên bằng lệnh CLI do C cung cấp.

Không đưa `.env` hoặc bí mật thật vào repository.

## Còn thiếu / đang bị chặn

- `distribution` và `vps-worker` chưa thể triển khai tích hợp: thiếu shared v1,
  REST/WS schema, ticket authority và interface của croc-engine.
- Deploy chưa thể khởi động: `apps/server/Dockerfile`, ứng dụng server và route
  `/healthz` chưa tồn tại.
- Chưa có relay/VPS/mạng trường để kiểm tra cổng, tải, backup/restore hoặc truyền
  LAN thật.
- Chưa có test runner hay client/server E2E để chạy các kịch bản.

## Yêu cầu bên khác

- C: review `D-contract-requests.md`; chốt interface ticket/worker, persistence,
  health endpoint, data/config contract và cung cấp server Dockerfile.
- B: review croc-engine lifecycle, mã croc, hủy/timeout và WS reconnect/correlation.
- C/B/D: chốt chính sách sai hash trước khi triển khai ban/blacklist.
