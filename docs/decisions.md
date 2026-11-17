# Quyết định và vấn đề đang mở

Yêu cầu nghiệp vụ gốc nằm trong `system-design.md`. Tài liệu phối hợp không tự động
thay đổi các yêu cầu đã chốt ở đó.

## Quy ước phối hợp được đề xuất cho nhóm

- Bốn vai trò A/B/C/D theo `team-plan.md`; chưa gán tên thành viên.
- Chốt hợp đồng và dựng nền chung ở M0 trước khi triển khai song song phần phụ thuộc.
- C quản lý cấu hình gốc/shared; bên sử dụng cùng review thay đổi interface.
- Kiểm chứng bằng mock và tích hợp thật phải báo cáo riêng.

## Cần chốt ở M0

| Vấn đề | Người điều phối | Trạng thái |
|---|---|---|
| Tên thành viên, thời hạn và người tích hợp/review thực tế | Nhóm | Chưa chốt |
| Package manager, phiên bản công cụ, schema library, test runner | C, phối hợp B/D | Đề xuất: D-001 |
| Hợp đồng v1 REST/WS/IPC/engine/worker | C, phối hợp A/B/D | Đề xuất: D-002 – D-006, chờ review |
| Vòng đời vé và phục hồi sau restart | D, phối hợp B/C | Đề xuất trong contracts.md, chờ D |
| Nộp lại đồng thời, lưu version và xác nhận thu bài | C, phối hợp B/D | Đề xuất: D-005 |
| Chính sách xử lý báo cáo hash sai và mật khẩu relay lộ | D, phối hợp C | Cần review thay đổi thiết kế; chưa có đề xuất |
| Quy tắc file đa nền tảng và manifest hash tổng | B, phối hợp C/D | Đề xuất: D-004 |
| Máy Mac, VPS, mạng trường và tiêu chí hiệu năng | Nhóm | Chưa xác nhận môi trường |

## Quyết định

### D-001 — Công cụ của workspace

- 2026-11-17 · **Đề xuất** · Người đề xuất: C · Review: B, D (chưa)
- Chọn: npm workspaces (npm 11), Node 24 LTS, TypeScript 6.0, zod 4 (schema dùng chung cho
  server, main, renderer), vitest 5, ESLint 10 + typescript-eslint, Fastify 5, better-sqlite3 13
  với migration SQL viết tay, CI GitHub Actions (Ubuntu, Node 24).
- Lý do: npm có sẵn, không cần cài thêm; zod chạy được ở cả trình duyệt lẫn Node, cho phép kiểm
  tra runtime ở cả hai đầu từ một định nghĩa; better-sqlite3 đồng bộ, đơn giản cho một server.
- Đánh đổi: TypeScript ghim `~6.0` vì typescript-eslint 8.73 chưa hỗ trợ TypeScript 7.
  better-sqlite3 là module native nhưng gói 13.x kèm sẵn bản build trong `prebuilds/` cho Linux
  (glibc và musl), Windows, macOS, x64 và arm64. npm 11 không chạy install script khi chưa được
  duyệt (`allowScripts`) nên `npm ci` in cảnh báo về `node-gyp rebuild` của better-sqlite3 —
  **cảnh báo này bình thường, không duyệt script đó**; duyệt sẽ bắt biên dịch lại bằng node-gyp.
  Đã kiểm chứng: sau `npm ci`, server mở được SQLite từ bản build sẵn (Linux x64).
- Ảnh hưởng: mọi gói. Khung Electron (electron-vite, React, electron-builder) do B chọn và dựng.

### D-002 — Dạng hợp đồng: định nghĩa trong mã, không chép lại trong tài liệu

- 2026-11-17 · **Đề xuất** · Người đề xuất: C · Review: A, B, D (chưa)
- Chọn: mỗi endpoint REST là một đối tượng `defineEndpoint` (method, path, quyền, schema
  params/query/body/response, mã thành công, mã lỗi). Server đăng ký route qua `registerEndpoint`,
  tự kiểm tra đầu vào và phản hồi. Client B dùng cùng đối tượng để gọi. WS là union phân biệt theo `type`.
  IPC là bảng kênh → schema đầu vào + bảng kiểu đầu ra; `window.croc` chỉ có `invoke` và `on`.
- Lý do: một nguồn sự thật, lệch hợp đồng bị bắt bằng typecheck hoặc lúc chạy.
- `shared` tách hai phần: phần dùng cho renderer (không Node.js, ESLint chặn) và `shared/node`.

