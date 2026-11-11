# deploy

Triển khai trên VPS bằng Docker Compose. Gồm ba dịch vụ: Caddy (HTTPS), server điều phối, và croc relay có mật khẩu.

Thiết kế: mục 5, 7.1, 13 và 14 trong [system-design.md](../docs/system-design.md).

## Việc cần làm

- [ ] `docker-compose.yml`:
  - [ ] `caddy`: mở cổng 80 và 443.
  - [ ] `server`: build từ [`apps/server`](../apps/server/README.md), gắn volume `/data`.
  - [ ] `relay`: `croc relay --ports 9009,9010,9011,9012,9013`, mật khẩu lấy từ `CROC_PASS`.
  - [ ] Chính sách `restart: unless-stopped` và healthcheck cho các dịch vụ.
- [ ] `Caddyfile`: reverse proxy HTTPS và WSS tới server; tên miền lấy từ `.env`.
- [ ] `.env.example`: `DOMAIN`, `RELAY_HOST`, `RELAY_PASS`, các giới hạn ở mục 13.
- [ ] Hướng dẫn cài đặt:
  - [ ] Cấu hình VPS tối thiểu: 2 vCPU, 2 GB RAM, 40 GB SSD.
  - [ ] Tên miền: dùng tên miền riêng, hoặc DuckDNS nếu chưa có.
  - [ ] Tường lửa: mở cổng 80, 443 và 9009–9013/TCP.
  - [ ] Tạo tài khoản giảng viên bằng lệnh CLI chạy trong container.
- [ ] **Kiểm tra sớm** xem mạng trường có kết nối được tới các cổng 9009–9013 của VPS không.
  - [ ] Nếu bị chặn, ghi lại cách đổi cổng relay.
- [ ] Sao lưu `/data` (SQLite và file) định kỳ, và ghi lại cách khôi phục.
- [ ] Ghi lại cách cập nhật phiên bản mới (pull rồi `up -d`).
