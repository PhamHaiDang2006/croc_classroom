# apps/server/src/assignments

Bài tập: tạo bài, code phrase, manifest, phát hành, thống kê, sinh viên tham gia bằng code.

Thiết kế: mục 7.3, 7.4 (bước nhập code) và 7.6 (thống kê) trong [system-design.md](../../../../docs/system-design.md).

## Việc cần làm

- [ ] `POST /assignments` (giảng viên):
  - [ ] Kiểm tra manifest: tổng dung lượng ≤ 1 GB, đường dẫn hợp lệ.
  - [ ] Tạo bài ở trạng thái `dang_tai_len` và sinh code phrase không trùng.
  - [ ] Nhờ [`vps-worker`](../vps-worker/README.md) mở vé `gv_tai_len`.
- [ ] Khi worker báo đã nhận đủ và xác minh xong, chuyển bài sang `da_phat_hanh`.
  - [ ] Nếu lỗi: giữ nguyên trạng thái và cho phép giảng viên xin vé tải lên lại.
- [ ] `GET /assignments` và `GET /assignments/:id` kèm thống kê: số sinh viên đã tham gia, đã nhận đề, đang chia sẻ, đã nộp, nộp trễ, chưa nộp.
- [ ] `PATCH /assignments/:id`: chỉ sửa tiêu đề, mô tả, hạn nộp. **Không** sửa file.
- [ ] `DELETE /assignments/:id`:
  - [ ] Xoá bài, đề và mọi bài nộp trên đĩa.
  - [ ] Báo các seeder ngừng chia sẻ bài này.
- [ ] `POST /join` (sinh viên):
  - [ ] Tra code phrase, không phân biệt hoa thường; chỉ chấp nhận bài đã phát hành.
  - [ ] Giới hạn số lần nhập sai code.
  - [ ] Tạo bản ghi `participants` và trả về thông tin bài + manifest.
- [ ] `GET /my/assignments` (sinh viên): các bài đã tham gia, hạn nộp, trạng thái nhận đề và nộp bài.
- [ ] Kiểm thử:
  - [ ] Code phrase không dùng được khi bài còn `dang_tai_len`.
  - [ ] Nhập sai code nhiều lần thì bị chặn.
  - [ ] Xoá bài thì xoá sạch file.
  - [ ] Sinh viên không xem được bài mình chưa tham gia.