### D-003 — Tên, đường dẫn và hình dạng API khác bản phác thảo system-design mục 10

- 2026-11-17 · **Đề xuất** · Người đề xuất: C · Review: B, D (chưa)
- Mục 10 cho phép builder đổi tên và hình dạng. Thay đổi so với bản phác thảo:
  - Thêm `POST /assignments/:id/upload-ticket`, `GET /my/assignments/:id`,
    `GET /assignments/:id/receipt`, `GET /tickets/:id`, `DELETE /assignments/:id/fetch`, `GET /health`.
  - Cấp lại mã kích hoạt tách thành `POST /students/:id/activation-code` (trả secret, không lặp
    lại được), `PATCH /students/:id` chỉ còn vô hiệu hoá / mở lại.
  - `POST /auth/activate` trả luôn phiên đăng nhập.
  - Nhập CSV có lỗi định dạng thì không tạo tài khoản nào.
  - WS thêm `welcome`, `ticket.updated`, `queue.position`, `assignment.published`,
    `assignment.deleted`, `seed.rejected`, `error`.
  - Trạng thái vé thêm `huy`.

### D-004 — Quy tắc manifest và mã băm tổng

- 2026-11-17 · **Đề xuất** · Người đề xuất: C (bootstrap) · Review: B, D (chưa)
- Chi tiết trong contracts.md mục "Manifest". Điểm có thể gây tranh luận: tên trùng tên dành riêng
  của Windows bị từ chối trên mọi hệ điều hành, kể cả từ tiếng Việt `con`, vì không tạo được trên
  Windows; manifest không được rỗng; giới hạn 10.000 file.
- Code phrase dạng `tu-tu-tu-NNN` với 128 từ (≈ 31 bit); khác ví dụ `sao-mai-xanh-42` ở số có 3 chữ số.

### D-005 — Phiên bản bài nộp và thu bài

- 2026-11-17 · **Đề xuất** · Người đề xuất: C · Review: D, B (chưa)
- Mỗi lần nộp thành công là một dòng `submissions`; chỉ phiên bản mới nhất còn file. Yêu cầu nộp mới
  thay vé nộp cũ; commit kiểm tra vé còn `dang_chay`. GV thu theo ID phiên bản. Chi tiết trong
  contracts.md mục "Phiên bản bài nộp".
- Cột `storage_path` của system-design mục 9 đổi thành `storage_ref`: tham chiếu mờ do worker (D) cấp.
- Cần D xác nhận: worker giữ file của phiên bản đang được thu đến khi vé `gv_thu_bai` kết thúc.

### D-006 — Code croc sinh trong croc-engine thay vì shared

- 2026-11-17 · **Đề xuất** · Người đề xuất: C · Review: B (chưa)
- README của shared ghi code croc nằm trong shared. Đề xuất chuyển sang `CrocEngine.generateCode()`
  vì định dạng phụ thuộc croc (cách relay chia phòng theo code). B kiểm chứng với croc 10.7.0.

### D-007 — Cách làm phần tài khoản (M1)

- 2026-11-17 · **Đề xuất** · Người đề xuất: C · Review: B, D (chưa)
- **Argon2id có sẵn trong Node 24** (`crypto.argon2`, có từ 24.7): không thêm thư viện native. Đã đối
  chiếu với vector kiểm thử RFC 9106 §5.3 (test tự động). Tham số tối thiểu theo OWASP: 19 MiB, 2 lượt,
  1 luồng (~20 ms mỗi lần băm trên máy phát triển). Lưu dạng PHC nên đổi thư viện sau này vẫn đọc được.
- **Token phiên và mã kích hoạt băm bằng SHA-256**, không dùng Argon2: đây là bí mật ngẫu nhiên entropy
  cao (256 bit / 60 bit, mã sống 14 ngày, có giới hạn tần suất), không đoán theo từ điển được; nhập
  100 SV không phải chạy 100 lần Argon2.
- **Giới hạn tần suất chỉ theo (tài khoản + IP)**, không giới hạn riêng theo IP: cả lớp thường chung
  một IP công khai của trường; giới hạn theo IP sẽ khoá cả lớp. Bộ đếm trong bộ nhớ, mất khi khởi động lại.
- **Tiết lộ tối thiểu**: `ACCOUNT_DISABLED` chỉ báo khi mật khẩu đúng. `ACCOUNT_NOT_ACTIVATED` có tiết lộ
  MSSV tồn tại nhưng chưa kích hoạt — chấp nhận vì danh sách MSSV vốn không bí mật và SV cần biết để kích hoạt.
