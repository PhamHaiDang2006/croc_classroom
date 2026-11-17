# Hợp đồng giao tiếp

**Trạng thái: hợp đồng v1 đã có định nghĩa thực thi trong mã nguồn (bootstrap M0, C, 2026-11-17)
nhưng CHƯA được các bên sử dụng review.** Chưa phần nào được coi là đã chốt. Không bắt đầu
triển khai phần phụ thuộc vào một nhóm hợp đồng khi cột "Review" của nhóm đó còn trống.

## Phiên bản

| Phiên bản | Ngày | Branch / PR | Nội dung | Trạng thái |
|---|---|---|---|---|
| v1 (đề xuất) | 2026-11-17 | `C/Backend` | Bản đầu cho REST, WS, IPC, engine, vé/worker, dữ liệu, manifest | Chờ review |

`CONTRACT_VERSION` trong `packages/shared/src/constants.ts` phải khớp bảng này; `/health` trả về số này.

## Nguồn sự thật

Mã nguồn là nguồn sự thật. File này chỉ ghi vị trí, quy tắc ngữ nghĩa và trạng thái review;
không chép lại schema.

| Nhóm | Định nghĩa | Bên quản lý | Bên review | Review |
|---|---|---|---|---|
| REST | [`packages/shared/src/rest.ts`](../packages/shared/src/rest.ts) — đối tượng `endpoints` | C | B, D | |
| DTO, mã lỗi, hằng số | [`dto.ts`](../packages/shared/src/dto.ts), [`errors.ts`](../packages/shared/src/errors.ts), [`constants.ts`](../packages/shared/src/constants.ts), [`common.ts`](../packages/shared/src/common.ts) | C | A, B, D | |
| WebSocket | [`packages/shared/src/ws.ts`](../packages/shared/src/ws.ts) | D | B, C | |
| IPC | [`packages/shared/src/ipc.ts`](../packages/shared/src/ipc.ts) | B | A | |
| croc-engine | [`packages/croc-engine/src/types.ts`](../packages/croc-engine/src/types.ts) | B | D | |
| Vé và worker (nội bộ server) | [`apps/server/src/ports/transfers.ts`](../apps/server/src/ports/transfers.ts) | D | C, B | |
| Manifest | [`packages/shared/src/manifest.ts`](../packages/shared/src/manifest.ts), [`node/manifest-fs.ts`](../packages/shared/src/node/manifest-fs.ts) | B, C | D | |
| Schema CSDL | [`apps/server/src/db/migrations.ts`](../apps/server/src/db/migrations.ts) | C | D | |

Người review ghi tên + ngày vào cột "Review" khi đồng ý, hoặc ghi đề xuất sửa vào
`docs/handoffs/<vai-tro>-contract-requests.md`.

## Mock và fixture dùng chung

| Thứ | Vị trí | Dùng cho |
|---|---|---|
| Dữ liệu mẫu đúng schema | `@croc-classroom/shared/fixtures` | Mọi bên; test `contracts.test.ts` kiểm tra từng mẫu |
| Mock `window.croc` trong bộ nhớ | `@croc-classroom/shared/mocks` → `createMockCrocApi()` | A làm giao diện khi chưa có main/preload |
| Engine giả ghép send/receive cùng tiến trình | `@croc-classroom/croc-engine/testing` → `createLoopbackEngine()` | B, D test khi chưa có engine thật |
| TicketIssuer giả | `apps/server/src/testing/fake-ticket-issuer.ts` | C test nghiệp vụ khi chưa có dịch vụ vé của D |

Kết quả chạy với mock không chứng minh luồng thật. Thông tin đăng nhập trong fixture là giả.

## Quy tắc ngữ nghĩa chung

**Dữ liệu**
- ID: UUID do server sinh. Client coi là chuỗi mờ.
- Thời gian: chuỗi ISO 8601 UTC có `Z`. Server lưu UTC; app hiển thị theo giờ máy.
- MSSV so sánh sau khi bỏ khoảng trắng hai đầu và viết hoa (`normalizeMssv`).
- Code phrase dạng `tu-tu-tu-NNN` (≈ 31 bit), không phân biệt hoa thường; client gõ lỏng được
  chuẩn hoá bằng `normalizeCodePhrase`.
