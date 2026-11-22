# Yêu cầu hợp đồng của vai trò D

> Review D đối với bản tích hợp 2026-11-21. Các nguyên tắc C–D dưới đây là
> phương án D đồng ý để đưa ra review, không phải phê duyệt thay cho B hoặc C.
> Không thay schema hay triển khai phần phụ thuộc trước khi các bên thống nhất.

- Mốc: review đề xuất v1 sau khi tích hợp C/Backend
- Trạng thái: D đã đối chiếu phần lifecycle và ghi nhận các điểm còn mở; chờ B/C review
- Phiên bản hợp đồng: v1 đề xuất, chưa được các bên sử dụng chốt

## Phần D đồng ý đưa ra review

- Upload và nộp bài chỉ được báo hoàn tất sau khi worker xác minh manifest và C
  chấp nhận commit vé cùng dữ liệu nghiệp vụ; D không tự commit dữ liệu đó.
  Khi retry upload, giữ `storageRef` đã commit, không xoá nhầm file đang dùng.
  Kết quả bị từ chối thì dọn payload riêng của lượt đó.
- Dùng `withAssignmentLock` theo bài trên cùng `Db` trong một tiến trình server.
  Khi C gọi `open*`/`purgeAssignment` dưới lock, D không lấy lại lock và không
  chờ callback cần lock đó. Fetch và GC thông thường do D khởi tạo dùng cùng lock
  và kiểm tra bài khả dụng; purge xử lý riêng bài đã mang dấu `deleting`.
- `openCollect` ghi vé hoạt động trước khi trả về. File bản nộp đang được thu
  phải được giữ đến khi vé kết thúc. `payload_gc` là nguồn công việc dọn bền vững:
  dưới lock, dùng `pendingPayloadCleanup`, xoá file trước rồi mới xoá dòng GC;
  retry sau crash phải an toàn, không chỉ dựa vào `supersededStorageRefs` trong RAM.
- `onCollectConfirmed` trả `void`: D đọc lại trạng thái vé trước khi phát sự kiện
  hoàn tất. Sau restart cần huỷ vé chưa kết thúc, tiếp tục purge bài `deleting`,
  GC và dọn payload mồ côi chưa commit.
- `onFetchVerified` không tự xác thực vé hay lấy lock: D phải kiểm tra quyền,
  loại vé, bài, người nhận, trạng thái và hạn trước khi gọi; chỉ ghi holdings
  và báo thành công cho kết quả hợp lệ. Chi tiết đồng bộ với huỷ/restart cần C review.

Các nguyên tắc này khớp interface và đường xử lý C hiện có, không chứng minh
worker D đã được triển khai hoặc tích hợp thật. Xem các mục còn mở bên dưới.

## 1. Quyền xác nhận và vòng đời vé

- Hiện tại: `contracts.md` v1 đã quy định nguồn xác nhận theo loại vé, trạng thái
  cuối và xử lý lặp. Cần review việc thực thi khi worker hoàn tất đồng thời với
  huỷ, hết hạn, xin lại vé hoặc xoá bài.
- Đề xuất: mỗi vé có ID ổn định và chuyển trạng thái idempotent; worker là bên duy
  nhất xác nhận upload đề/nộp bài đã lưu trên VPS sau khi xác minh manifest. Với
  `phat_de` và `gv_thu_bai`, client bên nhận báo hoàn tất sau khi tự xác minh
  manifest; lời báo thành công của bên gửi không thay cho xác nhận của bên nhận.
- Bên ảnh hưởng: C (REST, DB, quyền), B (engine/client), D (worker, queue).
- Tương thích/migration: chốt trước khi có schema/ticket implementation; không
  thay endpoint hoặc payload đã triển khai.
- Kiểm chứng: gửi lặp cùng kết quả không tăng version/giải phóng slot hai lần;
  kết quả sai vai trò bị từ chối; restart không làm vé hoàn tất giả.

### Upload đề bị thay hoặc hết hạn

- Đã sửa trong bản đề xuất: C kiểm tra vé đúng loại/bài, trạng thái và hạn;
  transaction phát hành bài và kết thúc vé. `UploadCommitResult` phân biệt từ
  chối, commit mới và retry với tham chiếu đã commit.
- D đồng ý với hướng này, chờ C/B review; worker thật phải xử lý kết quả và
  cleanup theo phần trên. Không cần yêu cầu lại interface `void` cũ.
- Test C hiện có bao phủ vé bị thay/hết hạn, retry, vé sai và callback sau xoá;
  chưa kiểm chứng cleanup hoặc WS của worker thật.

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

### Cô lập đường dẫn khi nhận

- Interface B yêu cầu `receive` không ghi ngoài `outDir`, nhưng gợi ý kiểm tra
  sau khi nhận; kiểm tra sau không ngăn được ghi ra ngoài nếu điều đó đã xảy ra.
- Đề nghị B xác định và kiểm chứng cơ chế ngăn thoát thư mục trong lúc nhận,
  kể cả đường dẫn và liên kết không an toàn; D cần bảo đảm này cho vùng tạm VPS.
  Không kết luận croc thật hiện an toàn hay không khi chưa thử.
- Bên ảnh hưởng: B (engine), D (worker). Không đổi interface hiện tại; cần B/D
  review cách thực thi trước khi dùng thật.
- Test: dữ liệu đầu vào có đường dẫn thoát và liên kết, xác nhận không tạo hoặc
  sửa file ngoài `outDir`, đồng thời trả lỗi rõ ràng.

### Giữ phiên bản đang thu và xoá bài đồng thời

- Đã sửa trong bản đề xuất: lock theo bài, dấu `deleting` bền vững và bảng
  `payload_gc` giải quyết phần đồng bộ và lưu công việc dọn ở phía C.
- D đồng ý với các trách nhiệm worker nêu trên; C quản lý schema, D quản lý kho
  và phục hồi. Cần B/C review trước khi triển khai phần phụ thuộc.
- Test C hiện có kiểm tra thu v1 đồng thời nộp v2, GC và purge lỗi rồi retry.
  Còn cần test worker thật và crash trước/sau commit, xoá file và xoá dòng GC.

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

### Thu hồi phiên WebSocket

- `SessionService.onUserSessionsRevoked` thông báo khi thu hồi mọi phiên của user;
  `revoke` và `revokeByToken` không phát thông báo đó. Không được giả định logout
  một phiên đã tự đóng WS đang mở hoặc phiên đã hết hạn được kiểm tra lại.
- Đề nghị C/D/B chốt cách kiểm tra/thu hồi theo từng session và hết hạn cho WS,
  không thay `SessionResolver` hay schema đơn phương.
- Kiểm chứng: logout một phiên chỉ đóng đúng kết nối liên quan; hết hạn và vô hiệu
  hoá tài khoản đóng kết nối phù hợp, không cho tiếp tục nhận hoặc gửi lệnh.

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
| D | lifecycle C–D | Đã đối chiếu, đồng ý đưa các nguyên tắc ở trên ra review |
| D | WS, queue, relay, engine và deploy | Còn đề xuất/cần làm rõ; chưa chốt toàn bộ |

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
