# deploy

Triển khai trên VPS bằng Docker Compose. Gồm ba dịch vụ: Caddy (HTTPS), server điều phối, và croc relay có mật khẩu.

Thiết kế: mục 5, 7.1, 13 và 14 trong [system-design.md](../docs/system-design.md).

## Trạng thái

Compose, Caddyfile và `.env.example` đã được dựng. Đây là **scaffold**, chưa phải
stack đã triển khai. Nhánh frontend đã thêm `apps/server/Dockerfile` build từ gốc
workspace, chạy bằng user `node` (UID/GID 1000). Hợp đồng vẫn chờ review nhóm.
Image build server và croc-engine, tải croc 10.7.0 Linux x64 có kiểm SHA-256. Worker dùng relay nội bộ qua WORKER_RELAY_ADDRESS, desktop nhận địa chỉ công khai qua RELAY_ADDRESS. Kho file nằm dưới /data/payloads.
Xem [bàn giao D](../docs/handoffs/D.md) và [yêu cầu hợp đồng D](../docs/handoffs/D-contract-requests.md).

## Yêu cầu

- Docker Engine và Docker Compose plugin trên VPS.
- VPS tối thiểu 2 vCPU, 2 GB RAM, 40 GB SSD; dung lượng/băng thông thực tế cần
  xác nhận bằng thử tải.
- Domain trỏ về VPS. Caddy tự cấp TLS cho HTTPS; reverse proxy hỗ trợ WSS.
- Mở TCP 80/443 và TCP các cổng relay đã cấu hình; UDP 443 được mở cho HTTP/3
  của Caddy, không bắt buộc cho croc.

## Cấu hình và khởi động

1. Trong thư mục này, sao chép `.env.example` thành `.env`. `.env`, dữ liệu ứng
   dụng và trạng thái TLS đã được loại khỏi Git bởi `.gitignore` trong thư mục.
2. Điền `DOMAIN`, `RELAY_HOST`, `RELAY_PASS`. Tạo relay password ngẫu nhiên đủ
   mạnh; không commit `.env` và không đưa password vào log.
3. Nếu cần đổi cổng relay, đặt năm cổng liên tiếp trong `RELAY_PORT_1` …
   `RELAY_PORT_5`. Compose dùng cùng các giá trị cho relay và port mapping;
   `RELAY_PORT_1` là cổng điều khiển trong `RELAY_ADDRESS` server trả cho client.
   Mở đúng các cổng TCP trên firewall.
4. Chọn `CADDY_PROXY_SUBNET` không trùng mạng Docker hoặc mạng host; đặt
   `CADDY_PROXY_IP` là địa chỉ khả dụng trong subnet này. Compose gán IP đó cho
   Caddy và cấu hình `TRUST_PROXY` chính xác bằng IP này, không tin toàn bộ subnet.
   Kiểm tra cấu hình IP thực tế và quyền ghi `deploy/data` khi triển khai.
5. Trên VPS Linux, tạo thư mục dữ liệu và cấp quyền cho UID/GID 1000 trước khi chạy
   (chỉ áp dụng cho thư mục dữ liệu mới; kiểm tra ownership trước khi đổi thư mục đã có):

   ```sh
   sudo install -d -o 1000 -g 1000 ./data
   ```

   Build từ workspace qua Compose:

   ```powershell
   docker compose config --quiet
   docker compose up -d --build
   docker compose ps
   ```

6. Tạo tài khoản giảng viên bằng CLI theo [`apps/server/README.md`](../apps/server/README.md).
   `docker compose exec server node apps/server/dist/cli.js create-lecturer --username giangvien --full-name "Giảng viên"`
   (CLI hỏi mật khẩu tương tác; cấu hình DATA_DIR dùng chung với server).
   Không bật `DEV_FAKE_TRANSFERS` trên VPS.

Không in hoặc chia sẻ đầu ra `docker compose config` thông thường: nó chứa mật
khẩu sau khi nội suy. Dùng `--quiet` khi chỉ cần kiểm tra cú pháp.

## Kiểm tra cấu hình

Từ thư mục gốc repo, chạy `node --test tests/e2e/deploy.test.mjs`. Test gọi Docker
Compose CLI với cấu hình và mật khẩu giả; không khởi động container hoặc kiểm
chứng HTTPS, server, relay hay truyền file.

## Dữ liệu, sao lưu và cập nhật

- Dữ liệu ứng dụng lưu ở `deploy/data`; TLS state của Caddy lưu ở
  `deploy/caddy-data` và `deploy/caddy-config`.
- Sao lưu nhất quán SQLite và file bằng cách dừng service server trước khi đóng
  gói dữ liệu, rồi khởi động lại. Thử khôi phục vào môi trường riêng trước khi
  dùng bản sao lưu; không coi việc tạo archive là kiểm chứng khôi phục.
- Cập nhật sau khi có release/image được review:

  ```powershell
  docker compose pull
  docker compose up -d --build
  docker compose ps
  ```

- Relay croc 10.7.0 đã được thử gửi/nhận file qua loopback trên Windows, không dùng
  Docker; chưa kiểm thử backup/restore, nâng cấp, cấp chứng chỉ hoặc relay từ mạng trường.
  Cần kiểm tra TCP tới cả năm cổng từ mạng trường thật; mô phỏng local không thay
  thế phép thử này.