- Mã kích hoạt Crockford base32 `XXXX-XXXX-XXXX`; so sánh sau `normalizeActivationCode`.

**Lỗi REST**
- Body lỗi luôn là `{ error: { code, message, details? } }`; HTTP status theo `ERROR_HTTP_STATUS`.
- `VALIDATION_FAILED` liệt kê mọi trường sai của params/query/body cùng lúc trong `details`.
- Tài nguyên không thuộc quyền người gọi trả `NOT_FOUND`, không tiết lộ sự tồn tại.
- Code phrase sai hoặc bài chưa phát hành đều trả `CODE_PHRASE_INVALID`.
- Server kiểm tra phản hồi theo schema trước khi gửi (`VALIDATE_RESPONSES`); lệch hợp đồng thành `INTERNAL`.

**Xử lý yêu cầu lặp**
- `POST /auth/logout`, `DELETE /assignments/:id/fetch`: gọi lại vô hại.
- `POST /join`: đã tham gia thì trả lại cùng thông tin.
- `POST /students/import`: MSSV đã tồn tại bị bỏ qua và báo lại (mã kích hoạt chỉ trả một lần).
- `POST /assignments/:id/fetch`, `/submit`, `/upload-ticket`: mỗi (bên nhận, bài, loại vé) chỉ có
  một vé chưa kết thúc. Yêu cầu mới huỷ vé cũ (`huy`, lý do `superseded`) rồi cấp vé mới.
- `POST /tickets/:id/result`: báo lặp cùng kết quả trả trạng thái hiện tại. Báo khác kết quả
  sau khi vé đã kết thúc trả `TICKET_STATE_INVALID`.
- `POST /assignments` không chống tạo trùng; GV xoá bài thừa.

**Vé** (D quản lý vòng đời)
- Trạng thái: `cho` → `dang_chay` → `xong` | `loi` | `het_han` | `huy`; hoặc `cho` → `het_han` | `huy`.
  Trạng thái kết thúc là cuối cùng. `huy` là bổ sung so với system-design mục 9.
- Hạn vé = `ticketLifetimeMs(bytes)` = max(2 phút, dung lượng / 100 KB/s).
- Ai xác nhận thành công:

  | Loại | Gửi → nhận | Xác nhận thành công |
  |---|---|---|
  | `gv_tai_len` | GV → VPS | Worker xác minh manifest và lưu vào kho (`onUploadStored`) |
  | `nop_bai` | SV → VPS | Worker xác minh và C commit trong transaction (`onSubmissionStored`) |
  | `phat_de` | nguồn → SV | SV báo `succeeded` sau khi xác minh manifest |
  | `gv_thu_bai` | VPS → GV | GV báo `succeeded` sau khi xác minh (`onCollectConfirmed`) |

  Báo cáo của bên gửi chỉ để tham khảo, không bao giờ xác nhận VPS đã lưu file.
- Server khởi động lại: mọi vé chưa kết thúc chuyển `huy` (lý do `server_restart`), dọn `tmp/`.

**Phiên bản bài nộp** (C)
- Mỗi lần nộp thành công là một dòng `submissions` với `version` = lớn nhất + 1, gán trong
  transaction khi worker báo đã lưu. Bản mới chỉ thay bản cũ sau khi đã xác minh.
- Vé `nop_bai` bị thay bằng vé mới trong lúc worker đang xác minh thì kết quả bị từ chối
  (`ticket_not_active`) và worker xoá bản vừa lưu. Vì mỗi SV chỉ có một vé nộp đang chạy cho một
  bài, các phiên bản không thể commit lẫn thứ tự.
- Chỉ phiên bản mới nhất còn file (`storage_ref`). GV thu theo `submissionId` của một phiên bản cụ
  thể; phiên bản đã bị thay trả `SUBMISSION_SUPERSEDED`. `collected_at` gắn với đúng phiên bản đó.
- Đổi hạn nộp không tính lại cờ trễ của các bản đã nộp.

