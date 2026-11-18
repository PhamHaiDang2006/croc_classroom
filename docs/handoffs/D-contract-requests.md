# Yêu cầu hợp đồng của vai trò D

- Mốc: review đề xuất v1 sau khi tích hợp C/Backend
- Trạng thái: đã đọc và nêu điểm cần làm rõ; chưa được C/B review hoặc chấp thuận
- Phiên bản hợp đồng: v1 đề xuất, chưa được các bên sử dụng chốt

Những mục dưới đây là yêu cầu review/đề xuất, không thay schema hoặc cho phép
triển khai phần phụ thuộc trước khi C/B và D thống nhất.

## 1. Quyền xác nhận và vòng đời vé

- Hiện tại: `contracts.md` v1 đã quy định nguồn xác nhận theo loại vé, trạng thái
  cuối và xử lý lặp. Cần review việc thực thi khi worker hoàn tất đồng thời với
  huỷ, hết hạn, xin lại vé hoặc xoá bài.
- Đề xuất: mỗi vé có ID ổn định và chuyển trạng thái idempotent; worker là bên duy
  nhất xác nhận upload đề/nộp bài đã lưu trên VPS sau khi xác minh manifest. Với
  `phat_de` và `gv_thu_bai`, client nhận xác nhận hoàn tất sau khi xác minh ở phía
  nhận; lời báo thành công của client không được thay cho xác minh của worker.
- Bên ảnh hưởng: C (REST, DB, quyền), B (engine/client), D (worker, queue).
- Tương thích/migration: chốt trước khi có schema/ticket implementation; không
  thay endpoint hoặc payload đã triển khai.
- Kiểm chứng: gửi lặp cùng kết quả không tăng version/giải phóng slot hai lần;
  kết quả sai vai trò bị từ chối; restart không làm vé hoàn tất giả.

### Upload đề bị thay hoặc hết hạn

- Hiện tại: `AssignmentsService.onUploadStored` nhận `ticketId` nhưng chỉ cập nhật
  theo `assignmentId` và trạng thái bài; không kiểm tra vé còn chạy/khớp. Interface
  trả `void`, nên D không biết callback được chấp nhận hay bài đã xoá/đã phát hành.
- Đề xuất C/D review: xác minh vé đúng loại/bài và còn hiệu lực, cùng việc phát
  hành và kết thúc vé trong transaction; trả kết quả phân biệt đã commit, gọi lặp
  cùng lượt và vé không còn hợp lệ. D chỉ gửi sự kiện/ghi holdings khi có xác nhận
  phù hợp và dọn file không được chấp nhận.
- Ảnh hưởng/migration: C sửa service, D dùng kết quả; thay interface v1 trước khi
  các bên triển khai. Chưa có worker thật cần migration dữ liệu.
- Test: vé A bị vé B thay hoặc hết hạn trước callback A; callback trùng; xoá bài
  đồng thời; vé sai loại/bài; không phát hành hoặc báo thành công sai.

## 2. Vé truyền và worker

- Hiện tại: C đã đề xuất `TicketIssuer`, `TransferOutcomeHandler`, `SeedingStats`
  và B có `CrocEngine` interface/loopback. Các interface chưa được B/C/D review.
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

### Giữ phiên bản đang thu và xoá bài đồng thời

- Hiện tại: `collect` đọc `storageRef` rồi gọi `openCollect` bất đồng bộ; commit
  bài mới trả `supersededStorageRefs`. `purgeAssignment` hoàn tất trước khi C xoá
  bản ghi bài. Hợp đồng chưa chỉ rõ cách tránh mở vé/commit mới trong các khoảng
  này, hoặc cách phục hồi việc dọn file sau restart.
- Đề xuất C/D review: chốt cơ chế đồng bộ theo bài/phiên bản, kiểm tra lại version
  khi giữ file để thu, và cơ chế lưu/khôi phục công việc xoá an toàn. Không xoá
  phiên bản đang được thu hoặc cho nhận/vé mới chen vào khi đang xoá bài.
