# apps/server/src/assignments

Bài tập: tạo bài, code phrase, manifest, phát hành, thống kê, sinh viên tham gia bằng code.

Thiết kế: mục 7.3, 7.4 (bước nhập code) và 7.6 (thống kê) trong [system-design.md](../../../../docs/system-design.md).
Quyết định: D-008 trong [decisions.md](../../../../docs/decisions.md).

## Cấu trúc

| File | Việc |
|---|---|
| `index.ts` | `createAssignments()`: dịch vụ + route; nhận `TicketIssuer` (D) và `SeedingStats` (D) |
| `service.ts` | `AssignmentsService`: tạo/sửa/xoá bài, phát hành, `/join`, thống kê; triển khai `onUploadStored`, `onFetchVerified` |
| `routes.ts` | Đăng ký endpoint qua `registerEndpoint` |

`index.ts` dùng dịch vụ vé thật của D (`distribution/`), hoặc `FakeTicketIssuer` tự phát hành khi đặt
`DEV_FAKE_TRANSFERS=true` (chỉ để thử giao diện).

## Việc cần làm

- [x] `POST /assignments` (giảng viên):
  - [x] Kiểm tra manifest: tổng dung lượng ≤ 1 GB, số file ≤ giới hạn, đường dẫn hợp lệ.
  - [x] Tạo bài ở trạng thái `dang_tai_len` và sinh code phrase không trùng.
  - [x] Nhờ dịch vụ vé (D) mở vé `gv_tai_len`; không mở được vé thì không tạo bài.
- [x] Khi worker báo đã nhận đủ và xác minh xong (`onUploadStored`), chuyển bài sang `da_phat_hanh`, lưu `storage_ref`.
  - [x] Nếu lỗi: giữ nguyên trạng thái và cho phép giảng viên xin vé tải lên lại (`POST /assignments/:id/upload-ticket`).
- [x] `GET /assignments` và `GET /assignments/:id` kèm thống kê: số sinh viên đã tham gia, đã nhận đề, đang chia sẻ, đã nộp, nộp trễ, chưa nộp.
- [x] `PATCH /assignments/:id`: chỉ sửa tiêu đề, mô tả, hạn nộp. **Không** sửa file.
- [x] `DELETE /assignments/:id`:
  - [x] Nhờ D (`purgeAssignment`) xoá đề và mọi bài nộp trên đĩa, báo các seeder ngừng chia sẻ; xong mới xoá dữ liệu.
  - [ ] Kiểm chứng xoá sạch file trên VPS thật: chờ worker của D.
- [x] `POST /join` (sinh viên):
  - [x] Tra code phrase, không phân biệt hoa thường; chỉ chấp nhận bài đã phát hành.
  - [x] Giới hạn số lần nhập sai code (10 lần / 5 phút / tài khoản + IP).
  - [x] Giới hạn số SV mỗi bài (`maxStudentsPerAssignment`).
  - [x] Tạo bản ghi `participants` và trả về thông tin bài + manifest.
- [x] `GET /my/assignments`, `GET /my/assignments/:id` (sinh viên): các bài đã tham gia, hạn nộp, trạng thái nhận đề và biên nhận mới nhất.
- [x] Ghi nhận SV đã nhận đề (`onFetchVerified`, D gọi).
- [x] Kiểm thử (`test/assignments.test.ts`):
  - [x] Code phrase không dùng được khi bài còn `dang_tai_len`.
  - [x] Nhập sai code nhiều lần thì bị chặn.
  - [x] Xoá bài thì nhờ D dọn file và xoá sạch dữ liệu (file thật: chờ D).
  - [x] Sinh viên không xem được bài mình chưa tham gia.
