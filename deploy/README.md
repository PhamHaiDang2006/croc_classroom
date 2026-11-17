# deploy

Triển khai trên VPS bằng Docker Compose. Gồm ba dịch vụ: Caddy (HTTPS), server điều phối, và croc relay có mật khẩu.

Thiết kế: mục 5, 7.1, 13 và 14 trong [system-design.md](../docs/system-design.md).

## Trạng thái

Compose, Caddyfile và `.env.example` đã được dựng. Đây là **scaffold**, chưa phải
stack đã triển khai: `apps/server/Dockerfile`, app server và route `/healthz` chưa
có; các biến môi trường server trong Compose cần được C xác nhận theo hợp đồng v1.
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
   `RELAY_PORT_5` và giữ `RELAY_PORTS` đồng nhất. Mở đúng các cổng TCP trên
   firewall và cập nhật cùng giá trị vào cấu hình client/server.
4. Sau khi server image/Dockerfile và hợp đồng biến môi trường có sẵn:

   ```powershell
   docker compose config
   docker compose up -d --build
   docker compose ps
   ```

5. Tạo tài khoản giảng viên bằng CLI trong container theo lệnh C công bố; chưa
   có lệnh CLI được chốt trong repository.

## Dữ liệu, sao lưu và cập nhật

- Dữ liệu ứng dụng lưu ở `deploy/data`; TLS state của Caddy lưu ở
  `deploy/caddy-data` và `deploy/caddy-config`.
- Sao lưu nhất quán SQLite và file bằng cách dừng service server trước khi đóng
  gói dữ liệu, rồi khởi động lại. Thử khôi phục vào môi trường riêng trước khi
  dùng bản sao lưu; không coi việc tạo archive là kiểm chứng khôi phục.
- Cập nhật sau khi có release/image được review:

  ```powershell
  docker compose pull
  docker compose up -d
  docker compose ps
  ```

- Chưa kiểm thử backup/restore, nâng cấp, cấp chứng chỉ hoặc relay từ mạng trường.
  Cần kiểm tra TCP tới cả năm cổng từ mạng trường thật; mô phỏng local không thay
  thế phép thử này.
