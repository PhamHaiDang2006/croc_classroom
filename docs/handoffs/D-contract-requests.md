# Yêu cầu hợp đồng của vai trò D

- Mốc: M0 prerequisite cho distribution, VPS worker và deploy
- Trạng thái: đề xuất, chưa được C/B review hoặc chấp thuận
- Phiên bản hợp đồng: chưa có v1

## 1. Quyền xác nhận và vòng đời vé

- Hiện tại: thiết kế mô tả `POST /tickets/:id/result`, các thông điệp WS kết quả
  và trạng thái vé, nhưng chưa quy định ai là nguồn sự thật hoặc cách chống kết quả lặp.
- Đề xuất: mỗi vé có ID ổn định và chuyển trạng thái idempotent; worker là bên duy
  nhất xác nhận upload đề/nộp bài đã lưu trên VPS sau khi xác minh manifest. Với
  `phat_de` và `gv_thu_bai`, client nhận xác nhận hoàn tất sau khi xác minh ở phía
  nhận; lời báo thành công của client không được thay cho xác minh của worker.
- Bên ảnh hưởng: C (REST, DB, quyền), B (engine/client), D (worker, queue).
- Tương thích/migration: chốt trước khi có schema/ticket implementation; không
  thay endpoint hoặc payload đã triển khai.
- Kiểm chứng: gửi lặp cùng kết quả không tăng version/giải phóng slot hai lần;
  kết quả sai vai trò bị từ chối; restart không làm vé hoàn tất giả.

## 2. Vé truyền và worker

- Hiện tại: module cần yêu cầu worker mở lượt nhận/gửi, nhưng chưa có interface
  giữa assignments/submissions/distribution và worker hoặc croc-engine.
- Đề xuất: C, B, D thống nhất schema request/result có `ticketId`, loại vé, bên
  gửi/nhận, assignment/submission version, manifest/dung lượng, hạn UTC và nguồn
  relay; code croc chỉ trả về tiến trình liên quan, không lưu trong DB hay log.
  Worker chỉ đưa file từ vùng tạm vào kho sau khi giới hạn dung lượng và manifest
  hợp lệ; commit kho phải nguyên tử và có thể truy vấn trạng thái sau reconnect.
- Bên ảnh hưởng: C (orchestration/DB), B (croc-engine), D (worker).
- Tương thích/migration: xác định API nội bộ và trạng thái vé cùng lúc với shared
  v1; không tạo DTO riêng trong D.
- Kiểm chứng: upload hợp lệ, hash sai, vượt dung lượng, hết hạn, hủy, gửi lại
  lệnh cùng ticket ID, restart khi đang truyền; không để file dở dang trong kho.

## 3. WebSocket, nguồn phát và hàng đợi

- Hiện tại: các tên sự kiện đã được liệt kê nhưng chưa có envelope, correlation,
  heartbeat, đồng bộ lại, hoặc ngữ nghĩa timeout/queue.
- Đề xuất: mỗi request/response có correlation theo ticket ID; server là nguồn sự
  thật cho lease/slot và là nơi duy nhất cấp hoặc hủy vé. `serve.accept` phải gắn
  đúng ticket và có deadline; timeout/disconnect/hủy giải phóng lease đúng một lần.
  Reconnect phải đồng bộ trạng thái/hủy cũ trước khi announce seed lại.
- Bên ảnh hưởng: B (WS client), C (auth/session), D (distribution).
- Tương thích/migration: chốt event schema và chính sách reconnect trong shared v1
  trước khi A/B/C/D triển khai consumer.
- Kiểm chứng: LAN cùng public IP và subnet, CGNAT khác subnet, VPS đầy, hàng đợi
  FIFO, accept trễ, disconnect, restart, sự kiện trùng và hủy đồng thời.

## 4. Báo cáo sai hash và loại nguồn

- Hiện tại: system design đề xuất cấm nguồn khi client báo sai hash; contracts.md
  ghi rõ chưa chốt và cảnh báo không cấm chỉ dựa trên cáo buộc chưa xác minh.
- Đề xuất: không cấm nguồn chỉ từ một báo cáo client. Ghi nhận kết quả và bằng
  chứng; chỉ áp dụng trạng thái loại/cấm theo chính sách được C/B/D review, có
  phân biệt lỗi truyền, lỗi xác minh độc lập và nguồn gửi sai dữ liệu.
- Bên ảnh hưởng: C (lưu trạng thái), B (xác minh ở client), D (chọn nguồn).
- Tương thích/migration: quyết định trước khi bật chính sách `banned` trong
  distribution; cập nhật system-design/contracts sau khi được duyệt.
- Kiểm chứng: client báo sai nhưng manifest hợp lệ không tự cấm nguồn; lỗi truyền
  không bị ghi nhầm là cố ý; nguồn bị loại được chọn fallback theo chính sách.

## 5. Deploy và healthcheck

- Hiện tại: deploy cần healthcheck server, relay và proxy nhưng endpoint health của
  server chưa có tên trong hợp đồng.
- Đề xuất: server công bố `GET /healthz` chỉ cho biết tiến trình phục vụ request;
  không trả secret/config. Compose dùng endpoint này làm healthcheck. Relay dùng
  healthcheck TCP của image croc; Caddy healthcheck đọc admin API nội bộ.
- Cần C xác nhận user/UID của container và quyền ghi `/data`; deploy dùng bind
  mount để sao lưu file và SQLite thuận tiện.
- Bên ảnh hưởng: C (server route), D (Compose/ops).
- Tương thích/migration: thêm endpoint không phá vỡ API hiện tại; xác nhận port
  nội bộ server và đường dẫn trước khi chốt Dockerfile.
- Kiểm chứng: cấu hình sai/tiến trình dừng được phát hiện; health response không
  tiết lộ relay password, token hoặc đường dẫn dữ liệu.

## Review cần thiết

| Reviewer | Phạm vi | Trạng thái |
|---|---|---|
| C | REST, DB, ticket authority, health endpoint, trạng thái chia sẻ | Chưa review |
| B | croc-engine, WS client, xác minh/tiến trình | Chưa review |
| D | worker, queue, relay, deploy, E2E | Đề xuất |
