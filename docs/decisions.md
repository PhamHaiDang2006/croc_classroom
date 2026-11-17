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

## Mẫu ghi một quyết định

- Mã / ngày / trạng thái: đề xuất, đã thống nhất hoặc thay thế.
- Vấn đề và bằng chứng.
- Phương án chọn, lý do và đánh đổi.
- Module và bên sử dụng bị ảnh hưởng.
- Người đề xuất và người review.
- Hợp đồng/migration/kiểm thử cần cập nhật.

Không đánh dấu “đã thống nhất” chỉ vì một AI tự chọn phương án ảnh hưởng cả nhóm.