- Ảnh hưởng/migration: C quản lý giao dịch/schema; D quản lý kho và lifecycle.
  Thay interface/schema qua quy trình review trước khi triển khai.
- Test: thu v1 đồng thời nộp v2; tạo vé khi đang xoá; crash trước/sau commit và
  trước/sau dọn file; callback lặp không mất dữ liệu còn dùng.

## 3. WebSocket, nguồn phát và hàng đợi

- Hiện tại: `packages/shared/src/ws.ts` đã định nghĩa union theo `type`, tương quan
  theo ticket ID, heartbeat và reconnect. Cần B/C/D review ngữ nghĩa queue/slot,
  quyền gửi và thứ tự đồng bộ lại với trạng thái vé.
- Đề xuất: mỗi request/response có correlation theo ticket ID; server là nguồn sự
  thật cho lease/slot và là nơi duy nhất cấp hoặc hủy vé. `serve.accept` phải gắn
  đúng ticket và có deadline; timeout/disconnect/hủy giải phóng lease đúng một lần.
  Chốt thứ tự reconnect: v1 hiện ghi announce seed trước, sau đó đồng bộ vé;
  cần thống nhất cách tránh cấp thêm lượt khi trạng thái cũ chưa được xử lý.
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

- Hiện tại: C đã cung cấp `GET /health` (kiểm tra DB và trả contract version);
  Compose đã cập nhật dùng route này. Không cần thêm `/healthz`.
- Đề xuất: C review Dockerfile trong workspace, Node 24, quyền ghi `/data` và
  image/CLI. D cấu hình `RELAY_ADDRESS`, `LIMIT_*` và `TRUST_PROXY` theo server;
  relay dùng healthcheck TCP của image croc, Caddy dùng admin API nội bộ.
- Cần C xác nhận user/UID của container và quyền ghi `/data`; deploy dùng bind
  mount để sao lưu file và SQLite thuận tiện.
- Bên ảnh hưởng: C (server route), D (Compose/ops).
- Tương thích/migration: không đổi endpoint; xác nhận port, build context và
  đường dẫn trước khi chốt Dockerfile.
- Kiểm chứng: cấu hình sai/tiến trình dừng được phát hiện; health response không
  tiết lộ relay password, token hoặc đường dẫn dữ liệu.

## Review cần thiết

| Reviewer | Phạm vi | Trạng thái |
|---|---|---|
| C | REST, DB, ticket authority, health endpoint, trạng thái chia sẻ | Chưa review |
| B | croc-engine, WS client, xác minh/tiến trình | Chưa review |
| D | worker, queue, relay, deploy, E2E | Đề xuất |

## Chính sách relay bị lộ / truyền treo

- Hiện tại: mật khẩu relay dùng chung được cấp cho client đăng nhập; thu hồi một
  phiên không tự làm mật khẩu đã biết mất hiệu lực. Timeout vé tối thiểu dựa trên
  dung lượng có thể dài nhiều giờ và chưa có ngưỡng không tiến triển.
- Đề xuất C/B/D review: khi lộ mật khẩu, điều phối dừng/cấp lại các lượt đang chạy,
  đổi đồng thời cấu hình relay/server, buộc client lấy lại cấu hình sau đăng nhập
  và thông báo giới hạn: client đã biết mật khẩu cũ còn dùng được đến lúc xoay.
  B/D thử nghiệm một ngưỡng idle timeout dựa trên tiến độ đáng tin cậy, phân biệt
  thời gian chờ ghép và đang truyền; không tự chốt trị số khi chưa có số đo.
- Ảnh hưởng/migration: B xử lý cấu hình lại/cancel, C cấp cấu hình và thu hồi
  phiên, D quản lý relay/worker. Mọi thay đổi hợp đồng cần review trước khi merge.
- Test: xoay mật khẩu khi truyền và khi client offline; client cũ thất bại rõ ràng,
  client có quyền lấy được cấu hình mới; truyền thật chậm không bị nhầm là treo.