- Kích hoạt lại (sau khi GV cấp lại mã) thu hồi mọi phiên cũ; mật khẩu cũ vẫn dùng được đến khi kích hoạt lại.
- `POST /auth/logout` đổi sang `auth: 'none'` (xem contracts.md, bảng phiên bản).
- CLI không nhận mật khẩu qua tham số dòng lệnh (lộ trong lịch sử shell và danh sách tiến trình).

### D-008 — Bài tập và nhập code (M2, phía C)

- 2026-11-17 · **Đề xuất** · Người đề xuất: C · Review: D, B (chưa)
- Tạo bài: ghi bài trước (vé của D tham chiếu `assignments` qua khoá ngoại) rồi mới mở vé `gv_tai_len`;
  mở vé lỗi thì xoá bài, để không có bài treo mà GV không tải lên được.
- Xoá bài: gọi `purgeAssignment` của D (huỷ vé, báo seeder, xoá file) TRƯỚC, xong mới xoá dữ liệu; D lỗi
  thì bài còn nguyên để GV xoá lại, tránh trường hợp xoá dữ liệu mà file vẫn nằm trên VPS.
- Phân chia ghi dữ liệu với D: C ghi `assignments.status/published_at/storage_ref` (qua `onUploadStored`)
  và `participants.received_*` (qua `onFetchVerified` — bổ sung vào interface). D ghi `holdings` và gửi
  WS `assignment.published` sau khi `onUploadStored` trả về. `stats.seeding` lấy từ `SeedingStats` của D.
- Thêm cột `assignments.storage_ref` (migration 2): tham chiếu mờ tới bản đề trong kho, do worker cấp.
- Server chạy được trước khi có D: mặc định `unavailableTicketIssuer` (tạo bài → 503 có thông báo rõ);
  `DEV_FAKE_TRANSFERS=true` dùng vé giả, bài tự phát hành sau ~1 giây, log cảnh báo khi khởi động —
  chỉ để A/B thử giao diện với server thật, không bao giờ bật trên VPS.

### D-009 — Nộp bài, phiên bản và thu bài (M3, phía C)

- 2026-11-17 · **Đề xuất** · Người đề xuất: C · Review: D (chưa)
- **Commit phiên bản nguyên tử**: `onSubmissionStored` chạy trong một transaction SQLite đồng bộ: kiểm vé
  `nop_bai` còn `dang_chay` và khớp (bài, SV) → ghi phiên bản mới → bỏ `storage_ref` của bản cũ → chuyển vé
  sang `xong` và ghi `tickets.submission_id`. C ghi vào bảng `tickets` (của D) ở bước cuối để việc kiểm
  vé và commit không thể bị chen giữa; D không cần tự chuyển vé nộp bài sang `xong`.
- **An toàn khi D thử lại**: gọi lặp cho vé đã commit trả lại cùng biên nhận thay vì từ chối — nếu từ chối,
  worker sẽ xoá file của một phiên bản đã được ghi nhận.
- **Mã băm tổng do C tự tính** từ manifest (bỏ `manifestHash` khỏi sự kiện), một nguồn duy nhất.
- **Sửa quy tắc "một vé chưa kết thúc"**: khoá theo loại vé (bài / (SV, bài) / phiên bản bài nộp). Quy tắc
  cũ "(bên nhận, bài, loại vé)" sẽ khiến GV thu bài của SV này huỷ vé thu bài của SV khác, và vé nộp của
  SV này huỷ vé nộp của SV khác (bên nhận đều là VPS).
- **Không tiết lộ biên nhận**: SV chưa tham gia / chưa nộp → `NOT_FOUND`; nộp vào bài chưa tham gia →
  `NOT_PARTICIPANT` (theo hợp đồng; ID bài là UUID không đoán được).
- `DEV_FAKE_TRANSFERS=true` giờ tự hoàn tất cả tải đề, nộp bài và thu bài (không truyền file).

## Mẫu ghi một quyết định

- Mã / ngày / trạng thái: đề xuất, đã thống nhất hoặc thay thế.
- Vấn đề và bằng chứng.
- Phương án chọn, lý do và đánh đổi.
- Module và bên sử dụng bị ảnh hưởng.
- Người đề xuất và người review.
- Hợp đồng/migration/kiểm thử cần cập nhật.

Không đánh dấu “đã thống nhất” chỉ vì một AI tự chọn phương án ảnh hưởng cả nhóm.