**Manifest**
- Đường dẫn tương đối, dấu `/`, Unicode NFC. Cấm `.`/`..`, đường dẫn tuyệt đối, ký tự điều khiển,
  `\ < > : " | ? *`, tên kết thúc bằng dấu cách hoặc dấu chấm, tên dành riêng của Windows.
- Không trùng khi bỏ qua hoa thường; một đường dẫn không vừa là file vừa là thư mục cha.
- Chỉ có file thường; symlink bị từ chối khi tính, coi là thừa khi xác minh; thư mục rỗng không truyền.
- Giới hạn số file: `maxManifestFiles` (mặc định 10.000).
- Mã băm tổng: SHA-256 của `croc-classroom-manifest-v1\n` nối các dòng `<sha256> <size> <path>\n`
  sắp theo byte UTF-8 của đường dẫn. Giá trị tham chiếu nằm trong `manifest-fs.test.ts`.
- Quy ước gốc bộ file khi truyền: B định nghĩa trong croc-engine. Yêu cầu: sau `receive` thành công,
  file nằm ngay dưới `outDir` theo đúng đường dẫn trong manifest.

**IPC**
- `window.croc.invoke(channel, input)` luôn trả `IpcResult`, không ném lỗi. `on(event, listener)` trả
  hàm huỷ đăng ký.
- Renderer không nhận token, mật khẩu relay, code croc. Không gửi đường dẫn file: chọn qua
  `dialog.pickPayload` để nhận `selectionId`.
- Chỉ báo "đã nộp" khi sự kiện `transfer` của lượt nộp có `receipt`.

## Vấn đề còn mở

| Vấn đề | Đề xuất trong v1 | Còn thiếu | Người chốt |
|---|---|---|---|
| Xin lại vé tải đề, trạng thái phát hành, biên nhận sau mất kết nối | `POST /assignments/:id/upload-ticket`, WS `assignment.published`, `GET /tickets/:id`, `GET /assignments/:id/receipt` | Review | C, D |
| Báo bài phát hành / bị xoá, huỷ vé, dọn cache | WS `assignment.published`, `assignment.deleted`; `TicketIssuer.purgeAssignment` | Review | D, B |
| Thu đúng phiên bản, nộp đồng thời, kết quả đến lệch thứ tự | Xem "Phiên bản bài nộp" | D xác nhận worker giữ file phiên bản đang thu đến khi vé kết thúc | C, D |
| Nguồn xác nhận thành công từng loại vé | Bảng trong mục "Vé" | Review | D, C |
| Giải phóng slot đúng một lần, kết quả lặp, phục hồi sau restart | Trạng thái kết thúc là cuối cùng; restart → `huy` | Cách D cài đặt bể tiến trình | D |
| **Báo cáo sai hash** | Chưa đề xuất; `holdings.banned` có sẵn nhưng chưa dùng | Chính sách thay cho "cấm vĩnh viễn" của system-design 7.4 | D, cả nhóm |
| Tên file hoa/thường, tên không hợp lệ, symlink, số file | Xem "Manifest" | Review | B, C, D |
| **Mật khẩu relay bị lộ** | Chưa đề xuất | Cách đổi mật khẩu relay và giới hạn thu hồi | D, cả nhóm |
| Lượt truyền treo giữ slot VPS đến hết hạn (đề 1 GB ≈ 2,9 giờ) | Chưa đề xuất | Huỷ khi tiến trình không tăng sau một khoảng thời gian | D, B |
| Định dạng code croc và cách relay chia phòng | `CrocEngine.generateCode()` | B kiểm chứng với croc 10.7.0 khi nhiều lượt chạy song song | B |
| Tiêu chí hiệu năng và thử LAN thật | Chưa đề xuất | Con số đo được | Cả nhóm |

## Quy trình thay đổi

Đề xuất trong `handoffs/<vai-tro>-contract-requests.md`, ghi old/new, lý do, bên ảnh hưởng,
phương án tương thích/migration và test. C điều phối review; bên sử dụng phải biết thay đổi.
Merge hợp đồng vào nền chung trước, rồi cập nhật bên cung cấp và bên sử dụng. Thay đổi
không tương thích thì tăng `CONTRACT_VERSION` và thêm dòng vào bảng phiên bản.
